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

function flush() {
  if (buffer.length === 0) return;
  const c = getClient();
  if (!c) return;
  const logs = buffer.splice(0, buffer.length);
  c.postLogStoreLogs(PROJECT, LOGSTORE, { logs }).catch((err: any) => {
    console.error("[SLS] Failed to send logs:", err.message);
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
