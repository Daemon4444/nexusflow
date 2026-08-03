import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import {
  releaseRequestBodyAdmission,
  reserveRequestBodyAdmission,
} from "../src/services/request-body-admission";
import {
  BODY_ADMISSION_RELEASE,
  getPublicJsonBodyLimitBytes,
  requireApiKeyBeforeLargeJson,
  verifyDeclaredJsonLength,
} from "../src/middleware/large-json-auth";
import { closeRedis } from "../src/services/redis";
import { closeDb } from "../src/db/client";

if (!process.env.REDIS_HOST || process.env.USE_PG_MEM !== "true") {
  throw new Error("test requires isolated Redis and USE_PG_MEM=true");
}

const testKey = "sk-air-local-test-000000000000000000000000";

class MockResponse extends EventEmitter {
  statusCode = 200;
  payload: any;

  status(code: number): this {
    this.statusCode = code;
    return this;
  }

  json(payload: any): this {
    this.payload = payload;
    return this;
  }
}

function request(headers: Record<string, string>, path = "/chat/completions"): any {
  return {
    method: "POST",
    path,
    originalUrl: `/v1${path}`,
    headers,
    socket: { remoteAddress: "127.0.0.1" },
  };
}

async function runMiddleware(req: any): Promise<{ response: MockResponse; next: boolean }> {
  const response = new MockResponse();
  let next = false;
  await requireApiKeyBeforeLargeJson(req, response as any, (error?: unknown) => {
    if (error) throw error;
    next = true;
  });
  return { response, next };
}

async function main(): Promise<void> {
  process.env.PUBLIC_BODY_API_KEY_CONCURRENCY = "2";
  process.env.PUBLIC_BODY_API_KEY_BYTES = "150";
  process.env.PUBLIC_BODY_IP_CONCURRENCY = "10";
  process.env.PUBLIC_BODY_IP_BYTES = "1000";
  process.env.PUBLIC_BODY_GLOBAL_CONCURRENCY = "20";
  process.env.PUBLIC_BODY_GLOBAL_BYTES = "2000";
  process.env.PUBLIC_BODY_LEASE_TTL_SECONDS = "1";

  const first = await reserveRequestBodyAdmission({
    apiKeyId: "body-key-a",
    clientIp: "203.0.113.10",
    declaredBytes: 50,
  });
  const second = await reserveRequestBodyAdmission({
    apiKeyId: "body-key-a",
    clientIp: "203.0.113.10",
    declaredBytes: 50,
  });
  assert(first.allowed && second.allowed);
  assert.deepEqual(
    await reserveRequestBodyAdmission({
      apiKeyId: "body-key-a",
      clientIp: "203.0.113.10",
      declaredBytes: 1,
    }),
    { allowed: false, reason: "api_key_concurrency" }
  );
  await releaseRequestBodyAdmission({
    apiKeyId: "body-key-a",
    clientIp: "203.0.113.10",
    leaseId: first.leaseId,
  });
  const replacement = await reserveRequestBodyAdmission({
    apiKeyId: "body-key-a",
    clientIp: "203.0.113.10",
    declaredBytes: 50,
  });
  assert(replacement.allowed);
  for (const lease of [second, replacement]) {
    if (lease.allowed) {
      await releaseRequestBodyAdmission({
        apiKeyId: "body-key-a",
        clientIp: "203.0.113.10",
        leaseId: lease.leaseId,
      });
    }
  }

  const bytesLease = await reserveRequestBodyAdmission({
    apiKeyId: "body-key-b",
    clientIp: "203.0.113.11",
    declaredBytes: 100,
  });
  assert(bytesLease.allowed);
  assert.deepEqual(
    await reserveRequestBodyAdmission({
      apiKeyId: "body-key-b",
      clientIp: "203.0.113.11",
      declaredBytes: 51,
    }),
    { allowed: false, reason: "api_key_bytes" }
  );

  // A crashed worker does not strand capacity: Lua removes an expired lease
  // before making the next atomic admission decision.
  await new Promise((resolve) => setTimeout(resolve, 1_100));
  const afterExpiry = await reserveRequestBodyAdmission({
    apiKeyId: "body-key-b",
    clientIp: "203.0.113.11",
    declaredBytes: 150,
  });
  assert(afterExpiry.allowed);
  await releaseRequestBodyAdmission({
    apiKeyId: "body-key-b",
    clientIp: "203.0.113.11",
    leaseId: afterExpiry.leaseId,
  });

  process.env.NODE_ENV = "production";
  const authHeaders = {
    authorization: `Bearer ${testKey}`,
    "content-type": "application/json",
  };
  const missingLength = await runMiddleware(request(authHeaders));
  assert.equal(missingLength.next, false);
  assert.equal(missingLength.response.statusCode, 411);
  const chunked = await runMiddleware(request({
    ...authHeaders,
    "transfer-encoding": "chunked",
  }));
  assert.equal(chunked.response.statusCode, 411);
  const compressed = await runMiddleware(request({
    ...authHeaders,
    "content-encoding": "gzip",
    "content-length": "100",
  }));
  assert.equal(compressed.response.statusCode, 415);
  const oversizedSmallRoute = await runMiddleware(request({
    ...authHeaders,
    "content-length": String(1024 * 1024 + 1),
  }, "/embeddings"));
  assert.equal(oversizedSmallRoute.response.statusCode, 413);
  assert.equal(
    getPublicJsonBodyLimitBytes(request({}, "/embeddings")),
    1024 * 1024
  );
  assert.equal(
    getPublicJsonBodyLimitBytes(request({}, "/responses")),
    50 * 1024 * 1024
  );

  const acceptedReq = request({
    ...authHeaders,
    "content-length": "100",
  });
  const accepted = await runMiddleware(acceptedReq);
  assert.equal(accepted.next, true);
  // Body-parse completion releases the lease; the response "close" backstop
  // stays idempotent for requests that never reach the parser.
  assert.equal(typeof acceptedReq[BODY_ADMISSION_RELEASE], "function");
  acceptedReq[BODY_ADMISSION_RELEASE]();
  accepted.response.emit("close");

  assert.throws(
    () => verifyDeclaredJsonLength(
      request({ "content-length": "2" }),
      {} as any,
      Buffer.from("{} ")
    ),
    /declared Content-Length/
  );

  console.log("Redis request-body admission checks passed");
}

main()
  .then(async () => {
    await closeRedis();
    await closeDb();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error(error);
    await closeRedis().catch(() => undefined);
    await closeDb();
    process.exit(1);
  });
