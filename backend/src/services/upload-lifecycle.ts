import {
  claimExpiredUploadObjects,
  markUploadObjectCleanupFailed,
  markUploadObjectDeleted,
  registerUploadObject,
  type UploadObjectRow,
} from "../data/upload-objects";
import { deleteUploadObject, putUploadObject } from "./oss";
import fs from "node:fs";
import path from "node:path";

type PersistOperations = {
  put: typeof putUploadObject;
  remove: typeof deleteUploadObject;
  register: typeof registerUploadObject;
};

export async function persistUploadObject(
  params: {
    objectKey: string;
    filePath: string;
    ownerIdentity: string;
    userId?: string | null;
    apiKeyId?: string | null;
    sizeBytes: number;
    contentType: string;
  },
  operations: PersistOperations = {
    put: putUploadObject,
    remove: deleteUploadObject,
    register: registerUploadObject,
  }
): Promise<void> {
  let stored = false;
  try {
    await operations.put(params.objectKey, params.filePath, params.contentType);
    stored = true;
    await operations.register({
      objectKey: params.objectKey,
      ownerIdentity: params.ownerIdentity,
      userId: params.userId,
      apiKeyId: params.apiKeyId,
      storage: "oss",
      sizeBytes: params.sizeBytes,
      contentType: params.contentType,
    });
  } catch (error) {
    if (stored) {
      try {
        await operations.remove(params.objectKey);
      } catch (compensationError) {
        console.error(
          "[UploadLifecycle] metadata insert and compensating DELETE both failed:",
          compensationError instanceof Error
            ? compensationError.message
            : String(compensationError)
        );
      }
    }
    throw error;
  }
}

type CleanupOperations = {
  remove: (key: string) => Promise<void>;
};

export async function runUploadCleanupBatch(
  limit = 25,
  operations: CleanupOperations = { remove: deleteUploadObject }
): Promise<{ claimed: number; deleted: number; failed: number }> {
  const rows = await claimExpiredUploadObjects(limit);
  let deleted = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      if (row.storage === "oss") await operations.remove(row.object_key);
      else {
        const localRoot = path.resolve(__dirname, "../../uploads");
        const localPath = path.join(localRoot, path.basename(row.object_key));
        if (localPath.startsWith(`${localRoot}${path.sep}`)) {
          await fs.promises.unlink(localPath).catch((error: NodeJS.ErrnoException) => {
            if (error.code !== "ENOENT") throw error;
          });
        }
      }
      await markUploadObjectDeleted(row.id);
      deleted += 1;
    } catch (error) {
      await markUploadObjectCleanupFailed(row as UploadObjectRow, error);
      failed += 1;
    }
  }
  return { claimed: rows.length, deleted, failed };
}

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

export function startUploadCleanupLoop(): void {
  if (cleanupTimer) return;
  const intervalMs = Math.max(
    30_000,
    Number(process.env.UPLOAD_CLEANUP_INTERVAL_MS || 60_000)
  );
  const run = () => {
    void runUploadCleanupBatch().catch((error) => {
      console.error(
        "[UploadLifecycle] cleanup batch failed:",
        error instanceof Error ? error.message : String(error)
      );
    });
  };
  run();
  cleanupTimer = setInterval(run, intervalMs);
  cleanupTimer.unref?.();
}
