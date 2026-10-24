import Link from "next/link";

const steps = [
  {
    title: "Snap a photo",
    body: "A tenant photographs the issue and adds a short description — a leak, a broken fixture, anything.",
  },
  {
    title: "AI reads the lease and the law",
    body: "The photo is reviewed against the signed lease and applicable local law, producing an assessment with cited clauses and a confidence level.",
  },
  {
    title: "Routed to the right party",
    body: "Landlord-responsible issues notify the property manager for confirmation. Tenant-responsible issues come with clear guidance and next steps.",
  },
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between px-6 py-4 sm:px-10">
        <span className="text-lg font-semibold tracking-tight">PMS</span>
        <Link
          href="/login"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          Log in
        </Link>
      </header>

      <main className="flex flex-1 flex-col items-center px-6 sm:px-10">
        <section className="flex max-w-2xl flex-col items-center gap-5 pt-20 pb-16 text-center sm:pt-28">
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            Who fixes it — you or your landlord?
          </h1>
          <p className="max-w-xl text-lg text-zinc-600 dark:text-zinc-400">
            Snap a photo of a maintenance issue. PMS reads your lease and local
            law, tells you who&apos;s responsible, and routes the fix to the
            right place.
          </p>
          <Link
            href="/login"
            className="mt-2 rounded-md bg-zinc-900 px-6 py-3 font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            Get started
          </Link>
        </section>

        <section className="grid w-full max-w-4xl gap-8 pb-20 sm:grid-cols-3">
          {steps.map((step, i) => (
            <div key={step.title} className="flex flex-col gap-2">
              <span className="text-sm font-medium text-zinc-400">
                {i + 1}
              </span>
              <h2 className="font-semibold">{step.title}</h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                {step.body}
              </p>
            </div>
          ))}
        </section>
      </main>

      <footer className="px-6 py-6 sm:px-10">
        <p className="mx-auto max-w-3xl text-center text-xs text-zinc-500">
          PMS provides automated, informational assessments — not legal advice.
          Assessments cite the lease clauses and statutes they rely on, and may
          be incomplete or incorrect. Consult a licensed attorney for decisions
          with legal or financial consequences.
        </p>
      </footer>
    </div>
  );
}
