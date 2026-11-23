'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export type ProjectInfo = {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  status: string;
  createdAt: string;
};


export function EditProjectForm({
  project,
  orgId,
  onUpdated,
  onCancel,
}: {
  project: ProjectInfo;
  orgId: string;
  onUpdated: (p: ProjectInfo) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const res = await fetch(`${API_URL}/organizations/${orgId}/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name,
          description: description || null,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.message ?? 'Failed to update project.');
        return;
      }

      const updated = (await res.json()) as ProjectInfo;
      onUpdated(updated);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <h2 className="text-lg font-medium text-black dark:text-zinc-50">Edit project</h2>
      <input
        type="text"
        required
        placeholder="Project name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        disabled={submitting}
        className="rounded-lg border border-black/[.15] bg-transparent px-3 py-2 text-sm text-black placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-black/20 disabled:opacity-50 dark:border-white/[.2] dark:text-zinc-50 dark:placeholder:text-zinc-500 dark:focus:ring-white/20"
      />
      <textarea
        placeholder="Description (optional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        disabled={submitting}
        rows={2}
        className="rounded-lg border border-black/[.15] bg-transparent px-3 py-2 text-sm text-black placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-black/20 disabled:opacity-50 dark:border-white/[.2] dark:text-zinc-50 dark:placeholder:text-zinc-500 dark:focus:ring-white/20"
      />
      <div className="flex gap-2 self-end">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="rounded-lg border border-black/[.15] px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-white/[.2] dark:text-zinc-50 dark:hover:bg-zinc-900"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-50 dark:text-black dark:hover:bg-zinc-200"
        >
          {submitting ? 'Saving…' : 'Save'}
        </button>
      </div>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </form>
  );
}

type ApiKeyInfo = {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
};

type ApiKeyCreated = ApiKeyInfo & { key: string };

export function TrackingCredentials({ orgId, projectId }: { orgId: string; projectId: string }) {
  const [credentials, setCredentials] = useState<ApiKeyInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState<ApiKeyCreated | null>(null);
  const [copied, setCopied] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [rotatingId, setRotatingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(
          `${API_URL}/organizations/${orgId}/projects/${projectId}/api-keys`,
          { credentials: 'include' },
        );
        if (cancelled) return;
        if (res.ok) {
          setCredentials(await res.json());
        }
      } catch {
        if (!cancelled) setError('Failed to load credentials.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [orgId, projectId]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setCreating(true);

    try {
      const res = await fetch(`${API_URL}/organizations/${orgId}/projects/${projectId}/api-keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.message ?? 'Failed to create credential.');
        return;
      }

      const created = (await res.json()) as ApiKeyCreated;
      setNewKey(created);
      setCredentials((prev) => [
        {
          id: created.id,
          name: created.name,
          keyPrefix: created.keyPrefix,
          createdAt: created.createdAt,
          lastUsedAt: null,
        },
        ...prev,
      ]);
      setName('');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setCreating(false);
    }
  }

  async function handleCopy(key: string) {
    try {
      await navigator.clipboard.writeText(key);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select the text
    }
  }

  async function handleRevoke(keyId: string) {
    if (!confirm('Are you sure you want to revoke this credential? This cannot be undone.')) return;
    setRevokingId(keyId);
    setError('');
    try {
      const res = await fetch(
        `${API_URL}/organizations/${orgId}/projects/${projectId}/api-keys/${keyId}`,
        { method: 'DELETE', credentials: 'include' },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.message ?? 'Failed to revoke credential.');
        return;
      }
      setCredentials((prev) => prev.filter((c) => c.id !== keyId));
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setRevokingId(null);
    }
  }

  async function handleRotate(cred: ApiKeyInfo) {
    if (!confirm('Rotate this credential? The old key will be revoked immediately.')) return;
    setRotatingId(cred.id);
    setError('');
    try {
      const res = await fetch(
        `${API_URL}/organizations/${orgId}/projects/${projectId}/api-keys/${cred.id}/rotate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ name: cred.name }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.message ?? 'Failed to rotate credential.');
        return;
      }
      const created = (await res.json()) as ApiKeyCreated;
      setNewKey(created);
      setCredentials((prev) => [
        {
          id: created.id,
          name: created.name,
          keyPrefix: created.keyPrefix,
          createdAt: created.createdAt,
          lastUsedAt: null,
        },
        ...prev.filter((c) => c.id !== cred.id),
      ]);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setRotatingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {newKey && (
        <div className="rounded-2xl border border-emerald-200 bg-white p-6 dark:border-emerald-800/40 dark:bg-zinc-900">
          <div className="mb-4 flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-900/30">
                <svg className="h-5 w-5 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-zinc-50">
                  Key generated successfully
                </p>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-zinc-400">
                  Copy it now — you won&apos;t be able to see it again
                </p>
              </div>
            </div>
            <button
              onClick={() => setNewKey(null)}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="flex items-stretch gap-2">
            <div className="flex flex-1 items-center rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-800">
              <code className="flex-1 overflow-auto font-mono text-sm text-gray-900 dark:text-zinc-100">
                {newKey.key}
              </code>
            </div>
            <button
              onClick={() => handleCopy(newKey.key)}
              className={`shrink-0 rounded-xl px-5 py-3 text-sm font-semibold transition-all ${
                copied
                  ? 'bg-emerald-500 text-white shadow-sm'
                  : 'bg-gray-900 text-white hover:bg-gray-800 dark:bg-zinc-100 dark:text-gray-900 dark:hover:bg-zinc-200'
              }`}
            >
              {copied ? (
                <span className="flex items-center gap-1.5">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                  Copied!
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
                  </svg>
                  Copy key
                </span>
              )}
            </button>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900 dark:text-zinc-50">Create new key</h2>
        </div>
        <form onSubmit={handleCreate} className="flex gap-3">
          <input
            type="text"
            required
            placeholder="Key name (e.g. Production, Staging)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={creating}
            className="flex-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 transition-colors focus:border-blue-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:placeholder:text-zinc-500 dark:focus:border-blue-700 dark:focus:bg-zinc-800 dark:focus:ring-blue-900/30"
          />
          <button
            type="submit"
            disabled={creating}
            className="shrink-0 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-700 hover:shadow disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
          >
            {creating ? (
              <span className="flex items-center gap-2">
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Generating…
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Generate
              </span>
            )}
          </button>
        </form>
        {error && (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 dark:bg-red-950/30">
            <svg className="h-4 w-4 shrink-0 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="border-b border-gray-100 px-6 py-4 dark:border-zinc-800">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900 dark:text-zinc-50">Active keys</h2>
            {!loading && (
              <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-500 dark:bg-zinc-800 dark:text-zinc-400">
                {credentials.length}
              </span>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-blue-500" />
              <p className="text-sm text-gray-400 dark:text-zinc-500">Loading keys…</p>
            </div>
          </div>
        ) : credentials.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100 dark:bg-zinc-800">
              <svg className="h-6 w-6 text-gray-400 dark:text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-500 dark:text-zinc-400">No API keys yet</p>
            <p className="mt-1 text-xs text-gray-400 dark:text-zinc-500">Generate one above to start sending events</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-zinc-800">
            {credentials.map((cred) => (
              <div key={cred.id} className="flex items-center justify-between px-6 py-4 transition-colors hover:bg-gray-50/50 dark:hover:bg-zinc-800/30">
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-indigo-950/40 dark:to-blue-950/40">
                    <svg className="h-5 w-5 text-indigo-500 dark:text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
                    </svg>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-semibold text-gray-900 dark:text-zinc-50">
                      {cred.name}
                    </span>
                    <span className="font-mono text-xs text-gray-400 dark:text-zinc-500">
                      {cred.keyPrefix}••••••••
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex flex-col items-end gap-0.5">
                    <span className="text-xs text-gray-500 dark:text-zinc-400">
                      Created {new Date(cred.createdAt).toLocaleDateString()}
                    </span>
                    {cred.lastUsedAt && (
                      <span className="text-xs text-gray-400 dark:text-zinc-500">
                        Last used {new Date(cred.lastUsedAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => handleRotate(cred)}
                      disabled={rotatingId === cred.id || revokingId === cred.id}
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition-all hover:border-gray-300 hover:bg-gray-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-600 dark:hover:bg-zinc-800"
                    >
                      {rotatingId === cred.id ? 'Rotating…' : 'Rotate'}
                    </button>
                    <button
                      onClick={() => handleRevoke(cred.id)}
                      disabled={revokingId === cred.id || rotatingId === cred.id}
                      className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition-all hover:border-red-300 hover:bg-red-50 disabled:opacity-50 dark:border-red-900/50 dark:text-red-400 dark:hover:border-red-800 dark:hover:bg-red-950/30"
                    >
                      {revokingId === cred.id ? 'Revoking…' : 'Revoke'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

type PeriodPreset = '7d' | '30d' | '90d';

function getDateRange(preset: PeriodPreset): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date();
  const days = preset === '7d' ? 7 : preset === '30d' ? 30 : 90;
  start.setUTCDate(start.getUTCDate() - days + 1);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

function getActivePreset(startDate: string, endDate: string): PeriodPreset | null {
  for (const p of ['7d', '30d', '90d'] as PeriodPreset[]) {
    const range = getDateRange(p);
    if (range.startDate === startDate && range.endDate === endDate) return p;
  }
  return null;
}

function validateDateRange(startDate: string, endDate: string): string | null {
  if (!startDate || !endDate) return 'Both dates are required.';
  if (endDate < startDate) return 'End date must not be before start date.';
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
  if (diffDays > 365) return 'Date range must not exceed 365 days.';
  return null;
}

export function DateRangeControl({
  startDate,
  endDate,
  onChange,
}: {
  startDate: string;
  endDate: string;
  onChange: (startDate: string, endDate: string) => void;
}) {
  const [localStart, setLocalStart] = useState(startDate);
  const [localEnd, setLocalEnd] = useState(endDate);
  const [error, setError] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const activePreset = getActivePreset(localStart, localEnd);

  function handlePreset(preset: PeriodPreset) {
    const range = getDateRange(preset);
    setLocalStart(range.startDate);
    setLocalEnd(range.endDate);
    setError('');
    setShowCustom(false);
    onChange(range.startDate, range.endDate);
  }

  function handleCustomChange(newStart: string, newEnd: string) {
    setLocalStart(newStart);
    setLocalEnd(newEnd);
    const validationError = validateDateRange(newStart, newEnd);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError('');
    onChange(newStart, newEnd);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className="inline-flex rounded-lg bg-gray-100 p-0.5 dark:bg-zinc-800">
          {(['7d', '30d', '90d'] as PeriodPreset[]).map((p) => (
            <button
              key={p}
              onClick={() => handlePreset(p)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
                activePreset === p
                  ? 'bg-white text-gray-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-50'
                  : 'text-gray-500 hover:text-gray-700 dark:text-zinc-400 dark:hover:text-zinc-200'
              }`}
            >
              {p === '7d' ? '7 days' : p === '30d' ? '30 days' : '90 days'}
            </button>
          ))}
          <button
            onClick={() => setShowCustom(!showCustom)}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
              !activePreset && !showCustom
                ? 'bg-white text-gray-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-50'
                : showCustom
                  ? 'bg-white text-gray-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-50'
                  : 'text-gray-500 hover:text-gray-700 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            Custom
          </button>
        </div>
        <span className="text-xs text-gray-400 dark:text-zinc-500">
          {formatDateRange(startDate, endDate)}
        </span>
      </div>

      {showCustom && (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={localStart}
            onChange={(e) => handleCustomChange(e.target.value, localEnd)}
            className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-700 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
          />
          <svg className="h-3.5 w-3.5 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
          </svg>
          <input
            type="date"
            value={localEnd}
            onChange={(e) => handleCustomChange(localStart, e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-700 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
          />
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
      )}
    </div>
  );
}

function formatDateRange(startDate: string, endDate: string): string {
  const start = new Date(startDate + 'T00:00:00Z');
  const end = new Date(endDate + 'T00:00:00Z');
  const opts: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  };
  return `${start.toLocaleDateString('en-US', opts)} – ${end.toLocaleDateString('en-US', opts)}`;
}

type EventActivityData = {
  total: number;
  daily: Array<{ date: string; count: number }>;
  startDate: string;
  endDate: string;
};

export function EventActivitySection({
  orgId,
  projectId,
  startDate,
  endDate,
}: {
  orgId: string;
  projectId: string;
  startDate: string;
  endDate: string;
}) {
  const [data, setData] = useState<EventActivityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(
          `${API_URL}/organizations/${orgId}/projects/${projectId}/analytics/event-activity?startDate=${startDate}&endDate=${endDate}`,
          { credentials: 'include' },
        );
        if (cancelled) return;
        if (res.ok) {
          setData(await res.json());
        } else {
          setError('Failed to load event activity.');
        }
      } catch {
        if (!cancelled) setError('Network error loading event activity.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [orgId, projectId, startDate, endDate]);

  const maxCount = data ? Math.max(...data.daily.map((d) => d.count), 1) : 1;

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-medium text-black dark:text-zinc-50">Event activity</h2>

      {loading && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading event activity…</p>
      )}

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {!loading && !error && data && (
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-black/[.08] px-4 py-3 dark:border-white/[.08]">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {formatDateRange(data.startDate, data.endDate)}
            </p>
            <p className="mt-1 text-3xl font-semibold text-black dark:text-zinc-50">
              {data.total.toLocaleString()}
            </p>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              total event{data.total === 1 ? '' : 's'}
            </p>
          </div>

          {data.total === 0 ? (
            <div className="rounded-lg border border-black/[.08] bg-zinc-50 px-4 py-3 dark:border-white/[.08] dark:bg-zinc-900">
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                No events recorded in this period. Set up the Userpulse SDK to start tracking.
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-black/[.08] px-4 py-3 dark:border-white/[.08]">
              <p className="mb-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Daily breakdown
              </p>
              <div className="flex items-end gap-px" style={{ height: '80px' }}>
                {data.daily.map((d) => (
                  <div key={d.date} className="group relative flex-1" style={{ height: '100%' }}>
                    <div
                      className="absolute bottom-0 w-full rounded-t bg-black/80 dark:bg-zinc-300 transition-colors group-hover:bg-black dark:group-hover:bg-zinc-100"
                      style={{
                        height: `${Math.max((d.count / maxCount) * 100, d.count > 0 ? 4 : 0)}%`,
                        minHeight: d.count > 0 ? '2px' : '0',
                      }}
                    />
                    <div className="pointer-events-none absolute -top-8 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded bg-black px-2 py-1 text-xs text-white group-hover:block dark:bg-zinc-200 dark:text-black">
                      {d.date}: {d.count.toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type ActiveUsersData = {
  total: number;
  daily: Array<{ date: string; count: number }>;
  startDate: string;
  endDate: string;
  definition: string;
};

export function ActiveUsersSection({
  orgId,
  projectId,
  startDate,
  endDate,
}: {
  orgId: string;
  projectId: string;
  startDate: string;
  endDate: string;
}) {
  const [data, setData] = useState<ActiveUsersData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showDefinition, setShowDefinition] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(
          `${API_URL}/organizations/${orgId}/projects/${projectId}/analytics/active-users?startDate=${startDate}&endDate=${endDate}`,
          { credentials: 'include' },
        );
        if (cancelled) return;
        if (res.ok) {
          setData(await res.json());
        } else {
          setError('Failed to load active users.');
        }
      } catch {
        if (!cancelled) setError('Network error loading active users.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [orgId, projectId, startDate, endDate]);

  const maxCount = data ? Math.max(...data.daily.map((d) => d.count), 1) : 1;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-medium text-black dark:text-zinc-50">Active users</h2>
        <button
          onClick={() => setShowDefinition(!showDefinition)}
          className="rounded-full px-1.5 py-0.5 text-xs text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
          aria-label="Show active user definition"
        >
          ?
        </button>
      </div>

      {showDefinition && data?.definition && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-800 dark:bg-blue-950">
          <p className="text-sm text-blue-700 dark:text-blue-300">{data.definition}</p>
        </div>
      )}

      {loading && <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading active users…</p>}

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {!loading && !error && data && (
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-black/[.08] px-4 py-3 dark:border-white/[.08]">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {formatDateRange(data.startDate, data.endDate)}
            </p>
            <p className="mt-1 text-3xl font-semibold text-black dark:text-zinc-50">
              {data.total.toLocaleString()}
            </p>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              active user{data.total === 1 ? '' : 's'}
            </p>
          </div>

          {data.total === 0 ? (
            <div className="rounded-lg border border-black/[.08] bg-zinc-50 px-4 py-3 dark:border-white/[.08] dark:bg-zinc-900">
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                No active users in this period. Events need a userId or anonymousId to count.
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-black/[.08] px-4 py-3 dark:border-white/[.08]">
              <p className="mb-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Daily active users
              </p>
              <div className="flex items-end gap-px" style={{ height: '80px' }}>
                {data.daily.map((d) => (
                  <div key={d.date} className="group relative flex-1" style={{ height: '100%' }}>
                    <div
                      className="absolute bottom-0 w-full rounded-t bg-black/80 dark:bg-zinc-300 transition-colors group-hover:bg-black dark:group-hover:bg-zinc-100"
                      style={{
                        height: `${Math.max((d.count / maxCount) * 100, d.count > 0 ? 4 : 0)}%`,
                        minHeight: d.count > 0 ? '2px' : '0',
                      }}
                    />
                    <div className="pointer-events-none absolute -top-8 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded bg-black px-2 py-1 text-xs text-white group-hover:block dark:bg-zinc-200 dark:text-black">
                      {d.date}: {d.count.toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type FeatureAdoptionData = {
  features: Array<{
    featureId: string;
    featureName: string;
    adoptionRate: number;
    featureUsers: number;
    totalUsers: number;
  }>;
  totalActiveUsers: number;
  startDate: string;
  endDate: string;
  definition: string;
};

export function FeatureAdoptionSection({
  orgId,
  projectId,
  startDate,
  endDate,
}: {
  orgId: string;
  projectId: string;
  startDate: string;
  endDate: string;
}) {
  const [data, setData] = useState<FeatureAdoptionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showDefinition, setShowDefinition] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(
          `${API_URL}/organizations/${orgId}/projects/${projectId}/analytics/feature-adoption?startDate=${startDate}&endDate=${endDate}`,
          { credentials: 'include' },
        );
        if (cancelled) return;
        if (res.ok) {
          setData(await res.json());
        } else {
          setError('Failed to load feature adoption.');
        }
      } catch {
        if (!cancelled) setError('Network error loading feature adoption.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [orgId, projectId, startDate, endDate]);

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl border border-gray-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="border-b border-gray-100 px-6 py-4 dark:border-zinc-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-gray-900 dark:text-zinc-50">Feature adoption</h2>
              {data && (
                <button
                  onClick={() => setShowDefinition(!showDefinition)}
                  className="flex h-5 w-5 items-center justify-center rounded-full border border-gray-200 text-xs text-gray-400 transition-colors hover:border-gray-300 hover:bg-gray-50 hover:text-gray-600 dark:border-zinc-700 dark:text-zinc-500 dark:hover:border-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
                  aria-label="Show feature adoption definition"
                >
                  ?
                </button>
              )}
            </div>
            {!loading && !error && data && data.features.length > 0 && data.totalActiveUsers > 0 && (
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-gray-400 dark:text-zinc-500">Active users</span>
                  <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
                    {data.totalActiveUsers.toLocaleString()}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {showDefinition && data?.definition && (
          <div className="border-b border-gray-100 bg-blue-50/50 px-6 py-3 dark:border-zinc-800 dark:bg-blue-950/20">
            <p className="text-xs text-gray-500 dark:text-zinc-400">{data.definition}</p>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-blue-500" />
              <p className="text-sm text-gray-400 dark:text-zinc-500">Loading feature adoption…</p>
            </div>
          </div>
        ) : error ? (
          <div className="px-6 py-8">
            <div className="flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 dark:bg-red-950/30">
              <svg className="h-4 w-4 shrink-0 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          </div>
        ) : data && data.features.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 dark:bg-emerald-900/20">
              <svg className="h-6 w-6 text-emerald-400 dark:text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-500 dark:text-zinc-400">No features mapped</p>
            <p className="mt-1 text-xs text-gray-400 dark:text-zinc-500">Map events to features to see adoption rates</p>
          </div>
        ) : data && data.totalActiveUsers === 0 ? (
          <div className="flex flex-col items-center justify-center py-14">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100 dark:bg-zinc-800">
              <svg className="h-6 w-6 text-gray-400 dark:text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-500 dark:text-zinc-400">No active users</p>
            <p className="mt-1 text-xs text-gray-400 dark:text-zinc-500">No users were active in this period</p>
          </div>
        ) : data ? (
          <>
            <div className="border-b border-gray-100 px-6 py-3 dark:border-zinc-800">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-gray-400 dark:text-zinc-500">Period</span>
                  <span className="text-xs font-semibold text-gray-600 dark:text-zinc-300">{formatDateRange(data.startDate, data.endDate)}</span>
                </div>
                <div className="h-3 w-px bg-gray-200 dark:bg-zinc-700" />
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-gray-400 dark:text-zinc-500">Features</span>
                  <span className="text-xs font-semibold text-gray-600 dark:text-zinc-300">{data.features.length}</span>
                </div>
              </div>
            </div>

            <div className="divide-y divide-gray-100 dark:divide-zinc-800">
              {data.features.map((f) => (
                <div key={f.featureId} className="flex items-center gap-4 px-6 py-4 transition-colors hover:bg-gray-50/50 dark:hover:bg-zinc-800/30">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-50 to-green-50 dark:from-emerald-950/40 dark:to-green-950/40">
                    <svg className="h-4 w-4 text-emerald-500 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
                    </svg>
                  </div>
                  <div className="flex flex-1 flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-gray-900 dark:text-zinc-50">{f.featureName}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-400 dark:text-zinc-500">
                          {f.featureUsers.toLocaleString()} / {f.totalUsers.toLocaleString()} users
                        </span>
                        <span className={`min-w-[3.5rem] text-right text-sm font-bold tabular-nums ${
                          f.adoptionRate >= 75 ? 'text-emerald-600 dark:text-emerald-400' :
                          f.adoptionRate >= 40 ? 'text-blue-600 dark:text-blue-400' :
                          f.adoptionRate >= 15 ? 'text-amber-600 dark:text-amber-400' :
                          'text-gray-500 dark:text-zinc-400'
                        }`}>
                          {f.adoptionRate.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-zinc-800">
                      <div
                        className={`h-full rounded-full transition-all ${
                          f.adoptionRate >= 75 ? 'bg-gradient-to-r from-emerald-400 to-green-400 dark:from-emerald-500 dark:to-green-500' :
                          f.adoptionRate >= 40 ? 'bg-gradient-to-r from-blue-400 to-indigo-400 dark:from-blue-500 dark:to-indigo-500' :
                          f.adoptionRate >= 15 ? 'bg-gradient-to-r from-amber-400 to-orange-400 dark:from-amber-500 dark:to-orange-500' :
                          'bg-gray-300 dark:bg-zinc-600'
                        }`}
                        style={{ width: `${Math.max(f.adoptionRate, 2)}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

type FeatureUsageTrendsData = {
  featureId: string;
  featureName: string;
  total: number;
  daily: Array<{ date: string; count: number }>;
  startDate: string;
  endDate: string;
};

type FeatureSummary = { id: string; name: string; status: string };

export function FeatureUsageTrendsSection({
  orgId,
  projectId,
  startDate,
  endDate,
}: {
  orgId: string;
  projectId: string;
  startDate: string;
  endDate: string;
}) {
  const [features, setFeatures] = useState<FeatureSummary[]>([]);
  const [featuresLoading, setFeaturesLoading] = useState(true);
  const [selectedFeatureId, setSelectedFeatureId] = useState<string>('');
  const [data, setData] = useState<FeatureUsageTrendsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function loadFeatures() {
      try {
        const res = await fetch(
          `${API_URL}/organizations/${orgId}/projects/${projectId}/features`,
          { credentials: 'include' },
        );
        if (cancelled) return;
        if (res.ok) {
          const all = (await res.json()) as FeatureSummary[];
          const active = all.filter((f) => f.status === 'ACTIVE');
          setFeatures(active);
          if (active.length > 0 && !selectedFeatureId) {
            setSelectedFeatureId(active[0].id);
          }
        }
      } catch {
        // features load failure is not critical
      } finally {
        if (!cancelled) setFeaturesLoading(false);
      }
    }

    void loadFeatures();
    return () => {
      cancelled = true;
    };
  }, [orgId, projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selectedFeatureId) return;

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(
          `${API_URL}/organizations/${orgId}/projects/${projectId}/analytics/feature-usage-trends?startDate=${startDate}&endDate=${endDate}&featureId=${selectedFeatureId}`,
          { credentials: 'include' },
        );
        if (cancelled) return;
        if (res.ok) {
          setData(await res.json());
        } else {
          setError('Failed to load feature usage trends.');
        }
      } catch {
        if (!cancelled) setError('Network error loading feature usage trends.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [orgId, projectId, startDate, endDate, selectedFeatureId]);

  const maxCount = data ? Math.max(...data.daily.map((d) => d.count), 1) : 1;

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl border border-gray-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="border-b border-gray-100 px-6 py-4 dark:border-zinc-800">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900 dark:text-zinc-50">Feature usage trends</h2>
            {!featuresLoading && features.length > 0 && (
              <select
                value={selectedFeatureId}
                onChange={(e) => setSelectedFeatureId(e.target.value)}
                className="rounded-xl border border-gray-200 bg-transparent px-3.5 py-2 text-sm font-medium text-gray-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:border-zinc-700 dark:text-zinc-300 dark:focus:border-blue-500 dark:focus:ring-blue-900/30"
              >
                {features.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {featuresLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-blue-500" />
              <p className="text-sm text-gray-400 dark:text-zinc-500">Loading features…</p>
            </div>
          </div>
        ) : features.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 dark:bg-indigo-900/20">
              <svg className="h-6 w-6 text-indigo-400 dark:text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-500 dark:text-zinc-400">No active features</p>
            <p className="mt-1 text-xs text-gray-400 dark:text-zinc-500">Create and map features to see usage trends</p>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-blue-500" />
              <p className="text-sm text-gray-400 dark:text-zinc-500">Loading usage trends…</p>
            </div>
          </div>
        ) : error ? (
          <div className="px-6 py-8">
            <div className="flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 dark:bg-red-950/30">
              <svg className="h-4 w-4 shrink-0 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          </div>
        ) : data ? (
          <>
            <div className="grid grid-cols-3 gap-0 divide-x divide-gray-100 border-b border-gray-100 dark:divide-zinc-800 dark:border-zinc-800">
              <div className="px-6 py-4">
                <p className="text-xs font-medium text-gray-400 dark:text-zinc-500">Feature</p>
                <p className="mt-1 text-lg font-bold text-gray-900 dark:text-zinc-50">{data.featureName}</p>
              </div>
              <div className="px-6 py-4">
                <p className="text-xs font-medium text-gray-400 dark:text-zinc-500">Total events</p>
                <p className="mt-1 text-lg font-bold tabular-nums text-indigo-600 dark:text-indigo-400">{data.total.toLocaleString()}</p>
              </div>
              <div className="px-6 py-4">
                <p className="text-xs font-medium text-gray-400 dark:text-zinc-500">Period</p>
                <p className="mt-1 text-sm font-semibold text-gray-600 dark:text-zinc-300">{formatDateRange(data.startDate, data.endDate)}</p>
              </div>
            </div>

            {data.total === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <p className="text-sm text-gray-400 dark:text-zinc-500">No events recorded in this period</p>
              </div>
            ) : (() => {
              const chartH = 140;
              const gridLines = 4;
              const dateLabels: { idx: number; label: string }[] = [];
              if (data.daily.length > 0) {
                const step = Math.max(1, Math.floor(data.daily.length / 5));
                for (let i = 0; i < data.daily.length; i += step) {
                  const dt = new Date(data.daily[i].date);
                  dateLabels.push({ idx: i, label: `${dt.getMonth() + 1}/${dt.getDate()}` });
                }
                const lastIdx = data.daily.length - 1;
                if (!dateLabels.find((l) => l.idx === lastIdx)) {
                  const dt = new Date(data.daily[lastIdx].date);
                  dateLabels.push({ idx: lastIdx, label: `${dt.getMonth() + 1}/${dt.getDate()}` });
                }
              }
              return (
                <div className="px-6 py-5">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-xs font-semibold text-gray-500 dark:text-zinc-400">Daily breakdown</p>
                    <p className="text-xs text-gray-400 dark:text-zinc-500">{data.daily.length} days</p>
                  </div>
                  <div className="relative" style={{ height: chartH }}>
                    {Array.from({ length: gridLines }).map((_, i) => (
                      <div
                        key={i}
                        className="absolute left-0 right-0 border-t border-dashed border-gray-100 dark:border-zinc-800/60"
                        style={{ top: `${(i / gridLines) * 100}%` }}
                      />
                    ))}
                    <div className="absolute bottom-0 left-0 right-0 border-t border-gray-200/60 dark:border-zinc-700/60" />

                    <div className="relative flex h-full items-end gap-[3px] px-[1px]">
                      {data.daily.map((d) => {
                        const pct = maxCount > 0 ? (d.count / maxCount) * 100 : 0;
                        return (
                          <div key={d.date} className="group relative flex h-full flex-1 flex-col items-center justify-end">
                            <div
                              className="w-full transition-all duration-200 group-hover:brightness-110"
                              style={{
                                height: `${Math.max(pct, d.count > 0 ? 2 : 0)}%`,
                                minHeight: d.count > 0 ? '2px' : '0',
                                background: 'linear-gradient(to top, #6366F1, #6366F1dd)',
                                borderRadius: '4px 4px 1px 1px',
                                opacity: 0.8,
                              }}
                            />
                            <div className="pointer-events-none absolute -top-12 left-1/2 z-10 hidden -translate-x-1/2 rounded-lg border border-gray-800 bg-gray-900 px-3 py-2 text-xs font-medium text-white shadow-xl group-hover:block dark:border-zinc-200 dark:bg-zinc-100 dark:text-zinc-900">
                              <div className="mb-0.5 text-[10px] opacity-60">{new Date(d.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</div>
                              <div className="text-sm font-bold">{d.count.toLocaleString()}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {dateLabels.length > 0 && (
                    <div className="relative mt-2.5 flex justify-between px-[1px]">
                      {dateLabels.map(({ idx, label: lbl }) => (
                        <span key={idx} className="text-[10px] font-medium text-gray-400 dark:text-zinc-500">
                          {lbl}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
          </>
        ) : null}
      </div>
    </div>
  );
}

type FeatureUsageComparisonData = {
  features: Array<{
    featureId: string;
    featureName: string;
    totalEvents: number;
  }>;
  startDate: string;
  endDate: string;
  metric: string;
};

export function FeatureUsageComparisonSection({
  orgId,
  projectId,
  startDate,
  endDate,
}: {
  orgId: string;
  projectId: string;
  startDate: string;
  endDate: string;
}) {
  const [data, setData] = useState<FeatureUsageComparisonData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showMetric, setShowMetric] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(
          `${API_URL}/organizations/${orgId}/projects/${projectId}/analytics/feature-usage-comparison?startDate=${startDate}&endDate=${endDate}`,
          { credentials: 'include' },
        );
        if (cancelled) return;
        if (res.ok) {
          setData(await res.json());
        } else {
          setError('Failed to load feature usage comparison.');
        }
      } catch {
        if (!cancelled) setError('Network error loading feature usage comparison.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [orgId, projectId, startDate, endDate]);

  const maxEvents = data ? Math.max(...data.features.map((f) => f.totalEvents), 1) : 1;

  const barColors = [
    'from-orange-400 to-amber-400 dark:from-orange-500 dark:to-amber-500',
    'from-blue-400 to-indigo-400 dark:from-blue-500 dark:to-indigo-500',
    'from-emerald-400 to-teal-400 dark:from-emerald-500 dark:to-teal-500',
    'from-purple-400 to-violet-400 dark:from-purple-500 dark:to-violet-500',
    'from-pink-400 to-rose-400 dark:from-pink-500 dark:to-rose-500',
    'from-cyan-400 to-sky-400 dark:from-cyan-500 dark:to-sky-500',
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl border border-gray-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="border-b border-gray-100 px-6 py-4 dark:border-zinc-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-gray-900 dark:text-zinc-50">Feature usage comparison</h2>
              {data && (
                <button
                  onClick={() => setShowMetric(!showMetric)}
                  className="flex h-5 w-5 items-center justify-center rounded-full border border-gray-200 text-xs text-gray-400 transition-colors hover:border-gray-300 hover:bg-gray-50 hover:text-gray-600 dark:border-zinc-700 dark:text-zinc-500 dark:hover:border-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
                  aria-label="Show metric definition"
                >
                  ?
                </button>
              )}
            </div>
            {!loading && !error && data && data.features.length > 0 && (
              <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-500 dark:bg-zinc-800 dark:text-zinc-400">
                {data.features.length} feature{data.features.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>

        {showMetric && data?.metric && (
          <div className="border-b border-gray-100 bg-blue-50/50 px-6 py-3 dark:border-zinc-800 dark:bg-blue-950/20">
            <p className="text-xs text-gray-500 dark:text-zinc-400">{data.metric}</p>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-blue-500" />
              <p className="text-sm text-gray-400 dark:text-zinc-500">Loading comparison…</p>
            </div>
          </div>
        ) : error ? (
          <div className="px-6 py-8">
            <div className="flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 dark:bg-red-950/30">
              <svg className="h-4 w-4 shrink-0 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          </div>
        ) : data && data.features.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 dark:bg-orange-900/20">
              <svg className="h-6 w-6 text-orange-400 dark:text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-500 dark:text-zinc-400">No features to compare</p>
            <p className="mt-1 text-xs text-gray-400 dark:text-zinc-500">Create and map features to compare usage</p>
          </div>
        ) : data ? (
          <>
            <div className="border-b border-gray-100 px-6 py-3 dark:border-zinc-800">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-gray-400 dark:text-zinc-500">Period</span>
                  <span className="text-xs font-semibold text-gray-600 dark:text-zinc-300">{formatDateRange(data.startDate, data.endDate)}</span>
                </div>
                <div className="h-3 w-px bg-gray-200 dark:bg-zinc-700" />
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-gray-400 dark:text-zinc-500">Ranked by</span>
                  <span className="text-xs font-semibold text-gray-600 dark:text-zinc-300">total events</span>
                </div>
              </div>
            </div>

            <div className="divide-y divide-gray-100 dark:divide-zinc-800">
              {data.features.map((f, i) => (
                <div key={f.featureId} className="flex items-center gap-4 px-6 py-4 transition-colors hover:bg-gray-50/50 dark:hover:bg-zinc-800/30">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-xs font-bold text-gray-500 dark:bg-zinc-800 dark:text-zinc-400">
                    {i + 1}
                  </span>
                  <div className="flex flex-1 flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-gray-900 dark:text-zinc-50">{f.featureName}</span>
                      <span className="text-sm font-bold tabular-nums text-gray-900 dark:text-zinc-50">
                        {f.totalEvents.toLocaleString()}
                        <span className="ml-1 text-xs font-normal text-gray-400 dark:text-zinc-500">events</span>
                      </span>
                    </div>
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-zinc-800">
                      {f.totalEvents > 0 && (
                        <div
                          className={`h-full rounded-full bg-gradient-to-r ${barColors[i % barColors.length]} transition-all`}
                          style={{
                            width: `${(f.totalEvents / maxEvents) * 100}%`,
                            minWidth: '4px',
                          }}
                        />
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return 'just now';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;

  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

type EventStatus = {
  totalEvents: number;
  latestEventAt: string | null;
  earliestEventAt: string | null;
};

export function EventCollectionStatus({ orgId, projectId }: { orgId: string; projectId: string }) {
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading');
  const [data, setData] = useState<EventStatus | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(
          `${API_URL}/organizations/${orgId}/projects/${projectId}/event-status`,
          { credentials: 'include' },
        );
        if (cancelled) return;
        if (res.ok) {
          setData(await res.json());
          setStatus('ready');
        } else {
          setStatus('error');
        }
      } catch {
        if (!cancelled) setStatus('error');
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [orgId, projectId]);

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-medium text-black dark:text-zinc-50">Event collection</h2>

      {status === 'loading' && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading event status…</p>
      )}

      {status === 'error' && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Could not load event status.</p>
      )}

      {status === 'ready' && data && data.totalEvents === 0 && (
        <div className="rounded-lg border border-black/[.08] bg-zinc-50 px-4 py-3 dark:border-white/[.08] dark:bg-zinc-900">
          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            No events received yet
          </p>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Generate a tracking credential above and integrate the Userpulse SDK to start sending
            events.
          </p>
        </div>
      )}

      {status === 'ready' && data && data.totalEvents > 0 && (
        <div className="rounded-lg border border-black/[.08] px-4 py-3 dark:border-white/[.08]">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
            <span className="text-sm font-medium text-green-700 dark:text-green-400">
              Receiving events
            </span>
          </div>
          <div className="mt-2 flex flex-col gap-1">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Total events received: {data.totalEvents.toLocaleString()}
            </p>
            {data.latestEventAt && (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Latest event: {formatRelativeTime(data.latestEventAt)}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export type FeatureInfo = {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  status: string;
  createdAt: string;
  mappingCount: number;
};

type MappingInfo = {
  id: string;
  featureId: string;
  projectId: string;
  eventName: string;
  createdAt: string;
};

function EditFeatureForm({
  feature: feat,
  orgId,
  projectId,
  onUpdated,
  onCancel,
}: {
  feature: FeatureInfo;
  orgId: string;
  projectId: string;
  onUpdated: (f: FeatureInfo) => void;
  onCancel: () => void;
}) {
  const [editName, setEditName] = useState(feat.name);
  const [editDesc, setEditDesc] = useState(feat.description ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [editError, setEditError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setEditError('');
    setSubmitting(true);

    try {
      const res = await fetch(
        `${API_URL}/organizations/${orgId}/projects/${projectId}/features/${feat.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            name: editName,
            description: editDesc || null,
          }),
        },
      );

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setEditError(body.message ?? 'Failed to update feature.');
        return;
      }

      const updated = (await res.json()) as FeatureInfo;
      onUpdated(updated);
    } catch {
      setEditError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 bg-blue-50/50 px-6 py-4 dark:bg-blue-950/10">
      <div className="flex gap-3">
        <input
          type="text"
          required
          placeholder="Feature name"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          disabled={submitting}
          className="flex-1 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:placeholder:text-zinc-500 dark:focus:border-blue-600 dark:focus:ring-blue-500/20"
        />
        <input
          type="text"
          placeholder="Description (optional)"
          value={editDesc}
          onChange={(e) => setEditDesc(e.target.value)}
          disabled={submitting}
          className="flex-1 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:placeholder:text-zinc-500 dark:focus:border-blue-600 dark:focus:ring-blue-500/20"
        />
      </div>
      {editError && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 dark:bg-red-950/30">
          <svg className="h-3.5 w-3.5 shrink-0 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
          <p className="text-xs text-red-600 dark:text-red-400">{editError}</p>
        </div>
      )}
      <div className="flex gap-2 self-end">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="rounded-lg border border-gray-200 px-3.5 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-blue-600 px-3.5 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </form>
  );
}

function EventMappings({
  orgId,
  projectId,
  featureId,
  onMappingChange,
}: {
  orgId: string;
  projectId: string;
  featureId: string;
  onMappingChange: () => void;
}) {
  const [mappings, setMappings] = useState<MappingInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newEventName, setNewEventName] = useState('');
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(
          `${API_URL}/organizations/${orgId}/projects/${projectId}/features/${featureId}/mappings`,
          { credentials: 'include' },
        );
        if (cancelled) return;
        if (res.ok) {
          setMappings(await res.json());
        }
      } catch {
        if (!cancelled) setError('Failed to load mappings.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [orgId, projectId, featureId]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newEventName.trim()) return;
    setError('');
    setAdding(true);

    const currentNames = mappings.map((m) => m.eventName);
    const updatedNames = [...currentNames, newEventName.trim()];

    try {
      const res = await fetch(
        `${API_URL}/organizations/${orgId}/projects/${projectId}/features/${featureId}/mappings`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ eventNames: updatedNames }),
        },
      );

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.message ?? 'Failed to add mapping.');
        return;
      }

      const updated = (await res.json()) as MappingInfo[];
      setMappings(updated);
      setNewEventName('');
      onMappingChange();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(mappingId: string) {
    setRemovingId(mappingId);
    setError('');
    try {
      const res = await fetch(
        `${API_URL}/organizations/${orgId}/projects/${projectId}/features/${featureId}/mappings/${mappingId}`,
        { method: 'DELETE', credentials: 'include' },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.message ?? 'Failed to remove mapping.');
        return;
      }
      setMappings((prev) => prev.filter((m) => m.id !== mappingId));
      onMappingChange();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setRemovingId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 border-t border-gray-100 px-6 py-3 dark:border-zinc-800">
        <div className="h-3 w-3 animate-spin rounded-full border-2 border-gray-300 border-t-cyan-500" />
        <p className="text-xs text-gray-400 dark:text-zinc-500">Loading mappings…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 border-t border-gray-100 bg-gray-50/50 px-6 py-4 dark:border-zinc-800 dark:bg-zinc-800/30">
      <div className="flex items-center gap-2">
        <svg className="h-3.5 w-3.5 text-gray-400 dark:text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-6.818l4.5 4.5a4.5 4.5 0 010 6.364l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757" />
        </svg>
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-zinc-500">Event mappings</span>
      </div>

      {mappings.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {mappings.map((m) => (
            <span
              key={m.id}
              className="group inline-flex items-center gap-1.5 rounded-lg border border-cyan-200 bg-cyan-50 px-2.5 py-1.5 text-xs font-medium text-cyan-700 dark:border-cyan-800 dark:bg-cyan-950/30 dark:text-cyan-400"
            >
              <code className="font-mono text-[11px]">{m.eventName}</code>
              <button
                onClick={() => handleRemove(m.id)}
                disabled={removingId === m.id}
                className="flex h-4 w-4 items-center justify-center rounded-full text-cyan-400 transition-colors hover:bg-red-100 hover:text-red-500 disabled:opacity-50 dark:text-cyan-500 dark:hover:bg-red-900/30 dark:hover:text-red-400"
                aria-label={`Remove ${m.eventName}`}
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </span>
          ))}
        </div>
      )}

      {mappings.length === 0 && (
        <p className="text-xs text-gray-400 dark:text-zinc-500">No events mapped yet. Add an event name below.</p>
      )}

      <form onSubmit={handleAdd} className="flex gap-2">
        <input
          type="text"
          placeholder="Event name (e.g. button_click)"
          value={newEventName}
          onChange={(e) => setNewEventName(e.target.value)}
          disabled={adding}
          className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 font-mono text-xs text-gray-900 placeholder:text-gray-400 focus:border-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:placeholder:text-zinc-500 dark:focus:border-cyan-600 dark:focus:ring-cyan-500/20"
        />
        <button
          type="submit"
          disabled={adding || !newEventName.trim()}
          className="shrink-0 rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-cyan-700 disabled:opacity-50"
        >
          {adding ? 'Adding…' : '+ Add'}
        </button>
      </form>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 dark:bg-red-950/30">
          <svg className="h-3.5 w-3.5 shrink-0 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
          <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}
    </div>
  );
}

type UnmappedEvent = {
  eventName: string;
  eventCount: number;
  lastSeenAt: string;
};

export function UnmappedEventsSection({
  orgId,
  projectId,
  features,
  onMapped,
}: {
  orgId: string;
  projectId: string;
  features: FeatureInfo[];
  onMapped: () => void;
}) {
  const [events, setEvents] = useState<UnmappedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mappingEvent, setMappingEvent] = useState<string | null>(null);
  const [selectedFeature, setSelectedFeature] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(
          `${API_URL}/organizations/${orgId}/projects/${projectId}/unmapped-events`,
          { credentials: 'include' },
        );
        if (cancelled) return;
        if (res.ok) {
          setEvents(await res.json());
        }
      } catch {
        if (!cancelled) setError('Failed to load unmapped events.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [orgId, projectId]);

  async function handleMap(eventName: string, featureId: string) {
    setSubmitting(true);
    setError('');

    try {
      const mappingsRes = await fetch(
        `${API_URL}/organizations/${orgId}/projects/${projectId}/features/${featureId}/mappings`,
        { credentials: 'include' },
      );
      if (!mappingsRes.ok) {
        setError('Failed to load feature mappings.');
        return;
      }
      const currentMappings = (await mappingsRes.json()) as MappingInfo[];
      const currentNames = currentMappings.map((m) => m.eventName);

      const res = await fetch(
        `${API_URL}/organizations/${orgId}/projects/${projectId}/features/${featureId}/mappings`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ eventNames: [...currentNames, eventName] }),
        },
      );

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.message ?? 'Failed to map event.');
        return;
      }

      setEvents((prev) => prev.filter((e) => e.eventName !== eventName));
      setMappingEvent(null);
      setSelectedFeature('');
      onMapped();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const activeFeatures = features.filter((f) => f.status === 'ACTIVE');

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <div className="flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 dark:bg-red-950/30">
          <svg className="h-4 w-4 shrink-0 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      <div className="rounded-2xl border border-gray-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="border-b border-gray-100 px-6 py-4 dark:border-zinc-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <h2 className="text-base font-semibold text-gray-900 dark:text-zinc-50">Collected events</h2>
              {!loading && events.length > 0 && (
                <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs font-semibold text-violet-600 dark:bg-violet-900/30 dark:text-violet-400">
                  {events.length} unmapped
                </span>
              )}
            </div>
            {!loading && events.length > 0 && (
              <p className="text-xs text-gray-400 dark:text-zinc-500">
                Assign events to features to track usage
              </p>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-violet-500" />
              <p className="text-sm text-gray-400 dark:text-zinc-500">Loading events…</p>
            </div>
          </div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-50 dark:bg-violet-900/20">
              <svg className="h-6 w-6 text-violet-400 dark:text-violet-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-500 dark:text-zinc-400">All events are mapped</p>
            <p className="mt-1 max-w-sm text-center text-xs text-gray-400 dark:text-zinc-500">
              All collected events are mapped to features, or no events have been collected yet.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-zinc-800">
            {events.map((evt) => (
              <div key={evt.eventName} className="flex flex-col">
                <div className="flex items-center gap-4 px-6 py-4 transition-colors hover:bg-gray-50/50 dark:hover:bg-zinc-800/30">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-950/40 dark:to-purple-950/40">
                    <svg className="h-4 w-4 text-violet-500 dark:text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.25 9.75L16.5 12l-2.25 2.25m-4.5 0L7.5 12l2.25-2.25M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z" />
                    </svg>
                  </div>
                  <div className="flex flex-1 flex-col gap-0.5">
                    <code className="text-sm font-semibold font-mono text-gray-900 dark:text-zinc-50">
                      {evt.eventName}
                    </code>
                    <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-zinc-500">
                      <span className="inline-flex items-center gap-1">
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75z" /></svg>
                        {evt.eventCount.toLocaleString()} event{evt.eventCount === 1 ? '' : 's'}
                      </span>
                      <span>&middot;</span>
                      <span>Last seen {formatRelativeTime(evt.lastSeenAt)}</span>
                    </div>
                  </div>
                  <div>
                    {mappingEvent === evt.eventName ? (
                      activeFeatures.length === 0 ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400 dark:text-zinc-500">
                          No features yet
                        </span>
                        <button
                          onClick={() => setMappingEvent(null)}
                          className="shrink-0 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
                        >
                          Cancel
                        </button>
                      </div>
                      ) : (
                      <div className="flex items-center gap-2">
                        <select
                          value={selectedFeature}
                          onChange={(e) => setSelectedFeature(e.target.value)}
                          disabled={submitting}
                          className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-900 focus:border-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-500/20 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:focus:border-violet-600 dark:focus:ring-violet-500/20"
                        >
                          <option value="">Select feature…</option>
                          {activeFeatures.map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.name}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => {
                            if (selectedFeature) {
                              void handleMap(evt.eventName, selectedFeature);
                            }
                          }}
                          disabled={!selectedFeature || submitting}
                          className="shrink-0 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-violet-700 disabled:opacity-50"
                        >
                          {submitting ? 'Mapping…' : 'Map'}
                        </button>
                        <button
                          onClick={() => {
                            setMappingEvent(null);
                            setSelectedFeature('');
                          }}
                          disabled={submitting}
                          className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-zinc-800"
                        >
                          Cancel
                        </button>
                      </div>
                      )
                    ) : (
                      <button
                        onClick={() => setMappingEvent(evt.eventName)}
                        className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-600 transition-colors hover:bg-violet-100 dark:border-violet-800 dark:bg-violet-900/20 dark:text-violet-400 dark:hover:bg-violet-900/40"
                      >
                        Map to feature
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function FeaturesSection({
  orgId,
  projectId,
  onFeaturesLoaded,
}: {
  orgId: string;
  projectId: string;
  onFeaturesLoaded?: (features: FeatureInfo[]) => void;
}) {
  const [features, setFeatures] = useState<FeatureInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(
          `${API_URL}/organizations/${orgId}/projects/${projectId}/features`,
          { credentials: 'include' },
        );
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          setFeatures(data);
          onFeaturesLoaded?.(data);
        }
      } catch {
        if (!cancelled) setError('Failed to load features.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [orgId, projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setCreating(true);

    try {
      const res = await fetch(`${API_URL}/organizations/${orgId}/projects/${projectId}/features`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name,
          ...(description ? { description } : {}),
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.message ?? 'Failed to create feature.');
        return;
      }

      const created = (await res.json()) as FeatureInfo;
      setFeatures((prev) => [created, ...prev]);
      setName('');
      setDescription('');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setCreating(false);
    }
  }

  async function handleArchiveToggle(feat: FeatureInfo) {
    const isArchiving = feat.status === 'ACTIVE';

    if (
      isArchiving &&
      !confirm(
        'Are you sure you want to archive this feature? It will be clearly marked as archived.',
      )
    ) {
      return;
    }

    setArchivingId(feat.id);
    setError('');
    try {
      const res = await fetch(
        `${API_URL}/organizations/${orgId}/projects/${projectId}/features/${feat.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ status: isArchiving ? 'ARCHIVED' : 'ACTIVE' }),
        },
      );

      if (res.ok) {
        const updated = (await res.json()) as FeatureInfo;
        setFeatures((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setArchivingId(null);
    }
  }

  const activeCount = features.filter(f => f.status === 'ACTIVE').length;
  const archivedCount = features.filter(f => f.status === 'ARCHIVED').length;

  return (
    <div className="flex flex-col gap-6">
      {/* Create feature card */}
      <div className="rounded-2xl border border-gray-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="border-b border-gray-100 px-6 py-4 dark:border-zinc-800">
          <h2 className="text-base font-semibold text-gray-900 dark:text-zinc-50">New feature</h2>
        </div>
        <form onSubmit={handleCreate} className="px-6 py-5">
          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-3">
              <input
                type="text"
                required
                placeholder="Feature name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={creating}
                className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:placeholder:text-zinc-500 dark:focus:border-blue-600 dark:focus:ring-blue-500/20"
              />
              <input
                type="text"
                placeholder="Description (optional)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={creating}
                className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:placeholder:text-zinc-500 dark:focus:border-blue-600 dark:focus:ring-blue-500/20"
              />
            </div>
            <button
              type="submit"
              disabled={creating}
              className="mt-0 h-fit shrink-0 self-end rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              {creating ? 'Creating…' : 'Create feature'}
            </button>
          </div>
        </form>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 dark:bg-red-950/30">
          <svg className="h-4 w-4 shrink-0 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Features list card */}
      <div className="rounded-2xl border border-gray-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="border-b border-gray-100 px-6 py-4 dark:border-zinc-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <h2 className="text-base font-semibold text-gray-900 dark:text-zinc-50">Your features</h2>
              {!loading && features.length > 0 && (
                <span className="rounded-full bg-cyan-50 px-2 py-0.5 text-xs font-semibold text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-400">
                  {features.length}
                </span>
              )}
            </div>
            {!loading && features.length > 0 && (
              <div className="flex items-center gap-3 text-xs text-gray-400 dark:text-zinc-500">
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" /> {activeCount} active
                </span>
                {archivedCount > 0 && (
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-gray-300 dark:bg-zinc-600" /> {archivedCount} archived
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-cyan-500" />
              <p className="text-sm text-gray-400 dark:text-zinc-500">Loading features…</p>
            </div>
          </div>
        ) : features.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-50 dark:bg-cyan-900/20">
              <svg className="h-6 w-6 text-cyan-400 dark:text-cyan-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-500 dark:text-zinc-400">No features yet</p>
            <p className="mt-1 text-xs text-gray-400 dark:text-zinc-500">Create one above to start organizing your product analytics.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-zinc-800">
            {features.map((feat) =>
              editingId === feat.id ? (
                <EditFeatureForm
                  key={feat.id}
                  feature={feat}
                  orgId={orgId}
                  projectId={projectId}
                  onUpdated={(updated) => {
                    setFeatures((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
                    setEditingId(null);
                  }}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <div key={feat.id} className="flex flex-col">
                  <div className="flex items-center gap-4 px-6 py-4 transition-colors hover:bg-gray-50/50 dark:hover:bg-zinc-800/30">
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                      feat.status === 'ARCHIVED'
                        ? 'bg-gray-100 dark:bg-zinc-800'
                        : 'bg-gradient-to-br from-cyan-50 to-teal-50 dark:from-cyan-950/40 dark:to-teal-950/40'
                    }`}>
                      <svg className={`h-4 w-4 ${
                        feat.status === 'ARCHIVED'
                          ? 'text-gray-400 dark:text-zinc-500'
                          : 'text-cyan-500 dark:text-cyan-400'
                      }`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                      </svg>
                    </div>
                    <div className="flex flex-1 flex-col gap-0.5">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-semibold ${feat.status === 'ARCHIVED' ? 'text-gray-400 dark:text-zinc-500' : 'text-gray-900 dark:text-zinc-50'}`}>
                          {feat.name}
                        </span>
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                            feat.status === 'ARCHIVED'
                              ? 'bg-gray-100 text-gray-500 dark:bg-zinc-800 dark:text-zinc-500'
                              : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
                          }`}
                        >
                          {feat.status}
                        </span>
                        {feat.mappingCount > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                            <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-6.818l4.5 4.5a4.5 4.5 0 010 6.364l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757" /></svg>
                            {feat.mappingCount} event{feat.mappingCount === 1 ? '' : 's'}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {feat.description && (
                          <span className="text-xs text-gray-500 dark:text-zinc-400">{feat.description}</span>
                        )}
                        {feat.description && <span className="text-gray-200 dark:text-zinc-700">&middot;</span>}
                        <span className="text-xs text-gray-400 dark:text-zinc-500">
                          Created {new Date(feat.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setExpandedId(expandedId === feat.id ? null : feat.id)}
                        className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                          expandedId === feat.id
                            ? 'bg-cyan-50 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-400'
                            : 'text-gray-500 hover:bg-gray-100 dark:text-zinc-400 dark:hover:bg-zinc-800'
                        }`}
                      >
                        {expandedId === feat.id ? 'Hide' : 'Events'}
                      </button>
                      <button
                        onClick={() => setEditingId(feat.id)}
                        className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleArchiveToggle(feat)}
                        disabled={archivingId === feat.id}
                        className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                          feat.status === 'ARCHIVED'
                            ? 'text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-900/20'
                            : 'text-red-500 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30'
                        }`}
                      >
                        {archivingId === feat.id
                          ? feat.status === 'ARCHIVED'
                            ? 'Restoring…'
                            : 'Archiving…'
                          : feat.status === 'ARCHIVED'
                            ? 'Restore'
                            : 'Archive'}
                      </button>
                    </div>
                  </div>
                  {expandedId === feat.id && (
                    <EventMappings
                      orgId={orgId}
                      projectId={projectId}
                      featureId={feat.id}
                      onMappingChange={() => {
                        setFeatures((prev) =>
                          prev.map((f) =>
                            f.id === feat.id ? { ...f, mappingCount: f.mappingCount + 0 } : f,
                          ),
                        );
                        fetch(`${API_URL}/organizations/${orgId}/projects/${projectId}/features`, {
                          credentials: 'include',
                        })
                          .then((res) => (res.ok ? res.json() : null))
                          .then((data) => {
                            if (data) setFeatures(data);
                          })
                          .catch(() => {});
                      }}
                    />
                  )}
                </div>
              ),
            )}
          </div>
        )}
      </div>
    </div>
  );
}

type FunnelInfo = {
  id: string;
  name: string;
  stepCount: number;
  createdAt: string;
};

type FunnelStepInfo = {
  id: string;
  stepOrder: number;
  eventName: string;
};

type FunnelDetailInfo = {
  id: string;
  name: string;
  steps: FunnelStepInfo[];
  createdAt: string;
};

type FunnelStepAnalytics = {
  stepOrder: number;
  eventName: string;
  users: number;
  conversionRate: number;
  dropOff: number;
  dropOffRate: number;
};

type FunnelAnalyticsResult = {
  funnelId: string;
  funnelName: string;
  steps: FunnelStepAnalytics[];
  totalEnteredUsers: number;
  totalConvertedUsers: number;
  overallConversionRate: number;
  startDate: string;
  endDate: string;
  identityRule: string;
  orderingRule: string;
  conversionWindow: string;
  disclaimer: string;
};

export function FunnelsSection({
  orgId,
  projectId,
  startDate,
  endDate,
}: {
  orgId: string;
  projectId: string;
  startDate: string;
  endDate: string;
}) {
  const [funnels, setFunnels] = useState<FunnelInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedFunnel, setExpandedFunnel] = useState<FunnelDetailInfo | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [eventNames, setEventNames] = useState<string[]>([]);
  const [analyticsId, setAnalyticsId] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<FunnelAnalyticsResult | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  const baseUrl = `${API_URL}/organizations/${orgId}/projects/${projectId}/funnels`;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [funnelsRes, eventsRes] = await Promise.all([
          fetch(baseUrl, { credentials: 'include' }),
          fetch(`${baseUrl}/event-names`, { credentials: 'include' }),
        ]);
        if (cancelled) return;
        if (funnelsRes.ok) setFunnels(await funnelsRes.json());
        if (eventsRes.ok) setEventNames(await eventsRes.json());
      } catch {
        if (!cancelled) setError('Failed to load funnels.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [orgId, projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleCreate(name: string, steps: { eventName: string }[]) {
    setError('');
    try {
      const res = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name, steps }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.message ?? 'Failed to create funnel.');
        return;
      }
      const created = await res.json();
      setFunnels((prev) => [
        {
          id: created.id,
          name: created.name,
          stepCount: created.steps.length,
          createdAt: created.createdAt,
        },
        ...prev,
      ]);
      setShowCreate(false);
    } catch {
      setError('Network error. Please try again.');
    }
  }

  async function handleUpdate(funnelId: string, name: string, steps: { eventName: string }[]) {
    setError('');
    try {
      const res = await fetch(`${baseUrl}/${funnelId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name, steps }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.message ?? 'Failed to update funnel.');
        return;
      }
      const updated = await res.json();
      setFunnels((prev) =>
        prev.map((f) =>
          f.id === updated.id
            ? {
                id: updated.id,
                name: updated.name,
                stepCount: updated.steps.length,
                createdAt: updated.createdAt,
              }
            : f,
        ),
      );
      setEditingId(null);
      if (expandedId === funnelId) {
        setExpandedFunnel(updated);
      }
    } catch {
      setError('Network error. Please try again.');
    }
  }

  async function handleDelete(funnelId: string) {
    if (!confirm('Are you sure you want to delete this funnel?')) return;
    setDeletingId(funnelId);
    setError('');
    try {
      const res = await fetch(`${baseUrl}/${funnelId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.ok || res.status === 204) {
        setFunnels((prev) => prev.filter((f) => f.id !== funnelId));
        if (expandedId === funnelId) {
          setExpandedId(null);
          setExpandedFunnel(null);
        }
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setDeletingId(null);
    }
  }

  async function handleExpand(funnelId: string) {
    if (expandedId === funnelId) {
      setExpandedId(null);
      setExpandedFunnel(null);
      return;
    }
    setExpandedId(funnelId);
    try {
      const res = await fetch(`${baseUrl}/${funnelId}`, { credentials: 'include' });
      if (res.ok) setExpandedFunnel(await res.json());
    } catch {
      /* ignore */
    }
  }

  async function handleViewAnalytics(funnelId: string) {
    if (analyticsId === funnelId) {
      setAnalyticsId(null);
      setAnalytics(null);
      return;
    }
    setAnalyticsId(funnelId);
    setAnalytics(null);
    setAnalyticsLoading(true);
    try {
      const res = await fetch(
        `${baseUrl}/${funnelId}/analytics?startDate=${startDate}&endDate=${endDate}`,
        { credentials: 'include' },
      );
      if (res.ok) {
        setAnalytics(await res.json());
      } else {
        setError('Failed to load funnel analytics.');
      }
    } catch {
      setError('Network error loading analytics.');
    } finally {
      setAnalyticsLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {showCreate && (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900 dark:text-zinc-50">Create new funnel</h2>
            <button
              onClick={() => setShowCreate(false)}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <FunnelForm eventNames={eventNames} onSubmit={handleCreate} submitLabel="Create" />
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 dark:bg-red-950/30">
          <svg className="h-4 w-4 shrink-0 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      <div className="rounded-2xl border border-gray-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="border-b border-gray-100 px-6 py-4 dark:border-zinc-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-gray-900 dark:text-zinc-50">Your funnels</h2>
              {!loading && (
                <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-500 dark:bg-zinc-800 dark:text-zinc-400">
                  {funnels.length}
                </span>
              )}
            </div>
            {!showCreate && (
              <button
                onClick={() => setShowCreate(true)}
                className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-700 hover:shadow dark:bg-blue-500 dark:hover:bg-blue-600"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                New funnel
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-blue-500" />
              <p className="text-sm text-gray-400 dark:text-zinc-500">Loading funnels…</p>
            </div>
          </div>
        ) : funnels.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-50 dark:bg-purple-900/20">
              <svg className="h-6 w-6 text-purple-400 dark:text-purple-500" viewBox="0 0 24 24" fill="none">
                <path d="M4 4h16l-5.5 7v5l-5 3V11L4 4z" fill="currentColor" opacity="0.3" />
                <path d="M4 4h16l-5.5 7v5l-5 3V11L4 4z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-500 dark:text-zinc-400">No funnels yet</p>
            <p className="mt-1 text-xs text-gray-400 dark:text-zinc-500">Create one to track conversion through a product flow</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-zinc-800">
            {funnels.map((funnel) => (
              <div key={funnel.id} className="flex flex-col">
                <div className="flex items-center justify-between px-6 py-4 transition-colors hover:bg-gray-50/50 dark:hover:bg-zinc-800/30">
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-purple-50 to-violet-50 dark:from-purple-950/40 dark:to-violet-950/40">
                      <svg className="h-5 w-5 text-purple-500 dark:text-purple-400" viewBox="0 0 24 24" fill="none">
                        <path d="M4 4h16l-5.5 7v5l-5 3V11L4 4z" fill="currentColor" opacity="0.3" />
                        <path d="M4 4h16l-5.5 7v5l-5 3V11L4 4z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                      </svg>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-semibold text-gray-900 dark:text-zinc-50">
                        {funnel.name}
                      </span>
                      <span className="text-xs text-gray-400 dark:text-zinc-500">
                        {funnel.stepCount} step{funnel.stepCount === 1 ? '' : 's'} · Created{' '}
                        {new Date(funnel.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleViewAnalytics(funnel.id)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                        analyticsId === funnel.id
                          ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                          : 'border border-gray-200 text-gray-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-blue-800 dark:hover:bg-blue-950 dark:hover:text-blue-400'
                      }`}
                    >
                      {analyticsId === funnel.id ? 'Hide Analytics' : 'Analytics'}
                    </button>
                    <button
                      onClick={() => handleExpand(funnel.id)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                        expandedId === funnel.id
                          ? 'bg-gray-100 text-gray-700 dark:bg-zinc-800 dark:text-zinc-300'
                          : 'border border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-600 dark:hover:bg-zinc-800'
                      }`}
                    >
                      {expandedId === funnel.id ? 'Hide' : 'Steps'}
                    </button>
                    <button
                      onClick={() => {
                        if (editingId !== funnel.id && expandedId !== funnel.id) handleExpand(funnel.id);
                        setEditingId(editingId === funnel.id ? null : funnel.id);
                      }}
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition-all hover:border-gray-300 hover:bg-gray-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-600 dark:hover:bg-zinc-800"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(funnel.id)}
                      disabled={deletingId === funnel.id}
                      className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition-all hover:border-red-300 hover:bg-red-50 disabled:opacity-50 dark:border-red-900/50 dark:text-red-400 dark:hover:border-red-800 dark:hover:bg-red-950/30"
                    >
                      {deletingId === funnel.id ? 'Deleting…' : 'Delete'}
                    </button>
                  </div>
                </div>

                {expandedId === funnel.id && expandedFunnel && !editingId && (
                  <div className="border-t border-gray-100 bg-gray-50/50 px-6 py-4 dark:border-zinc-800 dark:bg-zinc-800/20">
                    <ol className="flex flex-col gap-2">
                      {expandedFunnel.steps.map((step, i) => (
                        <li
                          key={step.id}
                          className="flex items-center gap-3 text-sm text-gray-700 dark:text-zinc-300"
                        >
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-purple-100 text-xs font-bold text-purple-600 dark:bg-purple-900/40 dark:text-purple-400">
                            {i + 1}
                          </span>
                          <span className="font-medium">{step.eventName}</span>
                          {i < expandedFunnel.steps.length - 1 && (
                            <svg className="ml-auto h-4 w-4 text-gray-300 dark:text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3" />
                            </svg>
                          )}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                {editingId === funnel.id && expandedFunnel && (
                  <div className="border-t border-gray-100 bg-gray-50/50 px-6 py-4 dark:border-zinc-800 dark:bg-zinc-800/20">
                    <FunnelForm
                      eventNames={eventNames}
                      initialName={expandedFunnel.name}
                      initialSteps={expandedFunnel.steps.map((s) => ({ eventName: s.eventName }))}
                      onSubmit={(name, steps) => handleUpdate(funnel.id, name, steps)}
                      onCancel={() => setEditingId(null)}
                      submitLabel="Save"
                    />
                  </div>
                )}

                {analyticsId === funnel.id && (
                  <div className="border-t border-gray-100 bg-gray-50/50 px-6 py-5 dark:border-zinc-800 dark:bg-zinc-800/20">
                    {analyticsLoading ? (
                      <div className="flex items-center justify-center py-6">
                        <div className="flex items-center gap-2">
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-blue-500" />
                          <p className="text-sm text-gray-400 dark:text-zinc-500">Loading analytics…</p>
                        </div>
                      </div>
                    ) : analytics ? (
                      <div className="flex flex-col gap-4">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-gray-900 dark:text-zinc-50">
                            {analytics.funnelName}
                          </span>
                          <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500 dark:bg-zinc-800 dark:text-zinc-400">
                            {analytics.startDate} → {analytics.endDate}
                          </span>
                        </div>

                        <div className="grid grid-cols-3 gap-3">
                          <div className="rounded-xl bg-white p-4 dark:bg-zinc-900">
                            <p className="text-xs font-medium text-gray-400 dark:text-zinc-500">Entered</p>
                            <p className="mt-1 text-xl font-bold tabular-nums text-gray-900 dark:text-zinc-50">
                              {analytics.totalEnteredUsers.toLocaleString()}
                            </p>
                          </div>
                          <div className="rounded-xl bg-white p-4 dark:bg-zinc-900">
                            <p className="text-xs font-medium text-gray-400 dark:text-zinc-500">Converted</p>
                            <p className="mt-1 text-xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                              {analytics.totalConvertedUsers.toLocaleString()}
                            </p>
                          </div>
                          <div className="rounded-xl bg-white p-4 dark:bg-zinc-900">
                            <p className="text-xs font-medium text-gray-400 dark:text-zinc-500">Conversion rate</p>
                            <p className="mt-1 text-xl font-bold tabular-nums text-blue-600 dark:text-blue-400">
                              {analytics.overallConversionRate}%
                            </p>
                          </div>
                        </div>

                        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-zinc-700">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
                                <th className="px-4 py-2.5 font-semibold">Step</th>
                                <th className="px-4 py-2.5 font-semibold">Event</th>
                                <th className="px-4 py-2.5 text-right font-semibold">Users</th>
                                <th className="px-4 py-2.5 text-right font-semibold">Conversion</th>
                                <th className="px-4 py-2.5 text-right font-semibold">Drop-off</th>
                                <th className="px-4 py-2.5 text-right font-semibold">Drop-off %</th>
                              </tr>
                            </thead>
                            <tbody>
                              {analytics.steps.map((step) => (
                                <tr
                                  key={step.stepOrder}
                                  className="border-b border-gray-100 last:border-b-0 dark:border-zinc-800"
                                >
                                  <td className="px-4 py-2.5">
                                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-purple-100 text-xs font-bold text-purple-600 dark:bg-purple-900/40 dark:text-purple-400">
                                      {step.stepOrder + 1}
                                    </span>
                                  </td>
                                  <td className="px-4 py-2.5 font-medium text-gray-900 dark:text-zinc-50">
                                    {step.eventName}
                                  </td>
                                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-gray-900 dark:text-zinc-50">
                                    {step.users.toLocaleString()}
                                  </td>
                                  <td className="px-4 py-2.5 text-right tabular-nums text-gray-600 dark:text-zinc-300">
                                    {step.conversionRate}%
                                  </td>
                                  <td className="px-4 py-2.5 text-right tabular-nums text-gray-600 dark:text-zinc-300">
                                    {step.stepOrder === 0 ? '—' : step.dropOff.toLocaleString()}
                                  </td>
                                  <td className="px-4 py-2.5 text-right tabular-nums">
                                    {step.stepOrder === 0 ? (
                                      <span className="text-gray-400 dark:text-zinc-500">—</span>
                                    ) : (
                                      <span className={step.dropOffRate > 50 ? 'font-medium text-red-500' : 'text-gray-600 dark:text-zinc-300'}>
                                        {step.dropOffRate}%
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        <details className="group">
                          <summary className="cursor-pointer text-xs font-medium text-gray-400 transition-colors hover:text-gray-600 dark:text-zinc-500 dark:hover:text-zinc-300">
                            Analysis details
                          </summary>
                          <div className="mt-2 flex flex-col gap-1 rounded-lg bg-white p-3 text-xs text-gray-400 dark:bg-zinc-900 dark:text-zinc-500">
                            <p><strong>Identity:</strong> {analytics.identityRule}</p>
                            <p><strong>Ordering:</strong> {analytics.orderingRule}</p>
                            <p><strong>Window:</strong> {analytics.conversionWindow}</p>
                            <p className="italic">{analytics.disclaimer}</p>
                          </div>
                        </details>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-6">
                        <p className="text-sm text-gray-400 dark:text-zinc-500">No analytics data available</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

type UserJourneySequence = {
  sequence: string[];
  userCount: number;
  lowVolume: boolean;
};

type UserJourneysData = {
  sequences: UserJourneySequence[];
  totalUsers: number;
  startDate: string;
  endDate: string;
  maxSteps: number;
  minUsers: number;
  identityRule: string;
  sessionRule: string;
};

export function UserJourneysSection({
  orgId,
  projectId,
  startDate,
  endDate,
}: {
  orgId: string;
  projectId: string;
  startDate: string;
  endDate: string;
}) {
  const [data, setData] = useState<UserJourneysData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [maxSteps, setMaxSteps] = useState(3);
  const [showRules, setShowRules] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(
          `${API_URL}/organizations/${orgId}/projects/${projectId}/analytics/user-journeys?startDate=${startDate}&endDate=${endDate}&maxSteps=${maxSteps}`,
          { credentials: 'include' },
        );
        if (cancelled) return;
        if (res.ok) {
          setData(await res.json());
        } else {
          setError('Failed to load user journeys.');
        }
      } catch {
        if (!cancelled) setError('Network error loading user journeys.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [orgId, projectId, startDate, endDate, maxSteps]);

  const maxUserCount = data?.sequences.length ? Math.max(...data.sequences.map(s => s.userCount)) : 1;

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl border border-gray-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="border-b border-gray-100 px-6 py-4 dark:border-zinc-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-base font-semibold text-gray-900 dark:text-zinc-50">Common journeys</h2>
              {data && (
                <button
                  onClick={() => setShowRules(!showRules)}
                  className="flex h-5 w-5 items-center justify-center rounded-full border border-gray-200 text-xs text-gray-400 transition-colors hover:border-gray-300 hover:bg-gray-50 hover:text-gray-600 dark:border-zinc-700 dark:text-zinc-500 dark:hover:border-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
                  aria-label="Show identity and session rules"
                >
                  ?
                </button>
              )}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium text-gray-400 dark:text-zinc-500">Sequence length</span>
              <select
                value={maxSteps}
                onChange={(e) => setMaxSteps(Number(e.target.value))}
                className="rounded-lg border border-gray-200 bg-transparent px-2.5 py-1.5 text-sm font-medium text-gray-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:border-zinc-700 dark:text-zinc-300 dark:focus:border-blue-500 dark:focus:ring-blue-900/30"
              >
                {[2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n} steps
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {showRules && data && (
          <div className="border-b border-gray-100 bg-blue-50/50 px-6 py-3 dark:border-zinc-800 dark:bg-blue-950/20">
            <div className="flex flex-wrap gap-4 text-xs">
              <span className="text-gray-500 dark:text-zinc-400"><strong className="text-gray-600 dark:text-zinc-300">Identity:</strong> {data.identityRule}</span>
              <span className="text-gray-500 dark:text-zinc-400"><strong className="text-gray-600 dark:text-zinc-300">Session:</strong> {data.sessionRule}</span>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-blue-500" />
              <p className="text-sm text-gray-400 dark:text-zinc-500">Loading user journeys…</p>
            </div>
          </div>
        ) : error ? (
          <div className="px-6 py-8">
            <div className="flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 dark:bg-red-950/30">
              <svg className="h-4 w-4 shrink-0 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          </div>
        ) : data && data.sequences.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-50 dark:bg-teal-900/20">
              <svg className="h-6 w-6 text-teal-400 dark:text-teal-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-500 dark:text-zinc-400">No journeys found</p>
            <p className="mt-1 text-xs text-gray-400 dark:text-zinc-500">
              No common event sequences for this period with {maxSteps}+ steps
            </p>
          </div>
        ) : data ? (
          <>
            <div className="border-b border-gray-100 px-6 py-3 dark:border-zinc-800">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-gray-400 dark:text-zinc-500">Period</span>
                  <span className="text-xs font-semibold text-gray-600 dark:text-zinc-300">{formatDateRange(data.startDate, data.endDate)}</span>
                </div>
                <div className="h-3 w-px bg-gray-200 dark:bg-zinc-700" />
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-gray-400 dark:text-zinc-500">Users</span>
                  <span className="text-xs font-semibold text-gray-600 dark:text-zinc-300">{data.totalUsers.toLocaleString()}</span>
                </div>
                <div className="h-3 w-px bg-gray-200 dark:bg-zinc-700" />
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-gray-400 dark:text-zinc-500">Sequences</span>
                  <span className="text-xs font-semibold text-gray-600 dark:text-zinc-300">{data.sequences.length}</span>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 dark:border-zinc-700 dark:bg-zinc-800">
                    <th className="w-12 px-4 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-zinc-400">#</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-zinc-400">Journey</th>
                    <th className="w-28 px-4 py-2.5 text-right text-xs font-semibold text-gray-500 dark:text-zinc-400">Users</th>
                  </tr>
                </thead>
                <tbody>
                  {data.sequences.map((seq, i) => (
                    <tr
                      key={i}
                      className="border-b border-gray-100 transition-colors last:border-0 hover:bg-gray-50/50 dark:border-zinc-800 dark:hover:bg-zinc-800/30"
                    >
                      <td className="px-4 py-3">
                        <span className="text-xs font-medium text-gray-400 dark:text-zinc-500">{i + 1}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {seq.sequence.map((step, j) => (
                            <span key={j} className="flex items-center gap-1.5">
                              <span className="inline-block rounded-lg bg-gradient-to-br from-teal-50 to-cyan-50 px-2.5 py-1 text-xs font-semibold text-teal-700 dark:from-teal-950/40 dark:to-cyan-950/40 dark:text-teal-300">
                                {step}
                              </span>
                              {j < seq.sequence.length - 1 && (
                                <svg className="h-3 w-3 shrink-0 text-gray-300 dark:text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                                </svg>
                              )}
                            </span>
                          ))}
                          {seq.lowVolume && (
                            <span className="ml-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
                              low volume
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-gray-100 dark:bg-zinc-800">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-teal-400 to-cyan-400 dark:from-teal-500 dark:to-cyan-500"
                              style={{ width: `${(seq.userCount / maxUserCount) * 100}%` }}
                            />
                          </div>
                          <span className="min-w-[2rem] text-right text-sm font-semibold tabular-nums text-gray-900 dark:text-zinc-50">
                            {seq.userCount.toLocaleString()}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

type FeatureUsageInsightsData = {
  insights: Array<{
    featureId: string;
    featureName: string;
    totalEvents: number;
    classification: 'high' | 'low' | 'normal';
    insufficientData: boolean;
  }>;
  meanEvents: number;
  highThreshold: number;
  lowThreshold: number;
  totalFeatures: number;
  featuresWithData: number;
  startDate: string;
  endDate: string;
  method: string;
  insufficientData: boolean;
  insufficientDataReason?: string;
};

export function FeatureUsageInsightsSection({
  orgId,
  projectId,
  startDate,
  endDate,
}: {
  orgId: string;
  projectId: string;
  startDate: string;
  endDate: string;
}) {
  const [data, setData] = useState<FeatureUsageInsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showMethod, setShowMethod] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(
          `${API_URL}/organizations/${orgId}/projects/${projectId}/analytics/feature-usage-insights?startDate=${startDate}&endDate=${endDate}`,
          { credentials: 'include' },
        );
        if (cancelled) return;
        if (res.ok) {
          setData(await res.json());
        } else {
          setError('Failed to load feature usage insights.');
        }
      } catch {
        if (!cancelled) setError('Network error loading feature usage insights.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [orgId, projectId, startDate, endDate]);

  function classificationBadge(
    classification: 'high' | 'low' | 'normal',
    insufficientData: boolean,
  ) {
    if (insufficientData) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-500 dark:bg-zinc-800 dark:text-zinc-400">
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
          Insufficient data
        </span>
      );
    }
    if (classification === 'high') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22" /></svg>
          High usage
        </span>
      );
    }
    if (classification === 'low') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6L9 12.75l4.286-4.286a11.948 11.948 0 015.834 5.519l2.74 1.22" /></svg>
          Low usage
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12h-15" /></svg>
        Normal
      </span>
    );
  }

  const maxEvents = data && !data.insufficientData ? Math.max(...data.insights.map(i => i.totalEvents), 1) : 1;

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl border border-gray-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="border-b border-gray-100 px-6 py-4 dark:border-zinc-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-gray-900 dark:text-zinc-50">Feature usage insights</h2>
              {data && (
                <button
                  onClick={() => setShowMethod(!showMethod)}
                  className="flex h-5 w-5 items-center justify-center rounded-full border border-gray-200 text-xs text-gray-400 transition-colors hover:border-gray-300 hover:bg-gray-50 hover:text-gray-600 dark:border-zinc-700 dark:text-zinc-500 dark:hover:border-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
                  aria-label="Show classification method"
                >
                  ?
                </button>
              )}
            </div>
            {!loading && !error && data && !data.insufficientData && (
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1 text-xs text-gray-400 dark:text-zinc-500">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" /> High
                </span>
                <span className="flex items-center gap-1 text-xs text-gray-400 dark:text-zinc-500">
                  <span className="h-2 w-2 rounded-full bg-blue-400" /> Normal
                </span>
                <span className="flex items-center gap-1 text-xs text-gray-400 dark:text-zinc-500">
                  <span className="h-2 w-2 rounded-full bg-amber-400" /> Low
                </span>
              </div>
            )}
          </div>
        </div>

        {showMethod && data?.method && (
          <div className="border-b border-gray-100 bg-blue-50/50 px-6 py-3 dark:border-zinc-800 dark:bg-blue-950/20">
            <p className="text-xs text-gray-500 dark:text-zinc-400">{data.method}</p>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-blue-500" />
              <p className="text-sm text-gray-400 dark:text-zinc-500">Analyzing feature usage…</p>
            </div>
          </div>
        ) : error ? (
          <div className="px-6 py-8">
            <div className="flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 dark:bg-red-950/30">
              <svg className="h-4 w-4 shrink-0 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          </div>
        ) : data && data.insufficientData ? (
          <div className="flex flex-col items-center justify-center py-14">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 dark:bg-rose-900/20">
              <svg className="h-6 w-6 text-rose-400 dark:text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-500 dark:text-zinc-400">Not enough data</p>
            <p className="mt-1 max-w-sm text-center text-xs text-gray-400 dark:text-zinc-500">
              {data.insufficientDataReason ?? 'Insufficient data for feature usage insights.'}
            </p>
          </div>
        ) : data ? (
          <>
            <div className="grid grid-cols-4 gap-0 divide-x divide-gray-100 border-b border-gray-100 dark:divide-zinc-800 dark:border-zinc-800">
              <div className="px-5 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-zinc-500">Features</p>
                <p className="mt-0.5 text-lg font-bold text-gray-900 dark:text-zinc-50">{data.totalFeatures}</p>
              </div>
              <div className="px-5 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-zinc-500">Avg events</p>
                <p className="mt-0.5 text-lg font-bold tabular-nums text-gray-900 dark:text-zinc-50">{data.meanEvents.toLocaleString()}</p>
              </div>
              <div className="px-5 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-zinc-500">High threshold</p>
                <p className="mt-0.5 text-lg font-bold tabular-nums text-emerald-600 dark:text-emerald-400">&gt;{data.highThreshold.toLocaleString()}</p>
              </div>
              <div className="px-5 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-zinc-500">Low threshold</p>
                <p className="mt-0.5 text-lg font-bold tabular-nums text-amber-600 dark:text-amber-400">&lt;{data.lowThreshold.toLocaleString()}</p>
              </div>
            </div>

            <div className="divide-y divide-gray-100 dark:divide-zinc-800">
              {data.insights.map((insight) => (
                <div key={insight.featureId} className="flex items-center gap-4 px-6 py-4 transition-colors hover:bg-gray-50/50 dark:hover:bg-zinc-800/30">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                    insight.insufficientData ? 'bg-gray-100 dark:bg-zinc-800' :
                    insight.classification === 'high' ? 'bg-gradient-to-br from-emerald-50 to-green-50 dark:from-emerald-950/40 dark:to-green-950/40' :
                    insight.classification === 'low' ? 'bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/40 dark:to-orange-950/40' :
                    'bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/40 dark:to-indigo-950/40'
                  }`}>
                    <svg className={`h-4 w-4 ${
                      insight.insufficientData ? 'text-gray-400 dark:text-zinc-500' :
                      insight.classification === 'high' ? 'text-emerald-500 dark:text-emerald-400' :
                      insight.classification === 'low' ? 'text-amber-500 dark:text-amber-400' :
                      'text-blue-500 dark:text-blue-400'
                    }`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                    </svg>
                  </div>
                  <div className="flex flex-1 flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-gray-900 dark:text-zinc-50">{insight.featureName}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-bold tabular-nums text-gray-900 dark:text-zinc-50">
                          {insight.totalEvents.toLocaleString()}
                          <span className="ml-1 text-xs font-normal text-gray-400 dark:text-zinc-500">events</span>
                        </span>
                        {classificationBadge(insight.classification, insight.insufficientData)}
                      </div>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-zinc-800">
                      <div
                        className={`h-full rounded-full transition-all ${
                          insight.insufficientData ? 'bg-gray-300 dark:bg-zinc-600' :
                          insight.classification === 'high' ? 'bg-gradient-to-r from-emerald-400 to-green-400 dark:from-emerald-500 dark:to-green-500' :
                          insight.classification === 'low' ? 'bg-gradient-to-r from-amber-400 to-orange-400 dark:from-amber-500 dark:to-orange-500' :
                          'bg-gradient-to-r from-blue-400 to-indigo-400 dark:from-blue-500 dark:to-indigo-500'
                        }`}
                        style={{ width: `${Math.max((insight.totalEvents / maxEvents) * 100, 2)}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

type ActivityChangeEntry = {
  eventName: string;
  currentCount: number;
  baselineCount: number;
  direction: 'increase' | 'decrease' | 'unchanged';
  percentChange: number;
  lowVolume: boolean;
};

type ActivityChangesData = {
  overall: {
    currentTotal: number;
    baselineTotal: number;
    direction: 'increase' | 'decrease' | 'unchanged';
    percentChange: number;
  };
  changes: ActivityChangeEntry[];
  significantChanges: ActivityChangeEntry[];
  currentPeriod: { startDate: string; endDate: string };
  baselinePeriod: { startDate: string; endDate: string };
  method: string;
  insufficientData: boolean;
  insufficientDataReason?: string;
};

export function ActivityChangesSection({
  orgId,
  projectId,
  startDate,
  endDate,
}: {
  orgId: string;
  projectId: string;
  startDate: string;
  endDate: string;
}) {
  const [data, setData] = useState<ActivityChangesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showMethod, setShowMethod] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(
          `${API_URL}/organizations/${orgId}/projects/${projectId}/analytics/activity-changes?startDate=${startDate}&endDate=${endDate}`,
          { credentials: 'include' },
        );
        if (cancelled) return;
        if (res.ok) {
          setData(await res.json());
        } else {
          setError('Failed to load activity changes.');
        }
      } catch {
        if (!cancelled) setError('Network error loading activity changes.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [orgId, projectId, startDate, endDate]);

  function directionBadge(
    direction: 'increase' | 'decrease' | 'unchanged',
    pct: number,
    lowVolume: boolean,
  ) {
    if (lowVolume) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-500 dark:bg-zinc-800 dark:text-zinc-400">
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
          Low volume
        </span>
      );
    }
    if (direction === 'increase') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" /></svg>
          +{Math.abs(pct)}%
        </span>
      );
    }
    if (direction === 'decrease') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600 dark:bg-red-900/30 dark:text-red-400">
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 4.5l15 15m0 0V8.25m0 11.25H8.25" /></svg>
          {pct}%
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12h-15" /></svg>
        Unchanged
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl border border-gray-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="border-b border-gray-100 px-6 py-4 dark:border-zinc-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-gray-900 dark:text-zinc-50">Activity changes</h2>
              {data && (
                <button
                  onClick={() => setShowMethod(!showMethod)}
                  className="flex h-5 w-5 items-center justify-center rounded-full border border-gray-200 text-xs text-gray-400 transition-colors hover:border-gray-300 hover:bg-gray-50 hover:text-gray-600 dark:border-zinc-700 dark:text-zinc-500 dark:hover:border-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
                  aria-label="Show comparison method"
                >
                  ?
                </button>
              )}
            </div>
            {!loading && !error && data && !data.insufficientData && data.significantChanges.length > 0 && (
              <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
                {data.significantChanges.length} change{data.significantChanges.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>

        {showMethod && data?.method && (
          <div className="border-b border-gray-100 bg-blue-50/50 px-6 py-3 dark:border-zinc-800 dark:bg-blue-950/20">
            <p className="text-xs text-gray-500 dark:text-zinc-400">{data.method}</p>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-amber-500" />
              <p className="text-sm text-gray-400 dark:text-zinc-500">Analyzing activity changes…</p>
            </div>
          </div>
        ) : error ? (
          <div className="px-6 py-8">
            <div className="flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 dark:bg-red-950/30">
              <svg className="h-4 w-4 shrink-0 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          </div>
        ) : data && data.insufficientData ? (
          <div className="flex flex-col items-center justify-center py-14">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 dark:bg-amber-900/20">
              <svg className="h-6 w-6 text-amber-400 dark:text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5L7.5 3m0 0L12 7.5M7.5 3v13.5m13.5-13.5L16.5 7.5m0 0L12 3m4.5 4.5V21" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-500 dark:text-zinc-400">Not enough data</p>
            <p className="mt-1 max-w-sm text-center text-xs text-gray-400 dark:text-zinc-500">
              {data.insufficientDataReason ?? 'Insufficient data for activity change analysis.'}
            </p>
          </div>
        ) : data ? (
          <>
            {/* Overall summary stats */}
            <div className="grid grid-cols-3 gap-0 divide-x divide-gray-100 border-b border-gray-100 dark:divide-zinc-800 dark:border-zinc-800">
              <div className="px-6 py-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-zinc-500">Current period</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-gray-900 dark:text-zinc-50">{data.overall.currentTotal.toLocaleString()}</p>
                <p className="mt-0.5 text-xs text-gray-400 dark:text-zinc-500">{formatDateRange(data.currentPeriod.startDate, data.currentPeriod.endDate)}</p>
              </div>
              <div className="px-6 py-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-zinc-500">Baseline period</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-gray-900 dark:text-zinc-50">{data.overall.baselineTotal.toLocaleString()}</p>
                <p className="mt-0.5 text-xs text-gray-400 dark:text-zinc-500">{formatDateRange(data.baselinePeriod.startDate, data.baselinePeriod.endDate)}</p>
              </div>
              <div className="px-6 py-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-zinc-500">Overall change</p>
                <div className="mt-1">
                  {directionBadge(data.overall.direction, data.overall.percentChange, false)}
                </div>
                <p className="mt-1.5 text-xs text-gray-400 dark:text-zinc-500">
                  {data.overall.direction === 'increase' ? 'More' : data.overall.direction === 'decrease' ? 'Fewer' : 'Same'} events than baseline
                </p>
              </div>
            </div>

            {/* Significant changes list */}
            {data.significantChanges.length > 0 ? (
              <div className="divide-y divide-gray-100 dark:divide-zinc-800">
                {data.significantChanges.map((change) => (
                  <div key={change.eventName} className="flex items-center gap-4 px-6 py-4 transition-colors hover:bg-gray-50/50 dark:hover:bg-zinc-800/30">
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                      change.lowVolume ? 'bg-gray-100 dark:bg-zinc-800' :
                      change.direction === 'increase' ? 'bg-gradient-to-br from-emerald-50 to-green-50 dark:from-emerald-950/40 dark:to-green-950/40' :
                      change.direction === 'decrease' ? 'bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-950/40 dark:to-rose-950/40' :
                      'bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/40 dark:to-indigo-950/40'
                    }`}>
                      <svg className={`h-4 w-4 ${
                        change.lowVolume ? 'text-gray-400 dark:text-zinc-500' :
                        change.direction === 'increase' ? 'text-emerald-500 dark:text-emerald-400' :
                        change.direction === 'decrease' ? 'text-red-500 dark:text-red-400' :
                        'text-blue-500 dark:text-blue-400'
                      }`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        {change.direction === 'increase' ? (
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22" />
                        ) : change.direction === 'decrease' ? (
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6L9 12.75l4.286-4.286a11.948 11.948 0 015.834 5.519l2.74 1.22" />
                        ) : (
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12h-15" />
                        )}
                      </svg>
                    </div>
                    <div className="flex flex-1 flex-col gap-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-gray-900 dark:text-zinc-50">{change.eventName}</span>
                        {directionBadge(change.direction, change.percentChange, change.lowVolume)}
                      </div>
                      <div className="flex items-center gap-4 text-xs text-gray-400 dark:text-zinc-500">
                        <span>Current: <span className="font-semibold tabular-nums text-gray-600 dark:text-zinc-300">{change.currentCount.toLocaleString()}</span></span>
                        <span>Baseline: <span className="font-medium tabular-nums">{change.baselineCount.toLocaleString()}</span></span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-10">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-green-50 dark:bg-green-900/20">
                  <svg className="h-5 w-5 text-green-400 dark:text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-gray-500 dark:text-zinc-400">No significant changes</p>
                <p className="mt-1 text-xs text-gray-400 dark:text-zinc-500">Activity is stable in this period.</p>
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}

function FunnelForm({
  eventNames,
  initialName = '',
  initialSteps,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  eventNames: string[];
  initialName?: string;
  initialSteps?: { eventName: string }[];
  onSubmit: (name: string, steps: { eventName: string }[]) => void;
  onCancel?: () => void;
  submitLabel: string;
}) {
  const [name, setName] = useState(initialName);
  const [steps, setSteps] = useState<{ eventName: string }[]>(
    initialSteps ?? [{ eventName: '' }, { eventName: '' }],
  );
  const [submitting, setSubmitting] = useState(false);

  function addStep() {
    if (steps.length < 20) setSteps([...steps, { eventName: '' }]);
  }

  function removeStep(index: number) {
    if (steps.length > 2) setSteps(steps.filter((_, i) => i !== index));
  }

  function updateStep(index: number, eventName: string) {
    setSteps(steps.map((s, i) => (i === index ? { eventName } : s)));
  }

  function moveStep(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= steps.length) return;
    const updated = [...steps];
    [updated[index], updated[target]] = [updated[target], updated[index]];
    setSteps(updated);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (steps.some((s) => !s.eventName.trim())) return;
    setSubmitting(true);
    try {
      await onSubmit(name, steps);
    } finally {
      setSubmitting(false);
    }
  }

  const listId = `event-names-${initialName || 'new'}`;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <input
        type="text"
        required
        placeholder="Funnel name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        disabled={submitting}
        className="rounded-xl border border-gray-200 bg-transparent px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-50 dark:placeholder:text-zinc-500 dark:focus:border-blue-500 dark:focus:ring-blue-900/30"
      />

      <div className="flex flex-col gap-2.5">
        <span className="text-xs font-semibold text-gray-500 dark:text-zinc-400">
          Steps (min 2, max 20)
        </span>
        {steps.map((step, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-purple-100 text-xs font-bold text-purple-600 dark:bg-purple-900/40 dark:text-purple-400">
              {i + 1}
            </span>
            <input
              type="text"
              required
              placeholder="Event name"
              value={step.eventName}
              onChange={(e) => updateStep(i, e.target.value)}
              list={listId}
              disabled={submitting}
              className="flex-1 rounded-xl border border-gray-200 bg-transparent px-3.5 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-50 dark:placeholder:text-zinc-500 dark:focus:border-blue-500 dark:focus:ring-blue-900/30"
            />
            <button
              type="button"
              onClick={() => moveStep(i, -1)}
              disabled={i === 0 || submitting}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-30 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
              title="Move up"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" /></svg>
            </button>
            <button
              type="button"
              onClick={() => moveStep(i, 1)}
              disabled={i === steps.length - 1 || submitting}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-30 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
              title="Move down"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
            </button>
            <button
              type="button"
              onClick={() => removeStep(i)}
              disabled={steps.length <= 2 || submitting}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30 dark:text-red-500 dark:hover:bg-red-950/30 dark:hover:text-red-400"
              title="Remove step"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        ))}
        <datalist id={listId}>
          {eventNames.map((en) => (
            <option key={en} value={en} />
          ))}
        </datalist>
        <button
          type="button"
          onClick={addStep}
          disabled={steps.length >= 20 || submitting}
          className="self-start rounded-xl border border-dashed border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-500 transition-colors hover:border-purple-300 hover:bg-purple-50 hover:text-purple-600 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-400 dark:hover:border-purple-800 dark:hover:bg-purple-950/20 dark:hover:text-purple-400"
        >
          + Add step
        </button>
      </div>

      <div className="flex gap-2 self-end">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-700 hover:shadow disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
        >
          {submitting ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  );
}

interface AnalysisRunData {
  id: string;
  status: string;
  periodStart: string;
  periodEnd: string;
  eventCount: number | null;
  statusMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

function statusBadge(status: string) {
  const config: Record<string, { style: string; icon: React.ReactNode }> = {
    QUEUED: {
      style: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
      icon: (
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    RUNNING: {
      style: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
      icon: (
        <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
        </svg>
      ),
    },
    COMPLETED: {
      style: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
      icon: (
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    FAILED: {
      style: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400',
      icon: (
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
      ),
    },
    INSUFFICIENT_DATA: {
      style: 'bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
      icon: (
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
        </svg>
      ),
    },
  };
  const c = config[status] ?? {
    style: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
    icon: null,
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${c.style}`}>
      {c.icon}
      {status.replace(/_/g, ' ')}
    </span>
  );
}

type RecommendationData = {
  id: string;
  analysisRunId: string;
  title: string;
  summary: string;
  suggestedAction: string;
  category: string;
  affectedFeatureId: string | null;
  affectedArea: string | null;
  evidence: Record<string, unknown> | null;
  confidence: number | null;
  impact: number | null;
  reach: number | null;
  priorityScore: number | null;
  periodStart: string;
  periodEnd: string;
  status: string;
  createdAt: string;
};

const categoryColors: Record<string, string> = {
  adoption: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  engagement: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  retention: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  ux: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  general: 'bg-zinc-100 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-300',
};

const metricDefinitions: Record<string, string> = {
  adoptionRate:
    'Percentage of active users who triggered at least one event mapped to this feature.',
  featureUsers:
    'Number of distinct users who triggered events mapped to this feature in the period.',
  totalUsers:
    'Total distinct users (by userId or anonymousId) active in the project during the period.',
  activeUsers: 'Distinct users who triggered any event in the project during the period.',
  currentCount: 'Total event count for this event name in the analysis period.',
  baselineCount: 'Total event count for this event name in the equivalent preceding period.',
  percentChange: 'Percentage change from baseline to current period.',
  totalEvents: 'Total events triggered for this feature during the analysis period.',
  classification:
    'Relative usage level (high/low/normal) compared to other features in the same project.',
};

function EvidenceMetricRow({
  label,
  value,
  definitionKey,
}: {
  label: string;
  value: string | number;
  definitionKey?: string;
}) {
  const [showDef, setShowDef] = useState(false);
  const definition = definitionKey ? metricDefinitions[definitionKey] : undefined;
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <span className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
        {label}
        {definition && (
          <button
            type="button"
            onClick={() => setShowDef(!showDef)}
            className="rounded-full px-1 text-[10px] text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
            aria-label={`Define ${label}`}
          >
            ?
          </button>
        )}
      </span>
      <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </span>
      {showDef && definition && (
        <p className="basis-full text-[11px] text-blue-600 dark:text-blue-400">{definition}</p>
      )}
    </div>
  );
}

function FeatureAdoptionEvidence({ evidence }: { evidence: Record<string, unknown> }) {
  const rate = evidence.adoptionRate as number;
  const users = evidence.featureUsers as number;
  const total = evidence.totalUsers as number;
  const active = evidence.activeUsers as number;
  const name = (evidence.featureName as string) ?? 'Unknown feature';
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
        Feature adoption — {name}
      </p>
      <EvidenceMetricRow label="Adoption rate" value={`${rate}%`} definitionKey="adoptionRate" />
      <EvidenceMetricRow label="Feature users" value={users} definitionKey="featureUsers" />
      <EvidenceMetricRow label="Total active users" value={total} definitionKey="totalUsers" />
      <EvidenceMetricRow label="Project active users" value={active} definitionKey="activeUsers" />
    </div>
  );
}

function ActivityChangeEvidence({ evidence }: { evidence: Record<string, unknown> }) {
  const eventName = evidence.eventName as string;
  const current = evidence.currentCount as number;
  const baseline = evidence.baselineCount as number;
  const direction = evidence.direction as string;
  const pct = evidence.percentChange as number;
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
        Activity change — {eventName}
      </p>
      <EvidenceMetricRow
        label="Current period count"
        value={current}
        definitionKey="currentCount"
      />
      <EvidenceMetricRow
        label="Baseline period count"
        value={baseline}
        definitionKey="baselineCount"
      />
      <EvidenceMetricRow label="Direction" value={direction} />
      <EvidenceMetricRow
        label="Change"
        value={`${pct > 0 ? '+' : ''}${pct}%`}
        definitionKey="percentChange"
      />
    </div>
  );
}

function FeatureUsageEvidence({ evidence }: { evidence: Record<string, unknown> }) {
  const name = (evidence.featureName as string) ?? 'Unknown feature';
  const total = evidence.totalEvents as number;
  const cls = evidence.classification as string;
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Feature usage — {name}</p>
      <EvidenceMetricRow label="Total events" value={total} definitionKey="totalEvents" />
      <EvidenceMetricRow label="Classification" value={cls} definitionKey="classification" />
    </div>
  );
}

function GenericEvidence({ evidence }: { evidence: Record<string, unknown> }) {
  const entries = Object.entries(evidence).filter(([k]) => k !== 'type' && k !== 'period');
  if (entries.length === 0) return null;
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Supporting data</p>
      {entries.map(([key, val]) => (
        <EvidenceMetricRow
          key={key}
          label={key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())}
          value={typeof val === 'object' ? JSON.stringify(val) : String(val)}
        />
      ))}
    </div>
  );
}

function EvidenceDisplay({
  evidence,
  periodStart,
  periodEnd,
  analysisRunId,
}: {
  evidence: Record<string, unknown> | null;
  periodStart: string;
  periodEnd: string;
  analysisRunId: string;
}) {
  if (!evidence || typeof evidence !== 'object' || Object.keys(evidence).length === 0) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-900">
        <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
          No supporting evidence available for this recommendation.
        </p>
      </div>
    );
  }

  const evidenceType = evidence.type as string | undefined;
  const period = evidence.period as { start?: string; end?: string } | undefined;
  const displayStart = period?.start ?? periodStart;
  const displayEnd = period?.end ?? periodEnd;

  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-800 dark:bg-emerald-950">
      <p className="mb-2 text-xs font-medium text-emerald-800 dark:text-emerald-200">
        Observed evidence
      </p>
      {evidenceType === 'feature_adoption' && <FeatureAdoptionEvidence evidence={evidence} />}
      {evidenceType === 'activity_change' && <ActivityChangeEvidence evidence={evidence} />}
      {evidenceType === 'feature_usage' && <FeatureUsageEvidence evidence={evidence} />}
      {evidenceType !== 'feature_adoption' &&
        evidenceType !== 'activity_change' &&
        evidenceType !== 'feature_usage' && <GenericEvidence evidence={evidence} />}
      <div className="mt-2 flex flex-wrap gap-3 border-t border-emerald-200 pt-2 dark:border-emerald-800">
        <span className="text-[11px] text-emerald-700 dark:text-emerald-300">
          Period: {new Date(displayStart).toLocaleDateString()} –{' '}
          {new Date(displayEnd).toLocaleDateString()}
        </span>
        <span className="text-[11px] text-emerald-600 dark:text-emerald-400">
          Analysis run: {analysisRunId.slice(0, 8)}…
        </span>
      </div>
    </div>
  );
}

function scoreColor(score: number): string {
  if (score > 0.6) return 'text-green-700 dark:text-green-400';
  if (score >= 0.3) return 'text-amber-700 dark:text-amber-400';
  return 'text-zinc-500 dark:text-zinc-400';
}

function scoreBg(score: number): string {
  if (score > 0.6) return 'bg-green-100 dark:bg-green-900/30';
  if (score >= 0.3) return 'bg-amber-100 dark:bg-amber-900/30';
  return 'bg-zinc-100 dark:bg-zinc-800';
}

function PriorityScoreDisplay({ rec }: { rec: RecommendationData }) {
  const [showDetail, setShowDetail] = useState(false);

  if (rec.priorityScore == null) {
    return (
      <span className="text-xs text-zinc-400 dark:text-zinc-500 italic">Score unavailable</span>
    );
  }

  return (
    <div className="inline-flex flex-col">
      <button
        type="button"
        onClick={() => setShowDetail(!showDetail)}
        className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-medium ${scoreBg(rec.priorityScore)} ${scoreColor(rec.priorityScore)}`}
        title="Priority Score = Reach × Impact × Confidence. This is a relative ranking aid, not a guarantee of outcomes."
      >
        Priority: {rec.priorityScore.toFixed(2)}
        <span className="text-[10px] opacity-60">{showDetail ? '▲' : '▼'}</span>
      </button>
      {showDetail && (
        <div className="mt-1 flex gap-3 text-[11px] text-zinc-500 dark:text-zinc-400">
          <span>
            Reach: <strong className={scoreColor(rec.reach!)}>{rec.reach!.toFixed(2)}</strong>
          </span>
          <span>
            Impact: <strong className={scoreColor(rec.impact!)}>{rec.impact!.toFixed(2)}</strong>
          </span>
          <span>
            Confidence:{' '}
            <strong className={scoreColor(rec.confidence!)}>{rec.confidence!.toFixed(2)}</strong>
          </span>
        </div>
      )}
    </div>
  );
}

const recStatusColors: Record<string, string> = {
  PUBLISHED: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  ACCEPTED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  REJECTED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  DEFERRED: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
};

const STATUS_FILTERS = ['ALL', 'PUBLISHED', 'ACCEPTED', 'REJECTED', 'DEFERRED'] as const;

export function RecommendationsSection({ orgId, projectId }: { orgId: string; projectId: string }) {
  const [recommendations, setRecommendations] = useState<RecommendationData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError('');
      try {
        const url =
          statusFilter === 'ALL'
            ? `${API_URL}/organizations/${orgId}/projects/${projectId}/recommendations`
            : `${API_URL}/organizations/${orgId}/projects/${projectId}/recommendations?status=${statusFilter}`;
        const res = await fetch(url, { credentials: 'include' });
        if (cancelled) return;
        if (!res.ok) {
          setError('Failed to load recommendations.');
          return;
        }
        const data = await res.json();
        setRecommendations(data);
      } catch {
        if (!cancelled) setError('Failed to load recommendations.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [orgId, projectId, statusFilter]);

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl border border-gray-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="border-b border-gray-100 px-6 py-4 dark:border-zinc-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <h2 className="text-base font-semibold text-gray-900 dark:text-zinc-50">Recommendations</h2>
              {!loading && recommendations.length > 0 && (
                <span className="rounded-full bg-fuchsia-50 px-2 py-0.5 text-xs font-semibold text-fuchsia-600 dark:bg-fuchsia-900/30 dark:text-fuchsia-400">
                  {recommendations.length}
                </span>
              )}
            </div>
            <div className="flex gap-1 rounded-lg border border-gray-200 p-0.5 dark:border-zinc-700">
              {STATUS_FILTERS.map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    statusFilter === s
                      ? 'bg-fuchsia-600 text-white shadow-sm'
                      : 'text-gray-500 hover:bg-gray-100 dark:text-zinc-400 dark:hover:bg-zinc-800'
                  }`}
                >
                  {s === 'ALL' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-fuchsia-500" />
              <p className="text-sm text-gray-400 dark:text-zinc-500">Loading recommendations…</p>
            </div>
          </div>
        ) : error ? (
          <div className="px-6 py-8">
            <div className="flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 dark:bg-red-950/30">
              <svg className="h-4 w-4 shrink-0 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          </div>
        ) : recommendations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-fuchsia-50 dark:bg-fuchsia-900/20">
              <svg className="h-6 w-6 text-fuchsia-400 dark:text-fuchsia-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-500 dark:text-zinc-400">No recommendations yet</p>
            <p className="mt-1 max-w-sm text-center text-xs text-gray-400 dark:text-zinc-500">
              {statusFilter === 'ALL'
                ? 'Request an analysis from the Analysis Runs page to generate insights.'
                : `No ${statusFilter.toLowerCase()} recommendations found.`}
            </p>
          </div>
        ) : (
          <>
            <div className="border-b border-gray-100 px-6 py-2.5 dark:border-zinc-800">
              <p className="text-xs text-gray-400 italic dark:text-zinc-500">
                Ranked by priority score (Reach x Impact x Confidence). Scores are ranking aids, not guarantees.
              </p>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-zinc-800">
              {recommendations.map((rec) => (
                <div key={rec.id} className="flex flex-col">
                  <div className="px-6 py-5 transition-colors hover:bg-gray-50/50 dark:hover:bg-zinc-800/30">
                    <div className="flex items-start gap-4">
                      <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${
                        rec.category === 'adoption' ? 'from-purple-50 to-violet-50 dark:from-purple-950/40 dark:to-violet-950/40' :
                        rec.category === 'engagement' ? 'from-blue-50 to-indigo-50 dark:from-blue-950/40 dark:to-indigo-950/40' :
                        rec.category === 'retention' ? 'from-emerald-50 to-green-50 dark:from-emerald-950/40 dark:to-green-950/40' :
                        rec.category === 'ux' ? 'from-orange-50 to-amber-50 dark:from-orange-950/40 dark:to-amber-950/40' :
                        'from-gray-50 to-slate-50 dark:from-zinc-800 dark:to-zinc-800'
                      }`}>
                        <svg className={`h-4 w-4 ${
                          rec.category === 'adoption' ? 'text-purple-500 dark:text-purple-400' :
                          rec.category === 'engagement' ? 'text-blue-500 dark:text-blue-400' :
                          rec.category === 'retention' ? 'text-emerald-500 dark:text-emerald-400' :
                          rec.category === 'ux' ? 'text-orange-500 dark:text-orange-400' :
                          'text-gray-400 dark:text-zinc-500'
                        }`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <div className="mb-1.5 flex flex-wrap items-center gap-2">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${categoryColors[rec.category] ?? categoryColors.general}`}>
                            {rec.category}
                          </span>
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${recStatusColors[rec.status] ?? recStatusColors.PUBLISHED}`}>
                            {rec.status}
                          </span>
                          <PriorityScoreDisplay rec={rec} />
                          {rec.affectedArea && (
                            <span className="text-xs text-gray-400 dark:text-zinc-500">
                              {rec.affectedArea}
                            </span>
                          )}
                        </div>
                        <Link
                          href={`/organizations/${orgId}/projects/${projectId}/recommendations/${rec.id}`}
                          className="text-sm font-semibold text-gray-900 hover:text-fuchsia-600 dark:text-zinc-50 dark:hover:text-fuchsia-400"
                        >
                          {rec.title}
                        </Link>
                        <p className="mt-1 text-sm leading-relaxed text-gray-500 dark:text-zinc-400">{rec.summary}</p>
                        <div className="mt-2 flex items-center gap-3">
                          <span className="text-xs text-gray-400 dark:text-zinc-500">
                            {new Date(rec.createdAt).toLocaleDateString()}
                          </span>
                          <Link
                            href={`/organizations/${orgId}/projects/${projectId}/recommendations/${rec.id}`}
                            className="rounded-lg bg-fuchsia-50 px-2.5 py-1 text-xs font-semibold text-fuchsia-600 transition-colors hover:bg-fuchsia-100 dark:bg-fuchsia-900/20 dark:text-fuchsia-400 dark:hover:bg-fuchsia-900/40"
                          >
                            View details
                          </Link>
                          <button
                            type="button"
                            onClick={() => setExpandedId(expandedId === rec.id ? null : rec.id)}
                            className="rounded-lg px-2.5 py-1 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                          >
                            {expandedId === rec.id ? 'Hide' : 'Evidence'}
                          </button>
                        </div>
                      </div>
                    </div>

                    {expandedId === rec.id && (
                      <div className="mt-4 ml-13 space-y-3 border-t border-gray-100 pt-4 dark:border-zinc-800" style={{ marginLeft: '52px' }}>
                        <EvidenceDisplay
                          evidence={rec.evidence}
                          periodStart={rec.periodStart}
                          periodEnd={rec.periodEnd}
                          analysisRunId={rec.analysisRunId}
                        />
                        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-800/50 dark:bg-amber-950/20">
                          <div className="mb-1.5 flex items-center gap-1.5">
                            <svg className="h-3.5 w-3.5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
                            </svg>
                            <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">AI Suggested Action</p>
                          </div>
                          <p className="text-sm leading-relaxed text-amber-800 dark:text-amber-200">{rec.suggestedAction}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function AnalysisRunsSection({ orgId, projectId }: { orgId: string; projectId: string }) {
  const [runs, setRuns] = useState<AnalysisRunData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [requesting, setRequesting] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(
          `${API_URL}/organizations/${orgId}/projects/${projectId}/analysis-runs`,
          { credentials: 'include' },
        );
        if (cancelled) return;
        if (res.ok) {
          const data: AnalysisRunData[] = await res.json();
          setRuns(data);
          setError('');
        } else {
          setError('Failed to load analysis runs.');
        }
      } catch {
        if (!cancelled) setError('Network error loading analysis runs.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [orgId, projectId, refreshKey]);

  useEffect(() => {
    const hasActive = runs.some((r) => r.status === 'QUEUED' || r.status === 'RUNNING');
    if (!hasActive) return;

    const interval = setInterval(() => {
      setRefreshKey((k) => k + 1);
    }, 10_000);
    return () => clearInterval(interval);
  }, [runs]);

  const hasActiveRun = runs.some((r) => r.status === 'QUEUED' || r.status === 'RUNNING');

  async function handleRequest() {
    setRequesting(true);
    try {
      const res = await fetch(
        `${API_URL}/organizations/${orgId}/projects/${projectId}/analysis-runs`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        },
      );
      if (res.ok) {
        setRefreshKey((k) => k + 1);
      } else if (res.status === 409) {
        setError('An analysis is already in progress.');
      } else {
        setError('Failed to request analysis.');
      }
    } catch {
      setError('Network error requesting analysis.');
    } finally {
      setRequesting(false);
    }
  }

  const statusIcon = (s: string) => {
    const map: Record<string, { bg: string; icon: React.ReactNode }> = {
      QUEUED: {
        bg: 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400',
        icon: (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ),
      },
      RUNNING: {
        bg: 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400',
        icon: (
          <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
          </svg>
        ),
      },
      COMPLETED: {
        bg: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400',
        icon: (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ),
      },
      FAILED: {
        bg: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400',
        icon: (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
        ),
      },
      INSUFFICIENT_DATA: {
        bg: 'bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-400',
        icon: (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
          </svg>
        ),
      },
    };
    return map[s] ?? { bg: 'bg-gray-100 text-gray-600 dark:bg-zinc-800 dark:text-zinc-400', icon: null };
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-gray-900 dark:text-zinc-50">Analysis Runs</h2>
          {!loading && runs.length > 0 && (
            <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium tabular-nums text-sky-700 dark:bg-sky-900/30 dark:text-sky-400">
              {runs.length}
            </span>
          )}
        </div>
        <button
          onClick={handleRequest}
          disabled={requesting || hasActiveRun}
          className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {requesting ? (
            <>
              <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              Requesting…
            </>
          ) : (
            <>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
              </svg>
              Request Analysis
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="mx-6 mt-4 flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 dark:bg-red-900/20">
          <svg className="h-4 w-4 flex-shrink-0 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="flex items-center gap-3">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-sky-600" />
            <p className="text-sm text-gray-500 dark:text-zinc-400">Loading analysis runs…</p>
          </div>
        </div>
      )}

      {!loading && runs.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-sky-50 dark:bg-sky-900/30">
            <svg className="h-6 w-6 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
            </svg>
          </div>
          <p className="text-sm font-medium text-gray-900 dark:text-zinc-100">No analysis runs yet</p>
          <p className="mt-1 max-w-xs text-sm text-gray-500 dark:text-zinc-400">
            Request an analysis to get AI-powered product insights and recommendations.
          </p>
        </div>
      )}

      {!loading && runs.length > 0 && (
        <div className="divide-y divide-gray-100 dark:divide-zinc-800">
          {runs.map((run) => {
            const si = statusIcon(run.status);
            return (
              <Link
                key={run.id}
                href={`/organizations/${orgId}/projects/${projectId}/analysis-runs/${run.id}`}
                className="flex items-center gap-4 px-6 py-4 transition-colors hover:bg-gray-50/50 dark:hover:bg-zinc-800/50"
              >
                <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${si.bg}`}>
                  {si.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900 dark:text-zinc-100">
                      {new Date(run.periodStart).toLocaleDateString()} – {new Date(run.periodEnd).toLocaleDateString()}
                    </span>
                    {statusBadge(run.status)}
                  </div>
                  <div className="mt-0.5 flex items-center gap-3 text-xs text-gray-500 dark:text-zinc-400">
                    <span>Created {new Date(run.createdAt).toLocaleString()}</span>
                    {run.eventCount != null && (
                      <span className="tabular-nums">{run.eventCount.toLocaleString()} events</span>
                    )}
                  </div>
                  {run.statusMessage && (
                    <p className="mt-1 text-xs text-gray-500 dark:text-zinc-400">{run.statusMessage}</p>
                  )}
                  {run.status === 'INSUFFICIENT_DATA' && (
                    <p className="mt-1 text-xs text-orange-600 dark:text-orange-400">
                      Not enough data — ensure your project is tracking events before requesting analysis.
                    </p>
                  )}
                </div>
                <svg className="h-4 w-4 flex-shrink-0 text-gray-400 dark:text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
