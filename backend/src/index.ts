import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env"), override: true });

import modelsRouter from "./routes/models";
import keysRouter from "./routes/keys";
import usageRouter from "./routes/usage";
import v1Router from "./routes/v1";
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
import protocolRouter from "./routes/protocols";
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

app.use(cors({
  origin: [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:19999",
    "http://127.0.0.1:19999",
    "http://47.85.190.59",
    "https://nexusflow.hk",
    "http://nexusflow.hk",
  ],
  credentials: true,
}));
app.use(express.json({ limit: "1mb" })); // Limit body size to prevent OOM
app.use(express.urlencoded({ extended: false })); // Form requests, e.g. Alipay callbacks

// Anthropic Messages-compatible API (/v1/messages) - must be mounted before /v1
app.use("/v1/messages", messagesRouter);

// OpenAI Audio API (/v1/audio/speech, /v1/audio/transcriptions) - must be mounted before /v1
app.use("/v1/audio", audioRouter);

// OpenAI-compatible API (/v1/chat/completions, /v1/models)
app.use("/v1", v1Router);

// Gemini-compatible Public API. Anthropic Messages is mounted above as the single /v1/messages implementation.
app.use("/", protocolRouter);

// PixVerse video generation API (/v1/video/text, /v1/video/image, /v1/video/status/:id)
app.use("/v1/video", pixverseRouter);

// Aliyun Bailian-compatible path - video generation
app.use("/v1/services/aigc/video-generation", pixverseRouter);

// OpenAI-style video generation alias for NexusFlow async video tasks.
app.use("/v1/videos", videoRouter);

// Async tasks API (/v1/tasks)
app.use("/v1/tasks", tasksRouter);

// Admin panel API
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
app.use("/api/admin", adminRouter);

// Admin API (requires authentication)
import { cleanExpiredSessions } from "./data/users";
import { seedApiKeysIfNeeded } from "./data/apikeys";

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// 404 handler
app.use(notFoundHandler);

// Unified error handler
app.use(errorHandler);

async function start() {
  try {
    await cleanExpiredSessions();
    await seedApiKeysIfNeeded();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[Quadrant API] Database maintenance task skipped: ${message}`);
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Quadrant API] Service started: http://0.0.0.0:${PORT}`);
  });
}

start().catch((error) => {
  console.error("[Quadrant API] Failed to start:", error);
  process.exit(1);
});
