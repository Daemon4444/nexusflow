import crypto from "crypto";
import fs from "fs";
import https from "https";
import type { IncomingMessage } from "http";

type OssObject = {
  body: IncomingMessage;
  contentType?: string;
  contentLength?: string;
};

const bucket = process.env.OSS_BUCKET || "";
const endpoint = process.env.OSS_ENDPOINT || "";
const accessKeyId = process.env.OSS_ACCESS_KEY_ID || "";
const accessKeySecret = process.env.OSS_ACCESS_KEY_SECRET || "";

export function isOssUploadEnabled(): boolean {
  return Boolean(bucket && endpoint && accessKeyId && accessKeySecret);
}

function assertConfigured(): void {
  if (!isOssUploadEnabled()) {
    throw new Error("OSS upload storage is not configured");
  }
}

function canonicalResource(key: string): string {
  return `/${bucket}/${key}`;
}

function signature(method: string, contentType: string, date: string, key: string): string {
  const stringToSign = `${method}\n\n${contentType}\n${date}\n${canonicalResource(key)}`;
  const digest = crypto.createHmac("sha1", accessKeySecret).update(stringToSign).digest("base64");
  return `OSS ${accessKeyId}:${digest}`;
}

function objectPath(key: string): string {
  return `/${key.split("/").map(encodeURIComponent).join("/")}`;
}

function objectHostname(): string {
  return `${bucket}.${endpoint}`;
}

async function responseError(res: IncomingMessage, operation: string): Promise<Error> {
  let detail = "";
  for await (const chunk of res) {
    detail += chunk.toString();
    if (detail.length > 512) break;
  }
  const error = new Error(`[OSS] ${operation} failed with ${res.statusCode}: ${detail.slice(0, 512)}`) as Error & { statusCode?: number };
  error.statusCode = res.statusCode;
  return error;
}

export async function putUploadObject(key: string, filePath: string, contentType: string): Promise<void> {
  assertConfigured();
  const stat = await fs.promises.stat(filePath);
  const date = new Date().toUTCString();
  const headers = {
    Date: date,
    "Content-Type": contentType,
    "Content-Length": String(stat.size),
    Authorization: signature("PUT", contentType, date, key),
  };

  await new Promise<void>((resolve, reject) => {
    const req = https.request({ hostname: objectHostname(), method: "PUT", path: objectPath(key), headers, timeout: 10_000 }, async (res) => {
      if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
        res.resume();
        resolve();
        return;
      }
      reject(await responseError(res, "PUT"));
    });
    req.on("error", reject);
    req.setTimeout(10_000, () => req.destroy(new Error("[OSS] PUT request timed out")));
    fs.createReadStream(filePath).on("error", reject).pipe(req);
  });
}

export async function getUploadObject(key: string): Promise<OssObject> {
  assertConfigured();
  const date = new Date().toUTCString();
  const headers = {
    Date: date,
    Authorization: signature("GET", "", date, key),
  };

  return new Promise<OssObject>((resolve, reject) => {
    const req = https.request({ hostname: objectHostname(), method: "GET", path: objectPath(key), headers, timeout: 10_000 }, async (res) => {
      if (res.statusCode === 200) {
        resolve({
          body: res,
          contentType: res.headers["content-type"],
          contentLength: res.headers["content-length"],
        });
        return;
      }
      reject(await responseError(res, "GET"));
    });
    req.on("error", reject);
    req.setTimeout(10_000, () => req.destroy(new Error("[OSS] GET request timed out")));
    req.end();
  });
}
