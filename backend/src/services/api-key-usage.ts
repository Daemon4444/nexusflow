import { createHash } from "node:crypto";
import { db } from "../db/client";
import { getRedis } from "./redis";
import { isProductionRuntime } from "../utils/runtime-safety";

const memoryNextSample = new Map<string, number>();

function sampleSeconds(): number {
  const parsed = Number(process.env.API_KEY_USAGE_SAMPLE_SECONDS);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 60;
}

function sampleKey(apiKeyId: string): string {
  const digest = createHash("sha256").update(apiKeyId).digest("hex");
  return `nexusflow:api-key-usage:v1:${digest}:sample`;
}

/**
 * Authentication must remain read-mostly. A hot or deliberately invalid
 * business endpoint may validate the same real API key thousands of times,
 * but it can update PostgreSQL usage telemetry at most once per sample window
 * across the whole cluster.
 */
export async function recordApiKeyUsageSampled(apiKeyId: string): Promise<void> {
  const seconds = sampleSeconds();
  let admitted = false;
  if (!process.env.REDIS_HOST?.trim()) {
    if (isProductionRuntime()) return;
    const now = Date.now();
    if ((memoryNextSample.get(apiKeyId) || 0) > now) return;
    memoryNextSample.set(apiKeyId, now + seconds * 1000);
    admitted = true;
  } else {
    try {
      admitted = (await getRedis().set(
        sampleKey(apiKeyId),
        "1",
        "EX",
        seconds,
        "NX"
      )) === "OK";
    } catch {
      // Usage counters are telemetry, not authorization state. Production
      // deliberately skips the DB fallback during Redis outages; falling back
      // would recreate the write-amplification issue this sampler prevents.
      return;
    }
  }
  if (!admitted) return;
  try {
    await db.execute(
      `UPDATE api_keys
       SET last_used = ?, usage_count = usage_count + 1
       WHERE id = ?`,
      [new Date().toISOString(), apiKeyId]
    );
  } catch {
    // A telemetry failure must not turn a valid credential into an auth error.
  }
}
