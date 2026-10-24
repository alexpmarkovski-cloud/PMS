"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { submitMaintenanceRequest } from "./actions";

const MAX_PHOTOS = 5;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export function ReportForm({ propertyId }: { propertyId: string }) {
  const router = useRouter();
  const [description, setDescription] = useState("");
  const [fileNote, setFileNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function checkFiles(input: HTMLInputElement) {
    const files = [...(input.files ?? [])];
    if (files.length > MAX_PHOTOS) {
      setFileNote(`At most ${MAX_PHOTOS} photos — only the first ${MAX_PHOTOS} will be sent.`);
    } else if (files.some((f) => f.size > MAX_PHOTO_BYTES)) {
      setFileNote("Each photo must be under 5MB.");
    } else {
      setFileNote(
        files.length > 0
          ? `${files.length} photo${files.length === 1 ? "" : "s"} selected.`
          : null,
      );
    }
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    setError(null);
    const result = await submitMaintenanceRequest(propertyId, new FormData(form));
    if (!result.ok) {
      setBusy(false);
      setError(result.error);
      return;
    }
    // No refresh needed: the destination route is fetched fresh, and a
    // refresh racing the push can wedge the transition mid-render.
    router.push(`/dashboard/properties/${propertyId}/cases/${result.caseId}`);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        What&apos;s wrong?
        <textarea
          name="description"
          required
          rows={4}
          autoFocus
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. Water is leaking from the bathroom ceiling, getting worse over the past two days."
          className="rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-base outline-none focus:border-zinc-800 dark:border-zinc-700 dark:focus:border-zinc-300"
        />
      </label>

      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Photos of the issue
        <input
          type="file"
          name="photos"
          required
          multiple
          accept="image/*"
          onChange={(e) => checkFiles(e.currentTarget)}
          className="text-sm text-zinc-600 file:mr-2 file:rounded-md file:border-0 file:bg-zinc-200 file:px-3 file:py-1.5 file:text-sm file:font-medium dark:text-zinc-400 dark:file:bg-zinc-800 dark:file:text-zinc-200"
        />
        <span className="text-xs font-normal text-zinc-500">
          {`Up to ${MAX_PHOTOS} photos, 5MB each. Photos only — video isn't supported yet.`}
        </span>
      </label>
      {fileNote && <p className="text-sm text-zinc-500">{fileNote}</p>}

      <button
        type="submit"
        disabled={busy || description.trim().length === 0}
        className="rounded-md bg-zinc-900 px-4 py-2 font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        {busy ? "Submitting…" : "Submit request"}
      </button>
      <p className="text-sm text-zinc-500">
        Our AI reviews your photos, your lease, and local law to suggest who&apos;s
        responsible — informational guidance, not legal advice.
      </p>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
    </form>
  );
}
