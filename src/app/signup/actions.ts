"use server";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { SIGNUP_TOKEN_COOKIE, verifySignupToken } from "@/lib/signup-token";

export type SignupActionResult = { ok: true } | { ok: false; error: string };

const EXPIRED_MESSAGE =
  "This signup session has expired. Start again from the login page.";

async function emailFromToken(): Promise<string | null> {
  const cookieStore = await cookies();
  return verifySignupToken(cookieStore.get(SIGNUP_TOKEN_COOKIE)?.value);
}

export async function sendSignupCode(
  fullName: string,
  acceptedTerms: boolean,
  honeypot: string,
): Promise<SignupActionResult> {
  // Bots that fill the hidden field get a fake success and no account.
  if (honeypot) return { ok: true };

  // The email comes from the signed token, never from the client, so the
  // form can't be replayed with a different address.
  const email = await emailFromToken();
  if (!email) return { ok: false, error: EXPIRED_MESSAGE };
  if (!acceptedTerms) {
    return { ok: false, error: "You must accept the Terms of Service." };
  }
  const name = fullName.trim();
  if (!name) return { ok: false, error: "Enter your full name." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    // Creates the auth user; the handle_new_user trigger reads full_name and
    // role from this metadata. Self-serve signup is for property owners only —
    // tenants and staff are provisioned from the owner's dashboard.
    options: {
      shouldCreateUser: true,
      data: { full_name: name, role: "landlord" },
    },
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function verifySignupCode(
  code: string,
): Promise<SignupActionResult> {
  const email = await emailFromToken();
  if (!email) return { ok: false, error: EXPIRED_MESSAGE };

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    email,
    token: code,
    type: "email",
  });
  if (error) {
    return { ok: false, error: "That code didn't work. Check it and try again." };
  }

  // Signup complete: the session cookies are set; the handoff token is done.
  const cookieStore = await cookies();
  cookieStore.delete(SIGNUP_TOKEN_COOKIE);
  return { ok: true };
}
