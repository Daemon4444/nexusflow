import assert from "node:assert/strict";
import { closeDb, db } from "../src/db/client";
import { inspectApiKey, validateApiKey } from "../src/data/apikeys";
import { requireApiKeyBeforeLargeJson } from "../src/middleware/large-json-auth";

if (process.env.USE_PG_MEM !== "true") {
  throw new Error("test requires USE_PG_MEM=true");
}

const testKey = process.env.LOCAL_TEST_API_KEY || "sk-air-local-test-000000000000000000000000";

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

  const validResponse = makeResponse();
  const validResult = await runMiddleware(
    makeRequest({
      authorization: `Bearer ${testKey}`,
      "content-type": "application/json",
    }),
    validResponse
  );
  assert.equal(validResult.nextCalled, true);
  assert.equal(validResult.error, undefined);
  assert.equal(validResponse.statusCode, 200);

  const anthropicResponse = makeResponse();
  const anthropicResult = await runMiddleware(
    makeRequest({
      "x-api-key": testKey,
      "content-type": "application/json; charset=utf-8",
    }),
    anthropicResponse
  );
  assert.equal(anthropicResult.nextCalled, true);
  assert.equal(anthropicResponse.statusCode, 200);

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
