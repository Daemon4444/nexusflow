import assert from "node:assert/strict";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import {
  finalizeUploadQuota,
  reserveUploadQuota,
} from "../src/services/upload-quota";
import {
  persistUploadObject,
  runUploadCleanupBatch,
} from "../src/services/upload-lifecycle";
import { assertUploadStorageConfigured } from "../src/services/oss";
import uploadRouter from "../src/routes/upload";
import { closeRedis } from "../src/services/redis";
import { closeDb, db } from "../src/db/client";

if (!process.env.REDIS_HOST || process.env.USE_PG_MEM !== "true") {
  throw new Error("test requires isolated Redis and USE_PG_MEM=true");
}

const testKey = "sk-air-local-test-000000000000000000000000";

async function main(): Promise<void> {
  process.env.UPLOAD_CONCURRENCY_PER_IDENTITY = "1";
  process.env.UPLOAD_DAILY_BYTES = "1000";
  process.env.UPLOAD_LEASE_SECONDS = "1";
  const first = await reserveUploadQuota("user:quota-concurrency", 100);
  assert(first.allowed);
  assert.deepEqual(
    await reserveUploadQuota("user:quota-concurrency", 10),
    { allowed: false, reason: "concurrency", retryAfterSeconds: 1 }
  );
  await finalizeUploadQuota(first.reservation, 0);

  process.env.UPLOAD_CONCURRENCY_PER_IDENTITY = "2";
  process.env.UPLOAD_DAILY_BYTES = "150";
  const bytes = await reserveUploadQuota("user:quota-bytes", 100);
  assert(bytes.allowed);
  assert.deepEqual(
    await reserveUploadQuota("user:quota-bytes", 51),
    { allowed: false, reason: "daily_bytes", retryAfterSeconds: undefined }
  );
  await finalizeUploadQuota(bytes.reservation, 40);
  const exactRemainder = await reserveUploadQuota("user:quota-bytes", 110);
  assert(exactRemainder.allowed);
  await finalizeUploadQuota(exactRemainder.reservation, 0);

  const crashed = await reserveUploadQuota("user:quota-expiry", 10);
  assert(crashed.allowed);
  await new Promise((resolve) => setTimeout(resolve, 1_100));
  const afterCrash = await reserveUploadQuota("user:quota-expiry", 10);
  assert(afterCrash.allowed, "expired concurrency lease must not strand a slot");
  await finalizeUploadQuota(afterCrash.reservation, 0);

  let putCalls = 0;
  let deleteCalls = 0;
  await assert.rejects(
    persistUploadObject(
      {
        objectKey: "compensation-test.png",
        filePath: "/tmp/not-read-by-stub",
        ownerIdentity: "user:test",
        sizeBytes: 10,
        contentType: "image/png",
      },
      {
        put: async () => { putCalls += 1; },
        remove: async () => { deleteCalls += 1; },
        register: async () => { throw new Error("injected metadata failure"); },
      }
    ),
    /metadata failure/
  );
  assert.equal(putCalls, 1);
  assert.equal(deleteCalls, 1, "metadata failure must compensate the OSS PUT");

  const now = new Date();
  const expired = new Date(now.getTime() - 1000).toISOString();
  const expiredId = randomUUID();
  await db.execute(
    `INSERT INTO upload_objects (
       id, object_key, owner_identity, storage, size_bytes, content_type,
       status, expires_at, created_at, updated_at
     ) VALUES (?, ?, 'user:cleanup', 'oss', 10, 'image/png', 'active', ?, ?, ?)`,
    [expiredId, `cleanup-${expiredId}.png`, expired, now.toISOString(), now.toISOString()]
  );
  const removed: string[] = [];
  const cleanup = await runUploadCleanupBatch(10, {
    remove: async (key) => { removed.push(key); },
  });
  assert.equal(cleanup.deleted, 1);
  assert.equal(removed.length, 1);
  assert.equal(
    (await db.queryOne<{ status: string }>(
      "SELECT status FROM upload_objects WHERE id = ?",
      [expiredId]
    ))?.status,
    "deleted"
  );

  const failedId = randomUUID();
  await db.execute(
    `INSERT INTO upload_objects (
       id, object_key, owner_identity, storage, size_bytes, content_type,
       status, expires_at, created_at, updated_at
     ) VALUES (?, ?, 'user:cleanup', 'oss', 10, 'image/png', 'active', ?, ?, ?)`,
    [failedId, `cleanup-fail-${failedId}.png`, expired, now.toISOString(), now.toISOString()]
  );
  const failedCleanup = await runUploadCleanupBatch(10, {
    remove: async () => { throw new Error("injected OSS delete outage"); },
  });
  assert.equal(failedCleanup.failed, 1);
  const failedRow = await db.queryOne<{ status: string; delete_attempts: number }>(
    "SELECT status, delete_attempts FROM upload_objects WHERE id = ?",
    [failedId]
  );
  assert.equal(failedRow?.status, "delete_failed");
  assert.equal(Number(failedRow?.delete_attempts), 1);

  assert.throws(
    () => assertUploadStorageConfigured({ NODE_ENV: "production" }),
    /requires OSS/
  );
  assert.doesNotThrow(() => assertUploadStorageConfigured({
    NODE_ENV: "production",
    OSS_BUCKET: "bucket",
    OSS_ENDPOINT: "oss.example",
    OSS_ACCESS_KEY_ID: "id",
    OSS_ACCESS_KEY_SECRET: "secret",
  }));

  process.env.UPLOAD_CONCURRENCY_PER_IDENTITY = "2";
  process.env.UPLOAD_DAILY_BYTES = String(512 * 1024 * 1024);
  const uploadDirectory = path.resolve(__dirname, "../uploads");
  const before = new Set(fs.readdirSync(uploadDirectory));
  const app = express();
  app.use("/api/upload", uploadRouter);
  const server: Server = await new Promise((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  const address = server.address();
  assert(address && typeof address === "object");
  try {
    const form = new FormData();
    form.set("file", new Blob([Buffer.from("not a jpeg")], { type: "image/jpeg" }), "bad.jpg");
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/upload`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${testKey}` },
        body: form,
      }
    );
    assert.equal(response.status, 400);
    assert.deepEqual(new Set(fs.readdirSync(uploadDirectory)), before);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }

  console.log("upload quota, compensation, cleanup, and temp-file checks passed");
}

main()
  .then(async () => {
    await closeRedis();
    await closeDb();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error(error);
    await closeRedis().catch(() => undefined);
    await closeDb();
    process.exit(1);
  });
