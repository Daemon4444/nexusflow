import dotenv from "dotenv";
import path from "path";
import {
  assertSafeManagedReleaseRuntime,
  resolveBackendBindHost,
} from "./utils/runtime-safety";
import { assertProviderOutboundPolicyConfigured } from "./services/outbound-url-policy";
import { assertUploadStorageConfigured } from "./services/oss";

// The process manager owns release/runtime invariants. Secrets from .env may
// fill unset values, but must never downgrade a managed production process.
dotenv.config({ path: path.resolve(__dirname, "../.env"), override: false });
assertSafeManagedReleaseRuntime();
assertProviderOutboundPolicyConfigured();
assertUploadStorageConfigured();

import { createApp } from "./app";

const app = createApp();
const PORT = Number(process.env.PORT) || 3001;
const HOST = resolveBackendBindHost();

import { cleanExpiredSessions } from "./data/users";
import { seedApiKeysIfNeeded } from "./data/apikeys";
import { refreshModels, startModelRefreshLoop } from "./data/model-overrides";
import { ensureRoutingDefaults } from "./services/providers";
import { startUploadCleanupLoop } from "./services/upload-lifecycle";

let fatalExitScheduled = false;
function scheduleFatalExit(): void {
  if (fatalExitScheduled) return;
  fatalExitScheduled = true;
  // Continuing after an unhandled async failure can leave accounting or
  // in-memory scheduler state inconsistent. PM2 will replace this worker.
  setTimeout(() => process.exit(1), 100);
}

process.on("unhandledRejection", (reason) => {
  const message = reason instanceof Error ? reason.stack || reason.message : String(reason);
  console.error(`[Quadrant API] Unhandled promise rejection: ${message}`);
  scheduleFatalExit();
});

process.on("uncaughtException", (error) => {
  console.error(`[Quadrant API] Uncaught exception: ${error.stack || error.message}`);
  scheduleFatalExit();
});

async function start() {
  try {
    await cleanExpiredSessions();
    await seedApiKeysIfNeeded();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[Quadrant API] 数据库维护任务跳过: ${message}`);
  }
  try {
    await ensureRoutingDefaults();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[Quadrant API] 路由默认配置初始化跳过: ${message}`);
  }

  // Load DB model overrides on top of the static catalog (no-op when table empty),
  // then keep converging every 30s so all cluster instances pick up admin edits.
  const refreshed = await refreshModels();
  if (refreshed) {
    console.log(`[Quadrant API] 模型目录已加载: ${refreshed.total} 个模型 (${refreshed.overrides} 条覆盖)`);
  }
  startModelRefreshLoop();
  startUploadCleanupLoop();

  app.listen(PORT, HOST, () => {
    console.log(`[Quadrant API] 服务已启动: http://${HOST}:${PORT}`);
  });
}

start().catch((error) => {
  console.error("[Quadrant API] 启动失败:", error);
  process.exit(1);
});
