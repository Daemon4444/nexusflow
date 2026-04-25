import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env"), override: true });

import modelsRouter from "./routes/models";
import keysRouter from "./routes/keys";
import usageRouter from "./routes/usage";
import chatRouter from "./routes/chat";
import v1Router from "./routes/v1";
import messagesRouter from "./routes/messages";
import pixverseRouter from "./routes/pixverse";
import imageRouter from "./routes/image";
import videoRouter from "./routes/video";
import authRouter from "./routes/auth";
import billingRouter from "./routes/billing";
import providerRouter from "./routes/provider";
import providerMonitorRouter from "./routes/provider-monitor";
import tasksRouter from "./routes/tasks";
import rateLimitsRouter from "./routes/ratelimits";
import ticketsRouter from "./routes/tickets";
import protocolRouter from "./routes/protocols";
import { getSessionUser, isAdminSession } from "./middleware/admin";
import { errorHandler, notFoundHandler } from "./middleware/error";

const app = express();
const PORT = Number(process.env.PORT) || 3001;

app.use(cors({
  origin: [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://nexusflow.hk",
    "http://nexusflow.hk",
  ],
  credentials: true,
}));
app.use(express.json({ limit: "1mb" })); // 限制请求体大小，防止内存溢出
app.use(express.urlencoded({ extended: false })); // 支付宝回调等表单请求

// Anthropic Messages 兼容 API（/v1/messages）— 必须在 /v1 之前挂载
app.use("/v1/messages", messagesRouter);

// OpenAI 兼容 API（/v1/chat/completions, /v1/models）
app.use("/v1", v1Router);

// 多协议 Public API（Anthropic / Gemini）
app.use("/", protocolRouter);

// PixVerse 视频生成 API（/v1/video/text, /v1/video/image, /v1/video/status/:id）
app.use("/v1/video", pixverseRouter);

// 阿里云百炼兼容路径 — 视频生成
app.use("/v1/services/aigc/video-generation", pixverseRouter);

// 异步任务 API（/v1/tasks）
app.use("/v1/tasks", tasksRouter);

// 管理面板 API
app.use("/api/auth", authRouter);
app.use("/api/billing", billingRouter);
app.use("/api/provider", providerRouter);
app.use("/api/provider-monitor", providerMonitorRouter);
app.use("/api/models", modelsRouter);
app.use("/api/keys", keysRouter);
app.use("/api/usage", usageRouter);
app.use("/api/chat", chatRouter);
app.use("/api/image", imageRouter);
app.use("/api/video", videoRouter);
app.use("/api/rate-limits", rateLimitsRouter);
app.use("/api/tickets", ticketsRouter);

// Admin API (requires authentication)
import { validateSession } from "./data/users";
import { getAdminUserLimitSummaries } from "./data/ratelimits";
app.get("/api/admin/users", (req, res) => {
  const session = getSessionUser(req, res);
  if (!session) {
    return;
  }
  if (!isAdminSession(session)) {
    res.status(403).json({ success: false, message: "需要管理员权限" });
    return;
  }
  res.json({
    success: true,
    data: getAdminUserLimitSummaries(),
  });
});

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// 404 处理
app.use(notFoundHandler);

// 统一错误处理
app.use(errorHandler);

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[Quadrant API] 服务已启动: http://0.0.0.0:${PORT}`);
});
