import { createHmac, timingSafeEqual } from "node:crypto";

// Signed handoff token for the hidden /signup flow. Issued by the login
// server action only after Supabase itself confirms the email has no
// account; carried in an httpOnly cookie and verified server-side before
// /signup renders. Server-only module — never import from client code.

export const SIGNUP_TOKEN_COOKIE = "pms-signup-token";
export const SIGNUP_TOKEN_TTL_SECONDS = 15 * 60;

function secret(): string {
  // Server-only secret already required by the admin client; reused as HMAC
  // key material so no extra env var is needed.
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return key;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createSignupToken(email: string): string {
  const payload = Buffer.from(
    JSON.stringify({
      email,
      exp: Date.now() + SIGNUP_TOKEN_TTL_SECONDS * 1000,
    }),
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

// Returns the email the token was issued for, or null if the token is
// missing, tampered with, malformed, or expired.
export function verifySignupToken(token: string | undefined): string | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload));
  const provided = Buffer.from(signature);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return null;
  }
  try {
    const { email, exp } = JSON.parse(
      Buffer.from(payload, "base64url").toString(),
    );
    if (typeof email !== "string" || typeof exp !== "number" || Date.now() > exp) {
      return null;
    }
    return email;
  } catch {
    return null;
  }
}
