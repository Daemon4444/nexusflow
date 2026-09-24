import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { closeDb, db } from "../db/client";
import { getProviderById } from "../data/providers";
import { encryptProviderSecret } from "../utils/provider-secrets";
import { getUpstreamModelId } from "../utils/upstream-model-aliases";
import { HIMODELS_PUBLIC_MODEL_IDS } from "../services/providers";
import { assertProviderEndpointForStorage } from "../services/outbound-url-policy";

const PROVIDER_ID = "himodels";
const BASE_URL = "https://api.himodels.ai/v1";
const KEY_PATH = "/run/nexusflow-himodels-key";
const CAPACITY = {
  rpm: 1_000,
  tpm: 1_000_000,
  daily: 100_000,
  concurrency: 0,
  priority: 10,
  weight: 100,
};

function fail(message: string): never {
  throw new Error(message);
}

function assertRoot(): void {
  if (typeof process.geteuid !== "function" || process.geteuid() !== 0) {
    fail("HiModels control must run as root");
  }
}

function readPrivateKey(keyPath: string): string {
  assertRoot();
  const resolved = path.resolve(keyPath);
  if (resolved !== KEY_PATH) fail("HiModels key must use the approved private staging path");
  const descriptor = fs.openSync(resolved, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
  try {
    const stat = fs.fstatSync(descriptor);
    if (
      !stat.isFile()
      || stat.uid !== 0
      || stat.gid !== 0
      || (stat.mode & 0o777) !== 0o600
      || stat.size < 20
      || stat.size > 4_096
    ) {
      fail("HiModels key file must be root:root mode 0600 with a valid size");
    }
    const key = fs.readFileSync(descriptor, "utf8").trim();
    if (!key || /[\r\n]/.test(key)) fail("HiModels key file contains invalid data");
    return key;
  } finally {
    fs.closeSync(descriptor);
  }
}

function parseSse(body: string): { completed: boolean; usage: boolean } {
  let completed = false;
  let usage = false;
  for (const block of body.split(/\r?\n\r?\n/)) {
    for (const line of block.split(/\r?\n/)) {
      if (!line.startsWith("data:")) continue;
      const raw = line.slice(5).trim();
      if (!raw || raw === "[DONE]") continue;
      try {
        const event = JSON.parse(raw);
        if (event?.type === "message_start" || event?.type === "message_delta") {
          usage = usage || !!event?.message?.usage || !!event?.usage;
        }
        if (event?.type === "message_stop") completed = true;
      } catch {}
    }
  }
  return { completed, usage };
}

async function verifyModel(key: string, publicModelId: string): Promise<void> {
  const upstreamModelId = getUpstreamModelId(publicModelId, PROVIDER_ID);
  if (upstreamModelId === publicModelId || !upstreamModelId.endsWith("-aws")) {
    fail(`${publicModelId}: AWS alias is not configured`);
  }
  const baseBody = {
    model: upstreamModelId,
    max_tokens: 16,
    messages: [{ role: "user", content: "Reply OK" }],
  };
  const headers = {
    "x-api-key": key,
    "anthropic-version": "2023-06-01",
    "content-type": "application/json",
  };
  const response = await fetch(`${BASE_URL}/messages`, {
    method: "POST",
    headers,
    body: JSON.stringify(baseBody),
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) fail(`${publicModelId}: non-streaming verification failed with HTTP ${response.status}`);
  const value = await response.json() as { usage?: { input_tokens?: number; output_tokens?: number } };
  if (!value.usage || !Number.isFinite(value.usage.input_tokens) || !Number.isFinite(value.usage.output_tokens)) {
    fail(`${publicModelId}: non-streaming usage is incomplete`);
  }

  const streamResponse = await fetch(`${BASE_URL}/messages`, {
    method: "POST",
    headers,
    body: JSON.stringify({ ...baseBody, stream: true }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!streamResponse.ok) fail(`${publicModelId}: streaming verification failed with HTTP ${streamResponse.status}`);
  const stream = parseSse(await streamResponse.text());
  if (!stream.completed || !stream.usage) fail(`${publicModelId}: streaming response is incomplete`);
}

async function verifyKey(key: string): Promise<void> {
  for (const modelId of HIMODELS_PUBLIC_MODEL_IDS) await verifyModel(key, modelId);
}

async function disableRoutes(reason: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(
      "UPDATE provider_capacity SET is_enabled = FALSE, updated_at = NOW() WHERE provider_id = ? AND model_id LIKE 'claude-%'",
      [PROVIDER_ID]
    );
    await tx.execute(
      "UPDATE providers SET status = 'disabled', rejection_reason = ?, approved_at = NULL, updated_at = NOW() WHERE id = ?",
      [reason, PROVIDER_ID]
    );
  });
}

async function stage(keyPath: string): Promise<void> {
  const key = readPrivateKey(keyPath);
  await assertProviderEndpointForStorage(BASE_URL);
  const encryptedKey = encryptProviderSecret(key);
  await db.transaction(async (tx) => {
    const provider = await tx.queryOne<{ id: string }>("SELECT id FROM providers WHERE id = ? FOR UPDATE", [PROVIDER_ID]);
    if (!provider) fail("HiModels provider has not been initialized");
    await tx.execute(
      `UPDATE providers
          SET name = 'HiModels', api_base_url = ?, api_key = ?, status = 'disabled',
              rejection_reason = 'Pending AWS model verification', approved_at = NULL, updated_at = NOW()
        WHERE id = ?`,
      [BASE_URL, encryptedKey, PROVIDER_ID]
    );
    await tx.execute(
      "UPDATE provider_capacity SET is_enabled = FALSE, updated_at = NOW() WHERE provider_id = ? AND model_id LIKE 'claude-%'",
      [PROVIDER_ID]
    );
    for (const modelId of HIMODELS_PUBLIC_MODEL_IDS) {
      await tx.execute(
        `INSERT INTO provider_capacity (
           id, provider_id, model_id, rpm_limit, tpm_limit, daily_limit,
           concurrent_limit, priority, weight, is_enabled, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, FALSE, NOW(), NOW())
         ON CONFLICT(provider_id, model_id) DO UPDATE SET
           rpm_limit = EXCLUDED.rpm_limit,
           tpm_limit = EXCLUDED.tpm_limit,
           daily_limit = EXCLUDED.daily_limit,
           concurrent_limit = EXCLUDED.concurrent_limit,
           priority = EXCLUDED.priority,
           weight = EXCLUDED.weight,
           is_enabled = FALSE,
           updated_at = NOW()`,
        [
          randomUUID(), PROVIDER_ID, modelId, CAPACITY.rpm, CAPACITY.tpm,
          CAPACITY.daily, CAPACITY.concurrency, CAPACITY.priority, CAPACITY.weight,
        ]
      );
    }
  });
  fs.unlinkSync(path.resolve(keyPath));
  console.log(JSON.stringify({ providerId: PROVIDER_ID, staged: true, verified: false, enabled: false }));
}

async function storedKey(): Promise<string> {
  const provider = await getProviderById(PROVIDER_ID);
  if (!provider?.api_key || provider.api_base_url !== BASE_URL) fail("HiModels provider is not staged");
  return provider.api_key;
}

async function verify(): Promise<void> {
  const key = await storedKey();
  try {
    await verifyKey(key);
  } catch (error) {
    await disableRoutes("AWS model verification failed");
    throw error;
  }
  console.log(JSON.stringify({ providerId: PROVIDER_ID, verified: true, models: HIMODELS_PUBLIC_MODEL_IDS }));
}

async function activate(): Promise<void> {
  const key = await storedKey();
  try {
    await verifyKey(key);
  } catch (error) {
    await disableRoutes("AWS model activation verification failed");
    throw error;
  }
  await db.transaction(async (tx) => {
    await tx.execute(
      "UPDATE provider_capacity SET is_enabled = FALSE, updated_at = NOW() WHERE provider_id = ? AND model_id LIKE 'claude-%'",
      [PROVIDER_ID]
    );
    for (const modelId of HIMODELS_PUBLIC_MODEL_IDS) {
      const changed = await tx.execute(
        "UPDATE provider_capacity SET is_enabled = TRUE, updated_at = NOW() WHERE provider_id = ? AND model_id = ?",
        [PROVIDER_ID, modelId]
      );
      if (changed !== 1) fail(`${modelId}: managed capacity is missing`);
    }
    await tx.execute(
      "UPDATE providers SET status = 'enabled', rejection_reason = NULL, approved_at = NOW(), updated_at = NOW() WHERE id = ?",
      [PROVIDER_ID]
    );
  });
  console.log(JSON.stringify({ providerId: PROVIDER_ID, verified: true, enabled: true, models: HIMODELS_PUBLIC_MODEL_IDS }));
}

async function status(): Promise<void> {
  const provider = await getProviderById(PROVIDER_ID);
  const rows = await db.queryMany<{ model_id: string; is_enabled: boolean }>(
    "SELECT model_id, is_enabled FROM provider_capacity WHERE provider_id = ? AND model_id LIKE 'claude-%' ORDER BY model_id",
    [PROVIDER_ID]
  );
  console.log(JSON.stringify({
    providerId: PROVIDER_ID,
    providerStatus: provider?.status || "missing",
    credentialStored: !!provider?.api_key,
    expectedModels: HIMODELS_PUBLIC_MODEL_IDS,
    routes: rows.map((row) => ({ modelId: row.model_id, enabled: !!row.is_enabled })),
  }));
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  if (command === "stage" && args.length === 1) await stage(args[0]);
  else if (command === "verify" && args.length === 0) await verify();
  else if (command === "activate" && args.length === 0) await activate();
  else if (command === "disable" && args.length === 0) {
    await disableRoutes("Operator disabled HiModels routing");
    console.log(JSON.stringify({ providerId: PROVIDER_ID, enabled: false }));
  } else if (command === "status" && args.length === 0) await status();
  else fail("Usage: himodels-control <stage /run/nexusflow-himodels-key|verify|activate|disable|status>");
}

main()
  .catch((error) => {
    console.error("[himodels-control] failed:", error instanceof Error ? error.message : "unknown error");
    process.exitCode = 1;
  })
  .finally(() => closeDb());
