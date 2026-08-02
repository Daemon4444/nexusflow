import type { Server } from "node:http";

export type RuntimePhase = "starting" | "ready" | "draining" | "stopped";

export interface RuntimeLifecycleOptions {
  shutdownTimeoutMs?: number;
  closeDependencies?: () => Promise<void>;
  flushTelemetry?: () => Promise<void>;
  log?: (message: string) => void;
}

export interface RuntimeLifecycle {
  attachServer: (server: Server) => void;
  markReady: () => void;
  beginDrain: (reason: string) => void;
  shutdown: (reason: string) => Promise<void>;
  isReady: () => boolean;
  phase: () => RuntimePhase;
}

function parseShutdownTimeout(value: number | undefined): number {
  if (!Number.isFinite(value)) return 540_000;
  return Math.min(900_000, Math.max(10_000, Math.floor(value as number)));
}

export function createRuntimeLifecycle(
  options: RuntimeLifecycleOptions = {}
): RuntimeLifecycle {
  const timeoutMs = parseShutdownTimeout(options.shutdownTimeoutMs);
  const log = options.log || ((message: string) => console.log(message));
  let currentPhase: RuntimePhase = "starting";
  let server: Server | null = null;
  let shutdownPromise: Promise<void> | null = null;

  const beginDrain = (reason: string) => {
    if (currentPhase === "draining" || currentPhase === "stopped") return;
    currentPhase = "draining";
    log(`[Runtime] draining started: ${reason}`);
  };

  const closeServer = async (): Promise<void> => {
    if (!server) return;
    const activeServer = server;
    let timedOut = false;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        timedOut = true;
        log(`[Runtime] drain timeout after ${timeoutMs}ms; closing remaining connections`);
        activeServer.closeAllConnections?.();
        resolve();
      }, timeoutMs);
      timer.unref?.();
      activeServer.close((error) => {
        clearTimeout(timer);
        if (error) log(`[Runtime] server close error: ${error.message}`);
        resolve();
      });
      activeServer.closeIdleConnections?.();
    });
    if (!timedOut) log("[Runtime] active connections drained");
  };

  const shutdown = (reason: string): Promise<void> => {
    if (shutdownPromise) return shutdownPromise;
    beginDrain(reason);
    shutdownPromise = (async () => {
      await closeServer();
      await options.closeDependencies?.().catch((error) => {
        log(`[Runtime] dependency close error: ${error instanceof Error ? error.message : String(error)}`);
      });
      await options.flushTelemetry?.().catch((error) => {
        log(`[Runtime] telemetry flush error: ${error instanceof Error ? error.message : String(error)}`);
      });
      currentPhase = "stopped";
      log("[Runtime] shutdown complete");
    })();
    return shutdownPromise;
  };

  return {
    attachServer: (nextServer) => {
      if (server) throw new Error("Runtime server is already attached");
      server = nextServer;
    },
    markReady: () => {
      if (currentPhase === "starting") currentPhase = "ready";
    },
    beginDrain,
    shutdown,
    isReady: () => currentPhase === "ready",
    phase: () => currentPhase,
  };
}
