import crypto from "crypto";

const ALGO = "aes-256-gcm";
const PREFIX = "enc:gcm:";

function getSecretKey(): Buffer | null {
  const raw = process.env.PROVIDER_SECRET_KEY || "";
  if (!raw) return null;
  return crypto.createHash("sha256").update(raw).digest();
}

export function encryptProviderSecret(secret: string): string {
  const key = getSecretKey();
  if (!key || !secret) return secret;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptProviderSecret(secret: string): string {
  const key = getSecretKey();
  if (!secret || !secret.startsWith(PREFIX)) return secret;
  if (!key) {
    console.error("[ProviderSecrets] PROVIDER_SECRET_KEY is not configured; cannot decrypt provider secrets");
    return "";
  }

  const payload = secret.slice(PREFIX.length);
  const [ivRaw, tagRaw, encryptedRaw] = payload.split(":");
  if (!ivRaw || !tagRaw || !encryptedRaw) {
    console.error("[ProviderSecrets] encrypted payload format is invalid");
    return "";
  }

  try {
    const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(ivRaw, "base64"));
    decipher.setAuthTag(Buffer.from(tagRaw, "base64"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedRaw, "base64")),
      decipher.final(),
    ]);
    return decrypted.toString("utf8");
  } catch (err: any) {
    console.error("[ProviderSecrets] decryption failed (PROVIDER_SECRET_KEY may have been rotated):", err.message);
    return "";
  }
}

export function isEncryptedProviderSecret(secret: string): boolean {
  return typeof secret === "string" && secret.startsWith(PREFIX);
}
