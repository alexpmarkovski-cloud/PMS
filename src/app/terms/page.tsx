import Link from "next/link";

export const metadata = { title: "Terms of Service — PMS" };

export default function TermsPage() {
  return (
    <main className="flex flex-1 flex-col items-center px-6 py-16">
      <div className="w-full max-w-2xl">
        <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">
          ← Back
        </Link>
        <h1 className="mt-4 text-2xl font-semibold">Terms of Service</h1>
        <p className="mt-6 text-zinc-600 dark:text-zinc-400">
          The full Terms of Service for PMS are being developed and will be
          published here before launch. This page is a placeholder.
        </p>
        <p className="mt-4 text-sm text-zinc-500">
          Questions in the meantime? Contact your property manager.
        </p>
      </div>
    </main>
  );
}
