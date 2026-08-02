import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { RuntimePhase } from "./runtime-lifecycle";

export const RUNTIME_METRICS_PATH = "/_internal/metrics";

export type RuntimeMetricsSnapshot = {
  inflightRequests: number;
  publicApiInflightRequests: number;
};

export type RuntimeMetrics = {
  middleware: RequestHandler;
  handler: RequestHandler;
  snapshot: () => RuntimeMetricsSnapshot;
};

function isPublicApiPath(pathname: string): boolean {
  return pathname === "/v1" || pathname.startsWith("/v1/");
}

function prometheusGauge(name: string, help: string, value: number): string[] {
  return [
    `# HELP ${name} ${help}`,
    `# TYPE ${name} gauge`,
    `${name} ${value}`,
  ];
}

export function createRuntimeMetrics(
  getPhase: () => RuntimePhase
): RuntimeMetrics {
  let inflightRequests = 0;
  let publicApiInflightRequests = 0;

  const middleware = (req: Request, res: Response, next: NextFunction): void => {
    inflightRequests += 1;
    const publicApi = isPublicApiPath(req.path);
    if (publicApi) publicApiInflightRequests += 1;

    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      inflightRequests = Math.max(0, inflightRequests - 1);
      if (publicApi) {
        publicApiInflightRequests = Math.max(0, publicApiInflightRequests - 1);
      }
    };
    res.once("finish", settle);
    res.once("close", settle);
    next();
  };

  const handler = (_req: Request, res: Response): void => {
    const phase = getPhase();
    const lines = [
      ...prometheusGauge(
        "nexusflow_http_inflight_requests",
        "Requests currently being handled by this API process.",
        inflightRequests
      ),
      ...prometheusGauge(
        "nexusflow_public_api_inflight_requests",
        "Public /v1 requests currently being handled by this API process.",
        publicApiInflightRequests
      ),
      "# HELP nexusflow_runtime_phase Current runtime lifecycle phase as a one-hot gauge.",
      "# TYPE nexusflow_runtime_phase gauge",
      ...(["starting", "ready", "draining", "stopped"] as RuntimePhase[]).map(
        (candidate) => `nexusflow_runtime_phase{phase="${candidate}"} ${candidate === phase ? 1 : 0}`
      ),
      "",
    ];
    res.setHeader("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.status(200).send(lines.join("\n"));
  };

  return {
    middleware,
    handler,
    snapshot: () => ({ inflightRequests, publicApiInflightRequests }),
  };
}
