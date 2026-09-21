import fs from "node:fs";
import path from "node:path";
import { closeDb } from "../db/client";
import {
  getCapacity,
  getProviderById,
  updateProvider,
  updateProviderStatus,
  upsertCapacity,
} from "../data/providers";
import { models } from "../data/models";

const PROVIDER_ID = "azure-ai-foundry";
const MODEL_ID = "gpt-6-astra";
const BASE_URL = "https://developerhelena-1129-resource.services.ai.azure.com/openai/v1";
const CAPACITY = {
  rpm_limit: 2,
  tpm_limit: 1_200_000,
  daily_limit: 100,
  concurrent_limit: 1,
  priority: 100,
  weight: 100,
};

function fail(message: string): never {
  throw new Error(message);
}

function assertCatalog(): void {
  const model = models.find((entry) => entry.id === MODEL_ID);
  if (!model) fail("Astra is absent from the billable catalog");
  const tiers = model.tokenPricingTiers || [];
  if (
    model.promptPrice !== 68
    || model.completionPrice !== 340
    || model.cacheReadPrice !== 6.8
    || tiers.length !== 2
    || tiers[0].maxTokens !== 272_000
    || tiers[0].promptPrice !== 68
    || tiers[0].completionPrice !== 340
    || tiers[0].cacheReadPrice !== 6.8
    || tiers[1].maxTokens !== 1_050_000
    || tiers[1].promptPrice !== 136
    || tiers[1].completionPrice !== 510
    || tiers[1].cacheReadPrice !== 13.6
  ) {
    fail("Astra catalog pricing does not match the approved Standard price book");
  }
}

function readPrivateKey(keyPath: string): string {
  const resolved = path.resolve(keyPath);
  if (resolved !== "/run/nexusflow-azure-key") {
    fail("Azure key must use the approved private staging path");
  }
  const descriptor = fs.openSync(resolved, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
  try {
    const stat = fs.fstatSync(descriptor);
    if (
      !stat.isFile()
      || stat.uid !== 0
      || stat.gid !== 0
      || (stat.mode & 0o777) !== 0o600
      || stat.size < 20
      || stat.size > 4096
    ) {
      fail("Azure key file must be root:root mode 0600 with a valid size");
    }
    const key = fs.readFileSync(descriptor, "utf8").trim();
    if (!key || /[\r\n]/.test(key)) fail("Azure key file contains invalid data");
    return key;
  } finally {
    fs.closeSync(descriptor);
  }
}

async function verifyAzureKey(key: string): Promise<void> {
  const response = await fetch(`${BASE_URL}/models`, {
    headers: { "api-key": key, accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) fail(`Azure credential verification failed with HTTP ${response.status}`);
  const body = await response.json() as { data?: Array<{ id?: string }> };
  if (!body.data?.some((entry) => entry.id === MODEL_ID)) {
    fail("Azure deployment is not visible to the staged credential");
  }
}

async function stage(keyPath: string): Promise<void> {
  assertCatalog();
  const key = readPrivateKey(keyPath);
  await verifyAzureKey(key);
  const provider = await getProviderById(PROVIDER_ID);
  if (!provider) fail("Azure provider has not been initialized");
  const updated = await updateProvider(PROVIDER_ID, {
    name: "Azure AI Foundry",
    description: "Azure OpenAI v1 channel for GPT-6 Astra.",
    api_base_url: BASE_URL,
    api_key: key,
  });
  if (!updated) fail("Azure provider credential could not be stored");
  await upsertCapacity(PROVIDER_ID, MODEL_ID, { ...CAPACITY, is_enabled: false });
  await updateProviderStatus(PROVIDER_ID, "disabled", "Pending application release activation");
  fs.unlinkSync(path.resolve(keyPath));
  console.log(JSON.stringify({ providerId: PROVIDER_ID, modelId: MODEL_ID, staged: true, enabled: false }));
}

async function activate(): Promise<void> {
  assertCatalog();
  const provider = await getProviderById(PROVIDER_ID);
  const capacity = await getCapacity(PROVIDER_ID, MODEL_ID);
  if (!provider?.api_key || provider.api_base_url !== BASE_URL) fail("Azure provider is not staged");
  if (
    !capacity
    || capacity.rpm_limit !== CAPACITY.rpm_limit
    || capacity.tpm_limit !== CAPACITY.tpm_limit
    || capacity.daily_limit !== CAPACITY.daily_limit
    || capacity.concurrent_limit !== CAPACITY.concurrent_limit
  ) {
    fail("Azure capacity does not match the approved conservative limits");
  }
  await updateProviderStatus(PROVIDER_ID, "enabled");
  await upsertCapacity(PROVIDER_ID, MODEL_ID, { ...CAPACITY, is_enabled: true });
  console.log(JSON.stringify({ providerId: PROVIDER_ID, modelId: MODEL_ID, staged: true, enabled: true }));
}

async function disable(): Promise<void> {
  const capacity = await getCapacity(PROVIDER_ID, MODEL_ID);
  if (capacity) await upsertCapacity(PROVIDER_ID, MODEL_ID, { ...CAPACITY, is_enabled: false });
  await updateProviderStatus(PROVIDER_ID, "disabled", "Operator disabled Astra routing");
  console.log(JSON.stringify({ providerId: PROVIDER_ID, modelId: MODEL_ID, enabled: false }));
}

async function status(): Promise<void> {
  const provider = await getProviderById(PROVIDER_ID);
  const capacity = await getCapacity(PROVIDER_ID, MODEL_ID);
  console.log(JSON.stringify({
    providerId: PROVIDER_ID,
    modelId: MODEL_ID,
    providerStatus: provider?.status || "missing",
    credentialStored: !!provider?.api_key,
    capacityEnabled: capacity?.is_enabled || false,
    limits: capacity ? {
      rpm: capacity.rpm_limit,
      tpm: capacity.tpm_limit,
      daily: capacity.daily_limit,
      concurrency: capacity.concurrent_limit,
    } : null,
  }));
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  if (command === "stage" && args.length === 1) await stage(args[0]);
  else if (command === "activate" && args.length === 0) await activate();
  else if (command === "disable" && args.length === 0) await disable();
  else if (command === "status" && args.length === 0) await status();
  else fail("Usage: azure-astra-control <stage /run/nexusflow-azure-key|activate|disable|status>");
}

main()
  .catch((error) => {
    console.error("[azure-astra-control] failed:", error instanceof Error ? error.message : "unknown error");
    process.exitCode = 1;
  })
  .finally(() => closeDb());
