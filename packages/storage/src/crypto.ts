import { randomBytes, createCipheriv, createDecipheriv, createHash } from "node:crypto";

const ALGORITHM = "aes-256-gcm";

function deriveKey(passphrase: string): Buffer {
  return createHash("sha256").update(passphrase).digest();
}

export interface EncryptedPayload {
  encrypted: string;
  iv: string;
  authTag: string;
}

export function encrypt(plaintext: string, passphrase: string): EncryptedPayload {
  const key = deriveKey(passphrase);
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return { encrypted, iv: iv.toString("hex"), authTag };
}

export function decrypt(payload: EncryptedPayload, passphrase: string): string {
  const key = deriveKey(passphrase);
  const iv = Buffer.from(payload.iv, "hex");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(Buffer.from(payload.authTag, "hex"));
  let decrypted = decipher.update(payload.encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}
