const DEFAULT_HEARTBEAT_INTERVAL_MS = 15_000;
const MIN_HEARTBEAT_INTERVAL_MS = 5_000;
const MAX_HEARTBEAT_INTERVAL_MS = 45_000;

type SseResponse = {
  destroyed?: boolean;
  writableEnded?: boolean;
  write: (chunk: string) => unknown;
  flushHeaders?: () => void;
  once: (event: "close" | "finish", listener: () => void) => unknown;
  removeListener: (event: "close" | "finish", listener: () => void) => unknown;
};

export type SseHeartbeatController = {
  write: (chunk: string) => unknown;
  stop: () => void;
};

export function getSseHeartbeatIntervalMs(): number {
  const configured = Number(process.env.SSE_HEARTBEAT_INTERVAL_MS || DEFAULT_HEARTBEAT_INTERVAL_MS);
  if (!Number.isFinite(configured)) return DEFAULT_HEARTBEAT_INTERVAL_MS;
  return Math.min(MAX_HEARTBEAT_INTERVAL_MS, Math.max(MIN_HEARTBEAT_INTERVAL_MS, Math.floor(configured)));
}

/** Keep ALB/proxy idle timers open while an upstream model is silent. */
export function startSseHeartbeat(
  response: SseResponse,
  intervalMs = getSseHeartbeatIntervalMs()
): SseHeartbeatController {
  response.flushHeaders?.();
  let stopped = false;
  let atEventBoundary = true;
  let payloadTail = "";
  let timer: NodeJS.Timeout;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    response.removeListener("close", stop);
    response.removeListener("finish", stop);
  };
  timer = setInterval(() => {
    if (response.destroyed || response.writableEnded) {
      stop();
      return;
    }
    if (!atEventBoundary) return;
    try {
      // SSE comments are ignored by compliant clients and usage parsers.
      response.write(": nexusflow-keepalive\n\n");
    } catch {
      stop();
    }
  }, intervalMs);
  timer.unref?.();
  response.once("close", stop);
  response.once("finish", stop);
  return {
    write: (chunk: string) => {
      payloadTail = `${payloadTail}${chunk}`.slice(-4);
      atEventBoundary = /(?:\n\n|\r\n\r\n)$/.test(payloadTail);
      return response.write(chunk);
    },
    stop,
  };
}
