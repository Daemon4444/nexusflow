import { RequestHandler } from "express";
import { db } from "../db/client";
import { getRedis } from "./redis";

export const HEALTH_PATHS = ["/api/health", "/v1/health"] as const;

export interface HealthCheckDependencies {
  checkPostgres: () => Promise<unknown>;
  checkRedis: () => Promise<unknown>;
}

type HealthFailureLogger = (message: string) => void;

const runtimeDependencies: HealthCheckDependencies = {
  checkPostgres: () => db.query("SELECT 1"),
  checkRedis: () => getRedis().ping(),
};

/**
 * Both compatibility paths use this exact handler so monitoring cannot drift.
 * Failure responses intentionally omit dependency errors and infrastructure
 * details; operators can correlate the server log by timestamp.
 */
export function createHealthCheckHandler(
  dependencies: HealthCheckDependencies = runtimeDependencies,
  logFailure: HealthFailureLogger = (message) =>
    console.error("[Health] dependency check failed:", message)
): RequestHandler {
  return async (_req, res) => {
    try {
      await Promise.all([
        dependencies.checkPostgres(),
        dependencies.checkRedis(),
      ]);
      res.json({
        status: "ok",
        dependencies: { postgres: "ok", redis: "ok" },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logFailure(error instanceof Error ? error.message : String(error));
      res.status(503).json({
        status: "degraded",
        timestamp: new Date().toISOString(),
      });
    }
  };
}

export const healthCheckHandler = createHealthCheckHandler();
