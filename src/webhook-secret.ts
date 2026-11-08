// Asana sends the webhook secret once, in the X-Hook-Secret handshake, and
// signs every later event with it. It has to survive restarts, so it lives
// in .data/ (git-ignored), never in the repo.
import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const FILE = ".data/asana-webhook-secret";

export function saveSecret(secret: string) {
  mkdirSync(".data", { recursive: true });
  writeFileSync(FILE, secret, { mode: 0o600 });
}

export function loadSecret(): string | null {
  try {
    return readFileSync(FILE, "utf8").trim() || null;
  } catch {
    return null;
  }
}

/** X-Hook-Signature is the hex HMAC-SHA256 of the raw request body. */
export function isValidSignature(rawBody: string, signature: string | undefined, secret: string): boolean {
  if (!signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}
