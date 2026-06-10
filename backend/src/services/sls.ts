// eslint-disable-next-line @typescript-eslint/no-var-requires
const ALY = require("@alicloud/log");

const PROJECT = "nexusflow";
const LOGSTORE = "nexusflow";

let client: any = null;
let slsDebugLogged = false;
function getClient() {
  if (!client) {
    const ak = process.env.SLS_ACCESS_KEY_ID;
    const sk = process.env.SLS_ACCESS_KEY_SECRET;
    if (!slsDebugLogged) {
      slsDebugLogged = true;
      console.log("[SLS] Init check - AK exists:", !!ak, "SK exists:", !!sk);
    }
    if (!ak || !sk) return null;
    client = new ALY({
      accessKeyId: ak,
      accessKeySecret: sk,
      region: process.env.SLS_REGION || "cn-beijing",
    });
    console.log("[SLS] Client initialized");
  }
  return client;
}

const buffer: Array<{ timestamp: number; content: Record<string, string> }> = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const FLUSH_INTERVAL = 3000;
const FLUSH_SIZE = 50;
const MAX_BUFFER_SIZE = 5000; // Prevent unbounded growth on persistent failures

function flush(): Promise<void> {
  if (buffer.length === 0) return Promise.resolve();
  const c = getClient();
  if (!c) return Promise.resolve();
  const logs = buffer.splice(0, buffer.length);
  return c.postLogStoreLogs(PROJECT, LOGSTORE, { logs }, { readTimeout: 10000, connectTimeout: 5000 }).catch((err: any) => {
    console.error("[SLS] Failed to send logs:", err.message);
    // Push failed batch back to buffer (capped to prevent memory leak)
    const spaceLeft = MAX_BUFFER_SIZE - buffer.length;
    if (spaceLeft > 0) {
      buffer.unshift(...logs.slice(0, spaceLeft));
    }
  });
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flush();
  }, FLUSH_INTERVAL);
}

export function logToSLS(fields: Record<string, any>) {
  if (!getClient()) return;
  const content: Record<string, string> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined && v !== null) {
      content[k] = typeof v === "string" ? v : JSON.stringify(v);
    }
  }
  buffer.push({ timestamp: Math.floor(Date.now() / 1000), content });
  if (buffer.length >= FLUSH_SIZE) {
    flush();
  } else {
    scheduleFlush();
  }
}

export function getSlsClient() {
  return getClient();
}

process.on('beforeExit', flush);

async function gracefulFlush() {
  try {
    await flush();
  } catch { /* ignore */ }
}
process.on('SIGTERM', () => { gracefulFlush().finally(() => process.exit(0)); });
process.on('SIGINT', () => { gracefulFlush().finally(() => process.exit(0)); });
