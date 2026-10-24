"use server";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import {
  createSignupToken,
  SIGNUP_TOKEN_COOKIE,
  SIGNUP_TOKEN_TTL_SECONDS,
} from "@/lib/signup-token";

export type SendCodeResult =
  | { ok: true; next?: string }
  | { ok: false; error: string };

export async function requestSignInCode(
  email: string,
  honeypot: string,
): Promise<SendCodeResult> {
  // Bots that fill the hidden field get a fake success and no email.
  if (honeypot) return { ok: true };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    // Login never creates an account; unknown emails are handed off to the
    // token-gated /signup flow below.
    options: { shouldCreateUser: false },
  });

  if (!error) return { ok: true };

  if (error.message.toLowerCase().includes("signups not allowed")) {
    // Supabase just confirmed server-side that this email has no account.
    // Issue the signed handoff token /signup requires before rendering.
    const cookieStore = await cookies();
    cookieStore.set(SIGNUP_TOKEN_COOKIE, createSignupToken(email), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SIGNUP_TOKEN_TTL_SECONDS,
    });
    return { ok: true, next: "/signup" };
  }

  return { ok: false, error: error.message };
}
