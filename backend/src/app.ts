/**
 * Express application factory. `index.ts` owns process start-up (runtime
 * safety checks, bootstrap, listen); this module only assembles middleware
 * and routers in their production order so tests can mount the exact same
 * application without binding a port.
 */
import express from "express";
import cors from "cors";
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
import adminControlPlaneRouter from "./routes/admin-control-plane";
import providerRouter from "./routes/provider";
import providerMonitorRouter from "./routes/provider-monitor";
import tasksRouter from "./routes/tasks";
import audioRouter from "./routes/audio";
import rateLimitsRouter from "./routes/ratelimits";
import ticketsRouter from "./routes/tickets";
import subAccountsRouter from "./routes/sub-accounts";
import demoAdminRouter from "./routes/demo-admin";
import { errorHandler, notFoundHandler } from "./middleware/error";
import { requireApiKeyBeforeLargeJson } from "./middleware/large-json-auth";
import { parsePublicApiJson } from "./middleware/large-json-auth";
import { getBuildInfo } from "./utils/build-info";
import { HEALTH_PATHS, healthCheckHandler } from "./services/health-check";


export function createApp(): express.Express {
  const app = express();
  const buildInfo = getBuildInfo();

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
  // Keep both the dashboard-era and OpenAI-compatible monitoring paths on one
  // dependency-aware implementation. Register before /v1 parsers/routers so the
  // read-only probe never requires an API key or buffers a request body.
  app.get([...HEALTH_PATHS], healthCheckHandler);
  // Audio has its own 64 KB parser and performs API-key admission before reading
  // any request body. Mount it before the broad model-context JSON parser.
  app.use("/v1/audio", audioRouter);
  // Only authenticated public API writes may use the 50 MB model-context limit.
  // All other routes retain the conservative 1 MB global limit.
  app.use(
    "/v1",
    requireApiKeyBeforeLargeJson,
    parsePublicApiJson
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false })); // 支付宝回调等表单请求

  // Anthropic Messages 兼容 API（/v1/messages）— 必须在 /v1 之前挂载
  app.use("/v1/messages", messagesRouter);

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
  app.use("/api/demo-admin", demoAdminRouter);
  app.use("/api/admin", adminControlPlaneRouter);
  app.use("/api/admin", adminRouter);

  app.get("/api/version", (_req, res) => {
    res.json(buildInfo);
  });

  // 404 处理
  app.use(notFoundHandler);

  // 统一错误处理
  app.use(errorHandler);

  return app;
}
