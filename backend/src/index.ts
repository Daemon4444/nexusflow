import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env"), override: true });

import modelsRouter from "./routes/models";
import keysRouter from "./routes/keys";
import usageRouter from "./routes/usage";
import v1Router from "./routes/v1";
import responsesRouter from "./routes/responses";
import messagesRouter from "./routes/messages";
import pixverseRouter from "./routes/pixverse";
import imageRouter from "./routes/image";
import videoRouter from "./routes/video";
import uploadRouter from "./routes/upload";
import playgroundRouter from "./routes/playground";
import authRouter from "./routes/auth";
import billingRouter from "./routes/billing";
import discountsRouter from "./routes/discounts";
import adminRouter from "./routes/admin";
import providerRouter from "./routes/provider";
import providerMonitorRouter from "./routes/provider-monitor";
import tasksRouter from "./routes/tasks";
import audioRouter from "./routes/audio";
import rateLimitsRouter from "./routes/ratelimits";
import ticketsRouter from "./routes/tickets";
import subAccountsRouter from "./routes/sub-accounts";
import { errorHandler, notFoundHandler } from "./middleware/error";

const app = express();
const PORT = Number(process.env.PORT) || 3001;

app.disable("x-powered-by");
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
});

const allowedOrigins = process.env.NODE_ENV === "production"
  ? ["https://nexusflow.hk", "https://www.nexusflow.hk"]
  : ["http://localhost:3000", "http://127.0.0.1:3000", "https://nexusflow.hk"];

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));
app.use(express.json({ limit: "1mb" })); // 限制请求体大小，防止内存溢出
app.use(express.urlencoded({ extended: false })); // 支付宝回调等表单请求

// Anthropic Messages 兼容 API（/v1/messages）— 必须在 /v1 之前挂载
app.use("/v1/messages", messagesRouter);

// OpenAI Audio API（/v1/audio/speech, /v1/audio/transcriptions）— 必须在 /v1 之前挂载
app.use("/v1/audio", audioRouter);

// OpenAI Responses API（/v1/responses）— 必须在 /v1 之前挂载
app.use("/v1/responses", responsesRouter);

// OpenAI 兼容 API（/v1/chat/completions, /v1/models）
app.use("/v1", v1Router);

// PixVerse 视频生成 API（/v1/video/text, /v1/video/image, /v1/video/status/:id）
app.use("/v1/video", pixverseRouter);

// 阿里云百炼兼容路径 — 视频生成
app.use("/v1/services/aigc/video-generation", pixverseRouter);

// OpenAI-style video generation alias for NexusFlow async video tasks.
app.use("/v1/videos", videoRouter);

// 异步任务 API（/v1/tasks）
app.use("/v1/tasks", tasksRouter);

// 管理面板 API
app.use("/api/auth", authRouter);
app.use("/api/billing", billingRouter);
app.use("/api/billing", discountsRouter);
app.use("/api/provider", providerRouter);
app.use("/api/provider-monitor", providerMonitorRouter);
app.use("/api/models", modelsRouter);
app.use("/api/keys", keysRouter);
app.use("/api/usage", usageRouter);
app.use("/api/image", imageRouter);
app.use("/api/video", videoRouter);
app.use("/api/playground", playgroundRouter);
app.use("/api/upload", uploadRouter);
app.use("/api/uploads", uploadRouter);
app.use("/api/rate-limits", rateLimitsRouter);
app.use("/api/tickets", ticketsRouter);
app.use("/api/sub-accounts", subAccountsRouter);
app.use("/api/admin", adminRouter);

// Admin API (requires authentication)
import { cleanExpiredSessions } from "./data/users";
import { seedApiKeysIfNeeded } from "./data/apikeys";
import { refreshModels, startModelRefreshLoop } from "./data/model-overrides";
import { db } from "./db/client";
import { getRedis } from "./services/redis";

// Health check
app.get("/api/health", async (_req, res) => {
  try {
    await Promise.all([
      db.query("SELECT 1"),
      getRedis().ping(),
    ]);
    res.json({
      status: "ok",
      dependencies: { postgres: "ok", redis: "ok" },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Health] dependency check failed:", message);
    res.status(503).json({
      status: "degraded",
      timestamp: new Date().toISOString(),
    });
  }
});
app.get("/api/version", (_req, res) => {
  res.json({
    sha: process.env.BUILD_SHA || "unknown",
    builtAt: process.env.BUILD_TIME || "unknown",
  });
});

// 404 处理
app.use(notFoundHandler);

// 统一错误处理
app.use(errorHandler);

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

  // Load DB model overrides on top of the static catalog (no-op when table empty),
  // then keep converging every 30s so all cluster instances pick up admin edits.
  const refreshed = await refreshModels();
  if (refreshed) {
    console.log(`[Quadrant API] 模型目录已加载: ${refreshed.total} 个模型 (${refreshed.overrides} 条覆盖)`);
  }
  startModelRefreshLoop();

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Quadrant API] 服务已启动: http://0.0.0.0:${PORT}`);
  });
}

start().catch((error) => {
  console.error("[Quadrant API] 启动失败:", error);
  process.exit(1);
});
