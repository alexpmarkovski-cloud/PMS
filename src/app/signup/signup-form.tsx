"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { sendSignupCode, verifySignupCode } from "./actions";

export default function SignupForm({ email }: { email: string }) {
  const router = useRouter();
  const [step, setStep] = useState<"form" | "code">("form");
  const [fullName, setFullName] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [website, setWebsite] = useState(""); // honeypot — humans never see it
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const result = await sendSignupCode(fullName, accepted, website);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setStep("code");
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const result = await verifySignupCode(code);
    if (!result.ok) {
      setBusy(false);
      setError(result.error);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <Link href="/login" className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">
          ← Back
        </Link>
        <h1 className="mt-4 text-2xl font-semibold">Create your account</h1>

        {step === "form" ? (
          <form onSubmit={sendCode} className="mt-6 flex flex-col gap-4">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              No account exists for this email yet. Sign up below to manage
              your properties as an owner.
            </p>
            <p className="text-sm text-zinc-500">
              Renting? Tenant accounts are created by your property manager —
              ask them for an invite instead of signing up here.
            </p>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Email
              <input
                type="email"
                readOnly
                value={email}
                className="rounded-md border border-zinc-300 bg-zinc-100 px-3 py-2 text-base text-zinc-500 outline-none dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Full name
              <input
                type="text"
                required
                autoFocus
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Jordan Smith"
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
            <label className="flex items-start gap-2 text-sm text-zinc-600 dark:text-zinc-400">
              <input
                type="checkbox"
                required
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
                className="mt-0.5 size-4 accent-zinc-900 dark:accent-zinc-100"
              />
              <span>
                I agree to the{" "}
                <Link
                  href="/terms"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-zinc-800 dark:hover:text-zinc-200"
                >
                  Terms of Service
                </Link>
                .
              </span>
            </label>
            <button
              type="submit"
              disabled={busy || !accepted || fullName.trim().length === 0}
              className="rounded-md bg-zinc-900 px-4 py-2 font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              {busy ? "Sending…" : "Email me a sign-up code"}
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
              {busy ? "Verifying…" : "Create account"}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep("form");
                setCode("");
                setError(null);
              }}
              className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
            >
              Back
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
