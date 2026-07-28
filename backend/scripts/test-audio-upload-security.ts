import assert from "node:assert/strict";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import type { Server } from "node:http";
import audioRouter from "../src/routes/audio";
import { errorHandler } from "../src/middleware/error";
import { closeDb } from "../src/db/client";

if (process.env.USE_PG_MEM !== "true") {
  throw new Error("test requires USE_PG_MEM=true");
}

const testKey = "sk-air-local-test-000000000000000000000000";

function directorySnapshot(directory: string): string[] {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory).sort();
}

async function main(): Promise<void> {
  const legacyAudioDirectory = path.resolve(__dirname, "../uploads/audio");
  const before = directorySnapshot(legacyAudioDirectory);
  const source = fs.readFileSync(
    path.resolve(__dirname, "../src/routes/audio.ts"),
    "utf8"
  );
  assert.doesNotMatch(source, /diskStorage|audioUpload\.single|cleanupUploadedFile/);

  const app = express();
  app.use("/v1/audio", audioRouter);
  app.use(errorHandler);
  const server: Server = await new Promise((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  const address = server.address();
  assert(address && typeof address === "object");
  const url = `http://127.0.0.1:${address.port}/v1/audio/transcriptions`;

  try {
    const anonymous = new FormData();
    anonymous.set("file", new Blob([Buffer.alloc(1024 * 1024)]), "anonymous.wav");
    const anonymousResponse = await fetch(url, { method: "POST", body: anonymous });
    assert.equal(anonymousResponse.status, 401);

    const authenticated = new FormData();
    authenticated.set("model", "qwen3-asr-flash");
    authenticated.set("file", new Blob([Buffer.alloc(1024)]), "audio.wav");
    const fileResponse = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${testKey}` },
      body: authenticated,
    });
    assert.equal(fileResponse.status, 400);
    assert.equal(
      (await fileResponse.json() as any)?.error?.code,
      "audio_file_upload_not_supported"
    );

    const urlOnlyResponse = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: "qwen3-asr-flash" }),
    });
    assert.equal(urlOnlyResponse.status, 400);
    assert.equal((await urlOnlyResponse.json() as any)?.error?.code, "audio_url_required");

    assert.deepEqual(directorySnapshot(legacyAudioDirectory), before);
    console.log("audio pre-body authentication and no-disk upload checks passed");
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

main()
  .then(async () => {
    await closeDb();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error(error);
    await closeDb();
    process.exit(1);
  });
