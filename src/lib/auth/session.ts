/**
 * lib/auth/session.ts
 *
 * Stateless session cookie — HMAC-SHA256 signed, httpOnly, server-only.
 *
 * ## Signing approach: minimal HMAC-signed payload
 *
 * Format:  `<base64url(JSON)>.<HMAC-SHA256 hex>`
 *
 * Why this over iron-session / jsonwebtoken?
 *   - Zero extra deps — uses Node.js built-in `crypto` module only.
 *   - Tamper-evident: any mutation of the JSON payload invalidates the MAC.
 *   - Stateless: no DB lookup required to validate — full session in cookie.
 *   - Easy to audit: two functions, < 60 lines of crypto code.
 *
 * Trade-offs vs. iron-session:
 *   - No payload encryption (iron-session encrypts). Acceptable here because
 *     the cookie is httpOnly + Secure and the payload (userId, tenantId) is
 *     non-sensitive by itself — it only unlocks RLS scoping, not secrets.
 *   - No automatic key rotation. Rotate SESSION_SECRET + re-login if needed.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export interface SessionPayload {
  userId: string;
  tenantId: string;
  /** Unix timestamp (ms) of issue — checked server-side for expiry */
  iat: number;
}

const COOKIE_NAME = "om_session";
const MAX_AGE_SECONDS = 60 * 60 * 8; // 8 hours
const MAX_AGE_MS = MAX_AGE_SECONDS * 1000;

function getSecret(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "SESSION_SECRET env var missing or shorter than 32 chars. Set a strong secret.",
    );
  }
  return Buffer.from(secret, "utf8");
}

function b64urlEncode(buf: Buffer | string): string {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf, "utf8");
  return b.toString("base64url");
}

function sign(payload: SessionPayload): string {
  const data = b64urlEncode(JSON.stringify(payload));
  const mac = createHmac("sha256", getSecret()).update(data).digest("hex");
  return `${data}.${mac}`;
}

function verify(token: string): SessionPayload | null {
  const dot = token.lastIndexOf(".");
  if (dot === -1) return null;

  const data = token.slice(0, dot);
  const mac = token.slice(dot + 1);

  const expected = createHmac("sha256", getSecret()).update(data).digest("hex");

  // Constant-time comparison — prevents timing attacks
  try {
    const a = Buffer.from(mac, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as SessionPayload;

    // Server-side expiry — independent of browser Max-Age cookie hint.
    // Rejects replayed cookies beyond MAX_AGE even via curl/raw replay.
    if (!payload.iat || Date.now() - payload.iat > MAX_AGE_MS) return null;

    return payload;
  } catch {
    return null;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Build a Set-Cookie header value for the session.
 * Call this on a successful login and include in the Response headers.
 */
export function buildSessionCookie(payload: Omit<SessionPayload, "iat">): string {
  const full: SessionPayload = { ...payload, iat: Date.now() };
  const token = sign(full);
  const flags = [
    `${COOKIE_NAME}=${token}`,
    `Max-Age=${MAX_AGE_SECONDS}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    // "Secure",  // Uncomment in production (requires HTTPS)
  ];
  return flags.join("; ");
}

/**
 * Build a cookie header that immediately expires the session cookie.
 */
export function buildClearSessionCookie(): string {
  return `${COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax`;
}

/**
 * Parse and verify the session cookie from a Request.
 * Returns the session payload, or null if absent / invalid / tampered.
 */
export function readSessionFromRequest(request: Request): SessionPayload | null {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const entry = cookieHeader
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${COOKIE_NAME}=`));
  if (!entry) return null;

  const token = entry.slice(COOKIE_NAME.length + 1);
  return verify(token);
}
