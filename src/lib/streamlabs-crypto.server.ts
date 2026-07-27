import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function key(): Buffer {
  const raw = process.env.STREAMLABS_TOKEN_ENC_KEY;
  if (!raw) throw new Error("STREAMLABS_TOKEN_ENC_KEY is not set");
  // Accept either base64 (44 chars ~= 32 bytes) or raw >=32 chars.
  const buf = /^[A-Za-z0-9+/=]+$/.test(raw) && raw.length >= 44 ? Buffer.from(raw, "base64") : Buffer.from(raw, "utf8");
  return buf.subarray(0, 32);
}

export function encryptToken(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
}

export function decryptToken(stored: string): string {
  const buf = Buffer.from(stored, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}
