"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { requestSignInCode } from "./actions";

// Bare usernames on the password form resolve to the seeded demo domain, so
// the showcase admin can sign in as "admin" / "admin".
const DEMO_EMAIL_DOMAIN = "example.com";

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code" | "password">("email");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState(""); // honeypot — humans never see it
  const [code, setCode] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Password sign-in for the seeded demo accounts (local dev / showcase).
  // The product's primary flow remains the emailed one-time code.
  async function signInWithPassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const trimmed = identifier.trim().toLowerCase();
    const loginEmail = trimmed.includes("@")
      ? trimmed
      : `${trimmed}@${DEMO_EMAIL_DOMAIN}`;
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password,
    });
    if (error) {
      setBusy(false);
      setError("Incorrect username or password.");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    // Server action: sends the OTP, or hands unregistered emails off to the
    // token-gated /signup flow.
    const result = await requestSignInCode(email, website);
    if (!result.ok) {
      setBusy(false);
      setError(result.error);
      return;
    }
    if (result.next) {
      router.push(result.next);
      return; // keep busy=true so the button stays disabled during navigation
    }
    setBusy(false);
    setStep("code");
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: "email",
    });
    setBusy(false);
    if (error) {
      setError("That code didn't work. Check it and try again.");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">
          ← Back
        </Link>
        <h1 className="mt-4 text-2xl font-semibold">Sign in to PMS</h1>

        {step === "email" ? (
          <form onSubmit={sendCode} className="mt-6 flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Email
              <input
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-base outline-none focus:border-zinc-800 dark:border-zinc-700 dark:focus:border-zinc-300"
              />
            </label>
            {/* Honeypot: visually removed and hidden from assistive tech;
                bots auto-filling every field reveal themselves. */}
            <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
              <label>
                Website
                <input
                  type="text"
                  name="website"
                  tabIndex={-1}
                  autoComplete="off"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                />
              </label>
            </div>
            <button
              type="submit"
              disabled={busy}
              className="rounded-md bg-zinc-900 px-4 py-2 font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              {busy ? "Sending…" : "Email me a sign-in code"}
            </button>
            <p className="text-sm text-zinc-500">
              No password needed — we&apos;ll email you a one-time code.
            </p>
            <button
              type="button"
              onClick={() => {
                setStep("password");
                setError(null);
              }}
              className="text-sm text-zinc-500 underline hover:text-zinc-800 dark:hover:text-zinc-200"
            >
              Sign in with a password instead (demo accounts)
            </button>
          </form>
        ) : step === "password" ? (
          <form onSubmit={signInWithPassword} className="mt-6 flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Username or email
              <input
                type="text"
                required
                autoFocus
                autoComplete="username"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="admin"
                className="rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-base outline-none focus:border-zinc-800 dark:border-zinc-700 dark:focus:border-zinc-300"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Password
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-base outline-none focus:border-zinc-800 dark:border-zinc-700 dark:focus:border-zinc-300"
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="rounded-md bg-zinc-900 px-4 py-2 font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              {busy ? "Signing in…" : "Sign in"}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep("email");
                setPassword("");
                setError(null);
              }}
              className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
            >
              Use an email code instead
            </button>
          </form>
        ) : (
          <form onSubmit={verifyCode} className="mt-6 flex flex-col gap-4">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              We sent a 6-digit code to <span className="font-medium">{email}</span>.
            </p>
            <p className="text-sm text-zinc-500">This code expires in 15 minutes.</p>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Code
              <input
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="123456"
                className="rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-center text-xl tracking-[0.4em] outline-none focus:border-zinc-800 dark:border-zinc-700 dark:focus:border-zinc-300"
              />
            </label>
            <button
              type="submit"
              disabled={busy || code.length !== 6}
              className="rounded-md bg-zinc-900 px-4 py-2 font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              {busy ? "Verifying…" : "Sign in"}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep("email");
                setCode("");
                setError(null);
              }}
              className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
            >
              Use a different email
            </button>
          </form>
        )}

        {error && (
          <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>
        )}
      </div>
    </main>
  );
}
