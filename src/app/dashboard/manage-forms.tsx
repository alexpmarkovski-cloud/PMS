"use client";

import { useState } from "react";
import Link from "next/link";
import {
  addProperty,
  addTenant,
  addCollaborator,
  addAlertRecipient,
  removeAlertRecipient,
  removeTenant,
  removeCollaborator,
  setUserRole,
  setTenantStatus,
  setCaseStatus,
  uploadLease,
  runAiReview,
  type ManageResult,
} from "./manage-actions";
import {
  COLLABORATOR_LABELS,
  ROLE_LABELS,
  type CollaboratorRole,
  type UserRole,
} from "@/lib/roles";
import {
  CASE_STATUS_LABELS,
  RESPONSIBLE_PARTY_LABELS,
  TENANT_STATUS_LABELS,
  type CaseStatus,
  type ResponsibleParty,
  type TenantStatus,
} from "@/lib/status";

const inputClass =
  "rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 text-sm outline-none focus:border-zinc-800 dark:border-zinc-700 dark:focus:border-zinc-300";
const buttonClass =
  "rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300";
const errorClass = "text-sm text-red-600 dark:text-red-400";

export function AddPropertyForm() {
  const [line1, setLine1] = useState("");
  const [line2, setLine2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("UT");
  const [postal, setPostal] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const result = await addProperty(line1, line2, city, state, postal);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setLine1("");
    setLine2("");
    setCity("");
    setPostal("");
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <input required value={line1} onChange={(e) => setLine1(e.target.value)} placeholder="Address line 1" className={`${inputClass} flex-1 min-w-40`} />
        <input value={line2} onChange={(e) => setLine2(e.target.value)} placeholder="Line 2 (optional)" className={`${inputClass} w-36`} />
      </div>
      <div className="flex flex-wrap gap-2">
        <input required value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" className={`${inputClass} flex-1 min-w-32`} />
        <input required value={state} onChange={(e) => setState(e.target.value)} maxLength={2} placeholder="State" className={`${inputClass} w-16`} />
        <input required value={postal} onChange={(e) => setPostal(e.target.value)} placeholder="ZIP" className={`${inputClass} w-24`} />
        <button type="submit" disabled={busy} className={buttonClass}>
          {busy ? "Adding…" : "Add property"}
        </button>
      </div>
      {error && <p className={errorClass}>{error}</p>}
    </form>
  );
}

// One form for provisioning either a tenant or a staff collaborator on a
// property. Accounts are created without a password — the person signs in
// with the normal email code.
export function AddPersonForm({
  propertyId,
  kind,
}: {
  propertyId: string;
  kind: "tenant" | "collaborator";
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<CollaboratorRole>("manager");
  const [tenantStatus, setTenantStatus] = useState<TenantStatus>("current");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const result: ManageResult =
      kind === "tenant"
        ? await addTenant(propertyId, email, name, tenantStatus)
        : await addCollaborator(propertyId, email, name, role);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setEmail("");
    setName("");
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email@example.com"
          className={`${inputClass} flex-1 min-w-44`}
        />
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Full name"
          className={`${inputClass} w-36`}
        />
        {kind === "collaborator" && (
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as CollaboratorRole)}
            className={inputClass}
          >
            {(Object.keys(COLLABORATOR_LABELS) as CollaboratorRole[]).map((r) => (
              <option key={r} value={r}>
                {COLLABORATOR_LABELS[r]}
              </option>
            ))}
          </select>
        )}
        {kind === "tenant" && (
          <select
            value={tenantStatus}
            onChange={(e) => setTenantStatus(e.target.value as TenantStatus)}
            className={inputClass}
          >
            <option value="current">Current tenant</option>
            <option value="former">Former tenant</option>
          </select>
        )}
        <button type="submit" disabled={busy} className={buttonClass}>
          {busy ? "Adding…" : kind === "tenant" ? "Add tenant" : "Add staff"}
        </button>
      </div>
      {kind === "tenant" && (
        <p className="text-xs text-zinc-500">
          Current tenants get an email letting them know their account was set
          up. Former tenants are added silently — they can still sign in, but
          no notification is sent.
        </p>
      )}
      {error && <p className={errorClass}>{error}</p>}
    </form>
  );
}

export function TenantStatusSelect({
  propertyId,
  tenantId,
  status,
}: {
  propertyId: string;
  tenantId: string;
  status: TenantStatus;
}) {
  const [current, setCurrent] = useState<TenantStatus>(status);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function change(next: TenantStatus) {
    const previous = current;
    setCurrent(next);
    setBusy(true);
    setError(null);
    const result = await setTenantStatus(propertyId, tenantId, next);
    setBusy(false);
    if (!result.ok) {
      setCurrent(previous);
      setError(result.error);
    }
  }

  return (
    <span className="flex items-center gap-2">
      <select
        value={current}
        disabled={busy}
        onChange={(e) => change(e.target.value as TenantStatus)}
        className={inputClass}
      >
        {(Object.keys(TENANT_STATUS_LABELS) as TenantStatus[]).map((s) => (
          <option key={s} value={s}>
            {TENANT_STATUS_LABELS[s]}
          </option>
        ))}
      </select>
      {error && <span className={errorClass}>{error}</span>}
    </span>
  );
}

// Job status dropdown. When the AI review is complete, the verdict's
// responsible party shows as subtext under the control.
export function CaseStatusSelect({
  caseId,
  status,
  responsibleParty,
  readOnly = false,
}: {
  caseId: string;
  status: CaseStatus;
  responsibleParty: ResponsibleParty | null;
  readOnly?: boolean;
}) {
  const [current, setCurrent] = useState<CaseStatus>(status);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function change(next: CaseStatus) {
    const previous = current;
    setCurrent(next);
    setBusy(true);
    setError(null);
    const result = await setCaseStatus(caseId, next);
    setBusy(false);
    if (!result.ok) {
      setCurrent(previous);
      setError(result.error);
    }
  }

  if (readOnly) {
    return (
      <span className="flex flex-col items-end">
        <span className="text-sm">{CASE_STATUS_LABELS[current]}</span>
        {current === "ai_review_completed" && responsibleParty && (
          <span className="text-xs text-zinc-500">
            {RESPONSIBLE_PARTY_LABELS[responsibleParty]}
          </span>
        )}
      </span>
    );
  }

  return (
    <span className="flex flex-col items-end gap-1">
      <select
        value={current}
        disabled={busy}
        onChange={(e) => change(e.target.value as CaseStatus)}
        className={inputClass}
      >
        {(Object.keys(CASE_STATUS_LABELS) as CaseStatus[]).map((s) => (
          <option key={s} value={s}>
            {CASE_STATUS_LABELS[s]}
          </option>
        ))}
      </select>
      {current === "ai_review_completed" && responsibleParty && (
        <span className="text-xs text-zinc-500">
          {RESPONSIBLE_PARTY_LABELS[responsibleParty]}
        </span>
      )}
      {error && <span className={errorClass}>{error}</span>}
    </span>
  );
}

export function UploadLeaseForm({
  propertyId,
  tenantId,
}: {
  propertyId: string;
  tenantId: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    setError(null);
    const result = await uploadLease(propertyId, tenantId, new FormData(form));
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    form.reset();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="file"
          name="file"
          required
          accept=".pdf,.txt,.doc,.docx"
          className="text-sm text-zinc-600 file:mr-2 file:rounded-md file:border-0 file:bg-zinc-200 file:px-3 file:py-1.5 file:text-sm file:font-medium dark:text-zinc-400 dark:file:bg-zinc-800 dark:file:text-zinc-200"
        />
        <button type="submit" disabled={busy} className={buttonClass}>
          {busy ? "Uploading…" : "Upload contract"}
        </button>
      </div>
      {error && <p className={errorClass}>{error}</p>}
    </form>
  );
}

// Triggers the AI review on a pending case (or retries a failed run). The
// model call takes a while — keep the button disabled with live copy.
export function RunAiReviewButton({ caseId }: { caseId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    setError(null);
    const result = await runAiReview(caseId);
    setBusy(false);
    if (!result.ok) setError(result.error);
  }

  return (
    <span className="flex flex-col items-start gap-1">
      <button type="button" onClick={run} disabled={busy} className={buttonClass}>
        {busy ? "Running AI review… (this can take a minute)" : "Run AI review"}
      </button>
      {error && <span className={errorClass}>{error}</span>}
    </span>
  );
}

export type AlertRecipientRow = {
  userId: string;
  name: string | null;
  email: string;
};

// Who gets the automatic email when a job reaches "AI review completed".
// Recipients must already be registered people on the property — the
// server action validates and returns the "doesn't exist" prompt.
export function AlertRecipientsManager({
  propertyId,
  recipients,
}: {
  propertyId: string;
  recipients: AlertRecipientRow[];
}) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const result = await addAlertRecipient(propertyId, email);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setEmail("");
  }

  async function remove(userId: string) {
    setRemovingId(userId);
    setError(null);
    const result = await removeAlertRecipient(propertyId, userId);
    setRemovingId(null);
    if (!result.ok) setError(result.error);
  }

  return (
    <div className="flex flex-col gap-2">
      {recipients.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No alert recipients yet — no one is emailed when an AI review
          completes.
        </p>
      ) : (
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {recipients.map((r) => (
            <li
              key={r.userId}
              className="flex items-center justify-between gap-3 py-1.5"
            >
              <span className="text-sm">
                <span className="font-medium">{r.name ?? "(no name)"}</span>{" "}
                <span className="text-zinc-500">{r.email}</span>
              </span>
              <button
                type="button"
                onClick={() => remove(r.userId)}
                disabled={removingId === r.userId}
                className="text-sm text-zinc-500 hover:text-red-600 disabled:opacity-50 dark:hover:text-red-400"
              >
                {removingId === r.userId ? "Removing…" : "Remove"}
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="flex flex-wrap gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email of a registered person on this property"
          className={`${inputClass} flex-1 min-w-56`}
        />
        <button type="submit" disabled={busy} className={buttonClass}>
          {busy ? "Adding…" : "Add recipient"}
        </button>
      </form>
      {error && <p className={errorClass}>{error}</p>}
    </div>
  );
}

export type TenantRow = {
  tenantId: string;
  name: string | null;
  email: string;
  status: TenantStatus;
};

// Roster with client-side filtering by name/email and current/former.
// readOnly (attorneys) keeps the filters and View links but drops the
// status control and removal.
export function TenantsTable({
  propertyId,
  rows,
  readOnly = false,
}: {
  propertyId: string;
  rows: TenantRow[];
  readOnly?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | TenantStatus>("all");

  const visible = rows.filter((row) => {
    if (statusFilter !== "all" && row.status !== statusFilter) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      (row.name ?? "").toLowerCase().includes(q) ||
      row.email.toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by name or email"
          className={`${inputClass} flex-1 min-w-48`}
        />
        <select
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(e.target.value as "all" | TenantStatus)
          }
          className={inputClass}
        >
          <option value="all">All tenants</option>
          <option value="current">Current</option>
          <option value="former">Former</option>
        </select>
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-zinc-500">
          {rows.length === 0 ? "No tenants yet." : "No tenants match the filter."}
        </p>
      ) : (
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {visible.map((row) => (
            <li
              key={row.tenantId}
              className="flex flex-wrap items-center justify-between gap-3 py-2"
            >
              <span className="text-sm">
                <span className="font-medium">{row.name ?? "(no name)"}</span>{" "}
                <span className="text-zinc-500">{row.email}</span>
              </span>
              <span className="flex items-center gap-3">
                {readOnly ? (
                  <span className="text-sm text-zinc-500">
                    {TENANT_STATUS_LABELS[row.status]}
                  </span>
                ) : (
                  <TenantStatusSelect
                    propertyId={propertyId}
                    tenantId={row.tenantId}
                    status={row.status}
                  />
                )}
                <Link
                  href={`/dashboard/properties/${propertyId}/tenants/${row.tenantId}`}
                  className="text-sm underline hover:text-zinc-800 dark:hover:text-zinc-200"
                >
                  View tenant
                </Link>
                {!readOnly && (
                  <RemoveButton
                    propertyId={propertyId}
                    userId={row.tenantId}
                    kind="tenant"
                  />
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function RemoveButton({
  propertyId,
  userId,
  kind,
}: {
  propertyId: string;
  userId: string;
  kind: "tenant" | "collaborator";
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    setError(null);
    const result =
      kind === "tenant"
        ? await removeTenant(propertyId, userId)
        : await removeCollaborator(propertyId, userId);
    setBusy(false);
    if (!result.ok) setError(result.error);
  }

  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        onClick={remove}
        disabled={busy}
        className="text-sm text-zinc-500 hover:text-red-600 disabled:opacity-50 dark:hover:text-red-400"
      >
        {busy ? "Removing…" : "Remove"}
      </button>
      {error && <span className={errorClass}>{error}</span>}
    </span>
  );
}

export function RoleSelect({
  userId,
  role,
}: {
  userId: string;
  role: UserRole;
}) {
  const [current, setCurrent] = useState<UserRole>(role);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function change(next: UserRole) {
    const previous = current;
    setCurrent(next);
    setBusy(true);
    setError(null);
    const result = await setUserRole(userId, next);
    setBusy(false);
    if (!result.ok) {
      setCurrent(previous);
      setError(result.error);
    }
  }

  return (
    <span className="flex items-center gap-2">
      <select
        value={current}
        disabled={busy}
        onChange={(e) => change(e.target.value as UserRole)}
        className={inputClass}
      >
        {(Object.keys(ROLE_LABELS) as UserRole[]).map((r) => (
          <option key={r} value={r}>
            {ROLE_LABELS[r]}
          </option>
        ))}
      </select>
      {error && <span className={errorClass}>{error}</span>}
    </span>
  );
}
