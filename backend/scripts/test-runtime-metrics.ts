import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import type { NextFunction, Request, Response } from "express";
import {
  createRuntimeMetrics,
  RUNTIME_METRICS_PATH,
} from "../src/services/runtime-metrics";

type FakeResponse = EventEmitter & {
  headers: Record<string, string>;
  statusCode: number;
  body: string;
  setHeader: (name: string, value: string) => void;
  status: (code: number) => FakeResponse;
  send: (body: string) => FakeResponse;
};

function response(): FakeResponse {
  const res = new EventEmitter() as FakeResponse;
  res.headers = {};
  res.statusCode = 0;
  res.body = "";
  res.setHeader = (name, value) => { res.headers[name] = value; };
  res.status = (code) => { res.statusCode = code; return res; };
  res.send = (body) => { res.body = body; return res; };
  return res;
}

function request(path: string): Request {
  return { path } as Request;
}

async function main(): Promise<void> {
  let phase: "ready" | "draining" = "ready";
  const metrics = createRuntimeMetrics(() => phase);
  const apiResponse = response();
  let nextCalls = 0;
  metrics.middleware(
    request("/v1/chat/completions"),
    apiResponse as unknown as Response,
    (() => { nextCalls += 1; }) as NextFunction
  );

  assert.equal(nextCalls, 1);
  assert.deepEqual(metrics.snapshot(), {
    inflightRequests: 1,
    publicApiInflightRequests: 1,
  });

  const dashboardResponse = response();
  metrics.middleware(
    request("/api/models"),
    dashboardResponse as unknown as Response,
    (() => { nextCalls += 1; }) as NextFunction
  );
  assert.deepEqual(metrics.snapshot(), {
    inflightRequests: 2,
    publicApiInflightRequests: 1,
  });

  apiResponse.emit("finish");
  apiResponse.emit("close");
  assert.deepEqual(metrics.snapshot(), {
    inflightRequests: 1,
    publicApiInflightRequests: 0,
  });

  dashboardResponse.emit("close");
  assert.deepEqual(metrics.snapshot(), {
    inflightRequests: 0,
    publicApiInflightRequests: 0,
  });

  phase = "draining";
  const scrapeResponse = response();
  metrics.handler(
    request(RUNTIME_METRICS_PATH),
    scrapeResponse as unknown as Response,
    (() => undefined) as NextFunction
  );
  assert.equal(scrapeResponse.statusCode, 200);
  assert.match(scrapeResponse.headers["Content-Type"], /text\/plain/);
  assert.match(scrapeResponse.body, /nexusflow_public_api_inflight_requests 0/);
  assert.match(scrapeResponse.body, /nexusflow_runtime_phase\{phase="draining"\} 1/);
  console.log("runtime metrics checks passed");
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
