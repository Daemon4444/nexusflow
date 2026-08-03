import assert from "node:assert/strict";
import { closeDb, db } from "../src/db/client";
import { inspectApiKey, validateApiKey } from "../src/data/apikeys";
import {
  BODY_ADMISSION_RELEASE,
  requireApiKeyBeforeLargeJson,
} from "../src/middleware/large-json-auth";

if (process.env.USE_PG_MEM !== "true") {
  throw new Error("test requires USE_PG_MEM=true");
}

const testKey = process.env.LOCAL_TEST_API_KEY || "sk-air-local-test-000000000000000000000000";
// Isolate from any host .env: force the non-production, in-memory admission
// path and a deterministic per-key concurrency limit.
process.env.NODE_ENV = "test";
delete process.env.NEXUSFLOW_ENV;
delete process.env.NEXUSFLOW_RELEASE_RUNTIME;
delete process.env.REDIS_HOST;
delete process.env.SLS_ACCESS_KEY_ID;
delete process.env.SLS_ACCESS_KEY_SECRET;
process.env.PUBLIC_BODY_API_KEY_CONCURRENCY = "3";

function makeRequest(headers: Record<string, string>, method = "POST", path = "/chat/completions"): any {
  return { method, headers, path };
}

function makeResponse(): any {
  return {
    statusCode: 200,
    payload: undefined as any,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: any) {
      this.payload = payload;
      return this;
    },
  };
}

async function runMiddleware(req: any, res: any): Promise<{ nextCalled: boolean; error?: unknown }> {
  return new Promise((resolve) => {
    let settled = false;
    const next = (error?: unknown) => {
      if (settled) return;
      settled = true;
      resolve({ nextCalled: true, error });
    };
    void requireApiKeyBeforeLargeJson(req, res, next).then(() => {
      if (!settled) resolve({ nextCalled: false });
    });
  });
}

async function main(): Promise<void> {
  const before = await db.queryOne<{ usage_count: number }>(
    "SELECT usage_count FROM api_keys WHERE id = ?",
    ["local-key-1"]
  );
  assert.equal(Number(before?.usage_count), 4);

  assert.ok(await inspectApiKey(testKey));
  const afterInspect = await db.queryOne<{ usage_count: number }>(
    "SELECT usage_count FROM api_keys WHERE id = ?",
    ["local-key-1"]
  );
  assert.equal(Number(afterInspect?.usage_count), 4);

  const validReq = makeRequest({
    authorization: `Bearer ${testKey}`,
    "content-type": "application/json",
  });
  const validResponse = makeResponse();
  const validResult = await runMiddleware(validReq, validResponse);
  assert.equal(validResult.nextCalled, true);
  assert.equal(validResult.error, undefined);
  assert.equal(validResponse.statusCode, 200);
  assert.equal(typeof validReq[BODY_ADMISSION_RELEASE], "function");
  validReq[BODY_ADMISSION_RELEASE]();

  const anthropicReq = makeRequest({
    "x-api-key": testKey,
    "content-type": "application/json; charset=utf-8",
  });
  const anthropicResponse = makeResponse();
  const anthropicResult = await runMiddleware(anthropicReq, anthropicResponse);
  assert.equal(anthropicResult.nextCalled, true);
  assert.equal(anthropicResponse.statusCode, 200);
  anthropicReq[BODY_ADMISSION_RELEASE]();

  const invalidResponse = makeResponse();
  const invalidResult = await runMiddleware(
    makeRequest({
      authorization: "Bearer invalid-key",
      "content-type": "application/json",
    }),
    invalidResponse
  );
  assert.equal(invalidResult.nextCalled, false);
  assert.equal(invalidResponse.statusCode, 401);
  assert.equal(invalidResponse.payload.error.code, "invalid_api_key");

  const invalidAnthropicResponse = makeResponse();
  const invalidAnthropicResult = await runMiddleware(
    makeRequest(
      {
        "x-api-key": "invalid-key",
        "content-type": "application/json",
      },
      "POST",
      "/messages"
    ),
    invalidAnthropicResponse
  );
  assert.equal(invalidAnthropicResult.nextCalled, false);
  assert.equal(invalidAnthropicResponse.statusCode, 401);
  assert.equal(invalidAnthropicResponse.payload.type, "error");
  assert.equal(invalidAnthropicResponse.payload.error.type, "authentication_error");

  const getResponse = makeResponse();
  const getResult = await runMiddleware(makeRequest({}, "GET"), getResponse);
  assert.equal(getResult.nextCalled, true);

  // Concurrency slots are held only until the release handle fires (i.e. body
  // parse completes), and rejections surface the specific admission reason.
  const settleRelease = () => new Promise((resolve) => setImmediate(resolve));
  const smallBodyHeaders = () => ({
    authorization: `Bearer ${testKey}`,
    "content-type": "application/json",
    "content-length": "128",
  });
  const heldReqs: any[] = [];
  for (let i = 0; i < 3; i += 1) {
    const heldReq = makeRequest(smallBodyHeaders());
    const heldRes = makeResponse();
    const heldResult = await runMiddleware(heldReq, heldRes);
    assert.equal(heldResult.nextCalled, true);
    heldReqs.push(heldReq);
  }

  const rejectedRes = makeResponse();
  const rejectedResult = await runMiddleware(makeRequest(smallBodyHeaders()), rejectedRes);
  assert.equal(rejectedResult.nextCalled, false);
  assert.equal(rejectedRes.statusCode, 429);
  assert.equal(rejectedRes.payload.error.code, "body_admission_exceeded");
  assert.match(rejectedRes.payload.error.message, /api_key_concurrency/);

  heldReqs[0][BODY_ADMISSION_RELEASE]();
  await settleRelease();
  const recoveredReq = makeRequest(smallBodyHeaders());
  const recoveredRes = makeResponse();
  const recoveredResult = await runMiddleware(recoveredReq, recoveredRes);
  assert.equal(recoveredResult.nextCalled, true);
  assert.equal(recoveredRes.statusCode, 200);
  for (const heldReq of [...heldReqs.slice(1), recoveredReq]) {
    heldReq[BODY_ADMISSION_RELEASE]();
  }
  await settleRelease();

  assert.ok(await validateApiKey(testKey));
  const afterValidation = await db.queryOne<{ usage_count: number }>(
    "SELECT usage_count FROM api_keys WHERE id = ?",
    ["local-key-1"]
  );
  assert.equal(Number(afterValidation?.usage_count), 5);

  console.log("large JSON pre-authentication tests passed");
}

main()
  .then(async () => {
    await closeDb();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error(error);
    await closeDb();
    process.exit(1);
  });
