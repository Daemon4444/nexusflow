import assert from "node:assert/strict";
import http from "node:http";
import express from "express";
import { closeDb, db } from "../src/db/client";
import { inspectApiKey, validateApiKey } from "../src/data/apikeys";
import {
  BODY_ADMISSION_RELEASE,
  parsePublicApiJson,
  requireApiKeyBeforeLargeJson,
} from "../src/middleware/large-json-auth";
import { errorHandler } from "../src/middleware/error";

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

async function postChunkedJson(
  port: number,
  path: string,
  chunks: Buffer[]
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const request = http.request({
      hostname: "127.0.0.1",
      port,
      path,
      method: "POST",
      headers: {
        "x-api-key": testKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
        "transfer-encoding": "chunked",
      },
    }, (response) => {
      const responseChunks: Buffer[] = [];
      response.on("data", (chunk) => responseChunks.push(Buffer.from(chunk)));
      response.on("end", () => {
        const raw = Buffer.concat(responseChunks).toString("utf8");
        resolve({ status: response.statusCode || 0, body: raw ? JSON.parse(raw) : null });
      });
    });
    request.once("error", reject);
    for (const chunk of chunks) request.write(chunk);
    request.end();
  });
}

async function testChunkedHttpParsing(): Promise<void> {
  const app = express();
  app.use("/v1", requireApiKeyBeforeLargeJson, parsePublicApiJson);
  app.post("/v1/messages", (req, res) => {
    res.json({ body: req.body, transferEncoding: req.headers["transfer-encoding"] });
  });
  app.post("/v1/embeddings", (req, res) => res.json({ body: req.body }));
  app.use(errorHandler);
  const server = app.listen(0, "127.0.0.1");
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("test server has no TCP port");

    const payload = Buffer.from(JSON.stringify({
      model: "kimi-k3",
      max_tokens: 16,
      messages: [{ role: "user", content: "chunked request" }],
    }));
    const accepted = await postChunkedJson(address.port, "/v1/messages", [
      payload.subarray(0, 17),
      payload.subarray(17),
    ]);
    assert.equal(accepted.status, 200);
    assert.equal(accepted.body.body.model, "kimi-k3");
    assert.equal(accepted.body.transferEncoding, "chunked");

    const previousApiKeyBytes = process.env.PUBLIC_BODY_API_KEY_BYTES;
    process.env.PUBLIC_BODY_API_KEY_BYTES = "300000";
    try {
      const byteLimited = Buffer.alloc(300_001, 0x20);
      byteLimited[0] = 0x7b;
      byteLimited[byteLimited.length - 1] = 0x7d;
      const admissionRejected = await postChunkedJson(
        address.port,
        "/v1/messages",
        [byteLimited]
      );
      assert.equal(admissionRejected.status, 429);
      assert.equal(admissionRejected.body.error.code, "body_admission_exceeded");
      assert.match(admissionRejected.body.error.message, /api_key_bytes/);
    } finally {
      if (previousApiKeyBytes === undefined) delete process.env.PUBLIC_BODY_API_KEY_BYTES;
      else process.env.PUBLIC_BODY_API_KEY_BYTES = previousApiKeyBytes;
    }

    const oversized = Buffer.alloc(1024 * 1024 + 1, 0x20);
    oversized[0] = 0x7b;
    oversized[oversized.length - 1] = 0x7d;
    const rejected = await postChunkedJson(
      address.port,
      "/v1/embeddings",
      [oversized.subarray(0, 700_000), oversized.subarray(700_000)]
    );
    assert.equal(rejected.status, 413);
    assert.equal(rejected.body.error.code, "payload_too_large");
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
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

  await testChunkedHttpParsing();

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
