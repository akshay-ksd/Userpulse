'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

type ProjectInfo = {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  status: string;
  createdAt: string;
};

type State =
  | { status: 'loading' }
  | { status: 'not-found' }
  | { status: 'error' }
  | { status: 'ready'; project: ProjectInfo };

function EditProjectForm({
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

function TrackingCredentials({ orgId, projectId }: { orgId: string; projectId: string }) {
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
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-medium text-black dark:text-zinc-50">Tracking credentials</h2>

      {newKey && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950">
          <p className="mb-2 text-sm font-medium text-amber-800 dark:text-amber-200">
            Save this key now — it won&apos;t be shown again.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 overflow-auto rounded bg-white px-3 py-2 font-mono text-sm text-black dark:bg-zinc-900 dark:text-zinc-50">
              {newKey.key}
            </code>
            <button
              onClick={() => handleCopy(newKey.key)}
              className="shrink-0 rounded-lg border border-black/[.15] px-3 py-2 text-sm font-medium text-black transition-colors hover:bg-zinc-50 dark:border-white/[.2] dark:text-zinc-50 dark:hover:bg-zinc-900"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <button
            onClick={() => setNewKey(null)}
            className="mt-2 text-xs text-amber-700 underline underline-offset-2 hover:text-amber-900 dark:text-amber-300 dark:hover:text-amber-100"
          >
            Dismiss
          </button>
        </div>
      )}

      <form onSubmit={handleCreate} className="flex gap-2">
        <input
          type="text"
          required
          placeholder="Credential name (e.g. Production)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={creating}
          className="flex-1 rounded-lg border border-black/[.15] bg-transparent px-3 py-2 text-sm text-black placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-black/20 disabled:opacity-50 dark:border-white/[.2] dark:text-zinc-50 dark:placeholder:text-zinc-500 dark:focus:ring-white/20"
        />
        <button
          type="submit"
          disabled={creating}
          className="shrink-0 rounded-lg bg-black px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-50 dark:text-black dark:hover:bg-zinc-200"
        >
          {creating ? 'Generating…' : 'Generate'}
        </button>
      </form>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {loading ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading credentials…</p>
      ) : credentials.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No credentials yet. Generate one to start sending events.
        </p>
      ) : (
        <div className="divide-y divide-black/[.08] rounded-lg border border-black/[.08] dark:divide-white/[.08] dark:border-white/[.08]">
          {credentials.map((cred) => (
            <div key={cred.id} className="flex items-center justify-between px-4 py-3">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium text-black dark:text-zinc-50">
                  {cred.name}
                </span>
                <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
                  {cred.keyPrefix}••••••••
                </span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex flex-col items-end gap-0.5">
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    Created {new Date(cred.createdAt).toLocaleDateString()}
                  </span>
                  {cred.lastUsedAt && (
                    <span className="text-xs text-zinc-400 dark:text-zinc-500">
                      Last used {new Date(cred.lastUsedAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => handleRotate(cred)}
                    disabled={rotatingId === cred.id || revokingId === cred.id}
                    className="rounded px-2 py-1 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-zinc-800"
                  >
                    {rotatingId === cred.id ? 'Rotating…' : 'Rotate'}
                  </button>
                  <button
                    onClick={() => handleRevoke(cred.id)}
                    disabled={revokingId === cred.id || rotatingId === cred.id}
                    className="rounded px-2 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950"
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

function DateRangeControl({
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
  const activePreset = getActivePreset(localStart, localEnd);

  function handlePreset(preset: PeriodPreset) {
    const range = getDateRange(preset);
    setLocalStart(range.startDate);
    setLocalEnd(range.endDate);
    setError('');
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
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-black dark:text-zinc-50">Date range</h2>
        <div className="flex gap-1">
          {(['7d', '30d', '90d'] as PeriodPreset[]).map((p) => (
            <button
              key={p}
              onClick={() => handlePreset(p)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                activePreset === p
                  ? 'bg-black text-white dark:bg-zinc-50 dark:text-black'
                  : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800'
              }`}
            >
              {p === '7d' ? 'Last 7 days' : p === '30d' ? 'Last 30 days' : 'Last 90 days'}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-400">
          From
          <input
            type="date"
            value={localStart}
            onChange={(e) => handleCustomChange(e.target.value, localEnd)}
            className="rounded-lg border border-black/[.15] bg-transparent px-3 py-1.5 text-sm text-black focus:outline-none focus:ring-2 focus:ring-black/20 dark:border-white/[.2] dark:text-zinc-50 dark:focus:ring-white/20"
          />
        </label>
        <label className="flex items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-400">
          To
          <input
            type="date"
            value={localEnd}
            onChange={(e) => handleCustomChange(localStart, e.target.value)}
            className="rounded-lg border border-black/[.15] bg-transparent px-3 py-1.5 text-sm text-black focus:outline-none focus:ring-2 focus:ring-black/20 dark:border-white/[.2] dark:text-zinc-50 dark:focus:ring-white/20"
          />
        </label>
      </div>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        {formatDateRange(startDate, endDate)}
      </p>
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

function EventActivitySection({
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

function ActiveUsersSection({
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

function FeatureAdoptionSection({
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
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-medium text-black dark:text-zinc-50">Feature adoption</h2>
        <button
          onClick={() => setShowDefinition(!showDefinition)}
          className="rounded-full px-1.5 py-0.5 text-xs text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
          aria-label="Show feature adoption definition"
        >
          ?
        </button>
      </div>

      {showDefinition && data?.definition && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-800 dark:bg-blue-950">
          <p className="text-sm text-blue-700 dark:text-blue-300">{data.definition}</p>
        </div>
      )}

      {loading && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading feature adoption…</p>
      )}

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {!loading && !error && data && (
        <div className="flex flex-col gap-4">
          {data.features.length === 0 ? (
            <div className="rounded-lg border border-black/[.08] bg-zinc-50 px-4 py-3 dark:border-white/[.08] dark:bg-zinc-900">
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                No features mapped yet. Map events to features to see adoption rates.
              </p>
            </div>
          ) : data.totalActiveUsers === 0 ? (
            <div className="rounded-lg border border-black/[.08] bg-zinc-50 px-4 py-3 dark:border-white/[.08] dark:bg-zinc-900">
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                No active users in this period.
              </p>
            </div>
          ) : (
            <>
              <div className="rounded-lg border border-black/[.08] px-4 py-3 dark:border-white/[.08]">
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  {formatDateRange(data.startDate, data.endDate)} &middot;{' '}
                  {data.totalActiveUsers.toLocaleString()} active user
                  {data.totalActiveUsers === 1 ? '' : 's'}
                </p>
              </div>

              <div className="rounded-lg border border-black/[.08] dark:border-white/[.08]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-black/[.08] dark:border-white/[.08]">
                      <th className="px-4 py-2 text-left font-medium text-zinc-500 dark:text-zinc-400">
                        Feature
                      </th>
                      <th className="px-4 py-2 text-right font-medium text-zinc-500 dark:text-zinc-400">
                        Adoption
                      </th>
                      <th className="px-4 py-2 text-right font-medium text-zinc-500 dark:text-zinc-400">
                        Users
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.features.map((f) => (
                      <tr
                        key={f.featureId}
                        className="border-b border-black/[.04] last:border-0 dark:border-white/[.04]"
                      >
                        <td className="px-4 py-2.5 text-black dark:text-zinc-50">
                          {f.featureName}
                        </td>
                        <td className="px-4 py-2.5 text-right font-medium text-black dark:text-zinc-50">
                          {f.adoptionRate.toFixed(1)}%
                        </td>
                        <td className="px-4 py-2.5 text-right text-zinc-500 dark:text-zinc-400">
                          {f.featureUsers.toLocaleString()} / {f.totalUsers.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
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

function FeatureUsageTrendsSection({
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
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-medium text-black dark:text-zinc-50">Feature usage trends</h2>

      {featuresLoading ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading features…</p>
      ) : features.length === 0 ? (
        <div className="rounded-lg border border-black/[.08] bg-zinc-50 px-4 py-3 dark:border-white/[.08] dark:bg-zinc-900">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No active features. Create and map features to see usage trends.
          </p>
        </div>
      ) : (
        <>
          <select
            value={selectedFeatureId}
            onChange={(e) => setSelectedFeatureId(e.target.value)}
            className="rounded-lg border border-black/[.15] bg-transparent px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-black/20 dark:border-white/[.2] dark:text-zinc-50 dark:focus:ring-white/20"
          >
            {features.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>

          {loading && (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading usage trends…</p>
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
                  event{data.total === 1 ? '' : 's'} for {data.featureName}
                </p>
              </div>

              {data.total === 0 ? (
                <div className="rounded-lg border border-black/[.08] bg-zinc-50 px-4 py-3 dark:border-white/[.08] dark:bg-zinc-900">
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    No events recorded for this feature in the selected period.
                  </p>
                </div>
              ) : (
                <div className="rounded-lg border border-black/[.08] px-4 py-3 dark:border-white/[.08]">
                  <p className="mb-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                    Daily breakdown
                  </p>
                  <div className="flex items-end gap-px" style={{ height: '80px' }}>
                    {data.daily.map((d) => (
                      <div
                        key={d.date}
                        className="group relative flex-1"
                        style={{ height: '100%' }}
                      >
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
        </>
      )}
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

function FeatureUsageComparisonSection({
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-medium text-black dark:text-zinc-50">
          Feature usage comparison
        </h2>
        <button
          onClick={() => setShowMetric(!showMetric)}
          className="rounded-full px-1.5 py-0.5 text-xs text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
          aria-label="Show metric definition"
        >
          ?
        </button>
      </div>

      {showMetric && data?.metric && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-800 dark:bg-blue-950">
          <p className="text-sm text-blue-700 dark:text-blue-300">{data.metric}</p>
        </div>
      )}

      {loading && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Loading feature usage comparison…
        </p>
      )}

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {!loading && !error && data && (
        <div className="flex flex-col gap-4">
          {data.features.length === 0 ? (
            <div className="rounded-lg border border-black/[.08] bg-zinc-50 px-4 py-3 dark:border-white/[.08] dark:bg-zinc-900">
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                No active features. Create and map features to compare usage.
              </p>
            </div>
          ) : (
            <>
              <div className="rounded-lg border border-black/[.08] px-4 py-3 dark:border-white/[.08]">
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  {formatDateRange(data.startDate, data.endDate)} &middot; Ranked by total events
                </p>
              </div>

              <div className="rounded-lg border border-black/[.08] dark:border-white/[.08]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-black/[.08] dark:border-white/[.08]">
                      <th className="px-4 py-2 text-left font-medium text-zinc-500 dark:text-zinc-400">
                        #
                      </th>
                      <th className="px-4 py-2 text-left font-medium text-zinc-500 dark:text-zinc-400">
                        Feature
                      </th>
                      <th className="w-1/3 px-4 py-2 text-left font-medium text-zinc-500 dark:text-zinc-400">
                        Usage
                      </th>
                      <th className="px-4 py-2 text-right font-medium text-zinc-500 dark:text-zinc-400">
                        Events
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.features.map((f, i) => (
                      <tr
                        key={f.featureId}
                        className="border-b border-black/[.04] last:border-0 dark:border-white/[.04]"
                      >
                        <td className="px-4 py-2.5 text-zinc-400 dark:text-zinc-500">{i + 1}</td>
                        <td className="px-4 py-2.5 text-black dark:text-zinc-50">
                          {f.featureName}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="h-2 w-full rounded-full bg-zinc-100 dark:bg-zinc-800">
                            {f.totalEvents > 0 && (
                              <div
                                className="h-2 rounded-full bg-black/80 dark:bg-zinc-300"
                                style={{
                                  width: `${(f.totalEvents / maxEvents) * 100}%`,
                                  minWidth: '4px',
                                }}
                              />
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-right font-medium text-black dark:text-zinc-50">
                          {f.totalEvents.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
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

function EventCollectionStatus({ orgId, projectId }: { orgId: string; projectId: string }) {
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

type FeatureInfo = {
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
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 px-4 py-3">
      <input
        type="text"
        required
        placeholder="Feature name"
        value={editName}
        onChange={(e) => setEditName(e.target.value)}
        disabled={submitting}
        className="rounded-lg border border-black/[.15] bg-transparent px-3 py-2 text-sm text-black placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-black/20 disabled:opacity-50 dark:border-white/[.2] dark:text-zinc-50 dark:placeholder:text-zinc-500 dark:focus:ring-white/20"
      />
      <input
        type="text"
        placeholder="Description (optional)"
        value={editDesc}
        onChange={(e) => setEditDesc(e.target.value)}
        disabled={submitting}
        className="rounded-lg border border-black/[.15] bg-transparent px-3 py-2 text-sm text-black placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-black/20 disabled:opacity-50 dark:border-white/[.2] dark:text-zinc-50 dark:placeholder:text-zinc-500 dark:focus:ring-white/20"
      />
      <div className="flex gap-2 self-end">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="rounded-lg border border-black/[.15] px-3 py-1.5 text-sm font-medium text-black transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-white/[.2] dark:text-zinc-50 dark:hover:bg-zinc-900"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-black px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-50 dark:text-black dark:hover:bg-zinc-200"
        >
          {submitting ? 'Saving…' : 'Save'}
        </button>
      </div>
      {editError && <p className="text-sm text-red-600 dark:text-red-400">{editError}</p>}
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
    return <p className="px-4 py-2 text-xs text-zinc-500 dark:text-zinc-400">Loading mappings…</p>;
  }

  return (
    <div className="flex flex-col gap-2 border-t border-black/[.06] px-4 py-3 dark:border-white/[.06]">
      <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Event mappings</span>

      {mappings.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {mappings.map((m) => (
            <span
              key={m.id}
              className="inline-flex items-center gap-1 rounded-md bg-zinc-100 px-2 py-1 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
            >
              <code className="font-mono">{m.eventName}</code>
              <button
                onClick={() => handleRemove(m.id)}
                disabled={removingId === m.id}
                className="ml-0.5 text-zinc-400 transition-colors hover:text-red-500 disabled:opacity-50 dark:text-zinc-500 dark:hover:text-red-400"
                aria-label={`Remove ${m.eventName}`}
              >
                &times;
              </button>
            </span>
          ))}
        </div>
      )}

      {mappings.length === 0 && (
        <p className="text-xs text-zinc-400 dark:text-zinc-500">No events mapped yet.</p>
      )}

      <form onSubmit={handleAdd} className="flex gap-1.5">
        <input
          type="text"
          placeholder="Event name (e.g. button_click)"
          value={newEventName}
          onChange={(e) => setNewEventName(e.target.value)}
          disabled={adding}
          className="flex-1 rounded-md border border-black/[.1] bg-transparent px-2 py-1 text-xs text-black placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-black/20 disabled:opacity-50 dark:border-white/[.15] dark:text-zinc-50 dark:placeholder:text-zinc-500 dark:focus:ring-white/20"
        />
        <button
          type="submit"
          disabled={adding || !newEventName.trim()}
          className="shrink-0 rounded-md bg-black px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-50 dark:text-black dark:hover:bg-zinc-200"
        >
          {adding ? 'Adding…' : 'Add'}
        </button>
      </form>

      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}

type UnmappedEvent = {
  eventName: string;
  eventCount: number;
  lastSeenAt: string;
};

function UnmappedEventsSection({
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
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-medium text-black dark:text-zinc-50">Unmapped events</h2>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {loading ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading unmapped events…</p>
      ) : events.length === 0 ? (
        <div className="rounded-lg border border-black/[.08] bg-zinc-50 px-4 py-3 dark:border-white/[.08] dark:bg-zinc-900">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            All collected events are mapped to features, or no events have been collected yet.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-black/[.08] rounded-lg border border-black/[.08] dark:divide-white/[.08] dark:border-white/[.08]">
          {events.map((evt) => (
            <div key={evt.eventName} className="flex flex-col">
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex flex-col gap-0.5">
                  <code className="text-sm font-medium font-mono text-black dark:text-zinc-50">
                    {evt.eventName}
                  </code>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    {evt.eventCount.toLocaleString()} event{evt.eventCount === 1 ? '' : 's'} · Last
                    seen {formatRelativeTime(evt.lastSeenAt)}
                  </span>
                </div>
                <div>
                  {mappingEvent === evt.eventName ? (
                    <div className="flex items-center gap-2">
                      <select
                        value={selectedFeature}
                        onChange={(e) => setSelectedFeature(e.target.value)}
                        disabled={submitting}
                        className="rounded-md border border-black/[.15] bg-transparent px-2 py-1 text-xs text-black focus:outline-none focus:ring-1 focus:ring-black/20 disabled:opacity-50 dark:border-white/[.2] dark:text-zinc-50 dark:focus:ring-white/20"
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
                        className="shrink-0 rounded-md bg-black px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-50 dark:text-black dark:hover:bg-zinc-200"
                      >
                        {submitting ? 'Mapping…' : 'Confirm'}
                      </button>
                      <button
                        onClick={() => {
                          setMappingEvent(null);
                          setSelectedFeature('');
                        }}
                        disabled={submitting}
                        className="rounded-md px-2 py-1 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-zinc-800"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setMappingEvent(evt.eventName)}
                      className="rounded-md px-2.5 py-1 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
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
  );
}

function FeaturesSection({
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

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-medium text-black dark:text-zinc-50">Features</h2>

      <form onSubmit={handleCreate} className="flex flex-col gap-2">
        <div className="flex gap-2">
          <input
            type="text"
            required
            placeholder="Feature name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={creating}
            className="flex-1 rounded-lg border border-black/[.15] bg-transparent px-3 py-2 text-sm text-black placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-black/20 disabled:opacity-50 dark:border-white/[.2] dark:text-zinc-50 dark:placeholder:text-zinc-500 dark:focus:ring-white/20"
          />
          <button
            type="submit"
            disabled={creating}
            className="shrink-0 rounded-lg bg-black px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-50 dark:text-black dark:hover:bg-zinc-200"
          >
            {creating ? 'Creating…' : 'Create'}
          </button>
        </div>
        <input
          type="text"
          placeholder="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={creating}
          className="rounded-lg border border-black/[.15] bg-transparent px-3 py-2 text-sm text-black placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-black/20 disabled:opacity-50 dark:border-white/[.2] dark:text-zinc-50 dark:placeholder:text-zinc-500 dark:focus:ring-white/20"
        />
      </form>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {loading ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading features…</p>
      ) : features.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No features yet. Create one to start organizing your product analytics.
        </p>
      ) : (
        <div className="divide-y divide-black/[.08] rounded-lg border border-black/[.08] dark:divide-white/[.08] dark:border-white/[.08]">
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
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-black dark:text-zinc-50">
                        {feat.name}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          feat.status === 'ARCHIVED'
                            ? 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                            : 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                        }`}
                      >
                        {feat.status}
                      </span>
                      {feat.mappingCount > 0 && (
                        <span className="text-xs text-zinc-400 dark:text-zinc-500">
                          {feat.mappingCount} event{feat.mappingCount === 1 ? '' : 's'} mapped
                        </span>
                      )}
                    </div>
                    {feat.description && (
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">
                        {feat.description}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      Created {new Date(feat.createdAt).toLocaleDateString()}
                    </span>
                    <button
                      onClick={() => setExpandedId(expandedId === feat.id ? null : feat.id)}
                      className="rounded px-2 py-1 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                    >
                      {expandedId === feat.id ? 'Hide events' : 'Events'}
                    </button>
                    <button
                      onClick={() => setEditingId(feat.id)}
                      className="rounded px-2 py-1 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleArchiveToggle(feat)}
                      disabled={archivingId === feat.id}
                      className={`rounded px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                        feat.status === 'ARCHIVED'
                          ? 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800'
                          : 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950'
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
                      // Reload features to get updated counts
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
  );
}

function ProjectDetail() {
  const { id: orgId, projectId } = useParams<{ id: string; projectId: string }>();
  const router = useRouter();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [editing, setEditing] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [projectFeatures, setProjectFeatures] = useState<FeatureInfo[]>([]);
  const [unmappedKey, setUnmappedKey] = useState(0);
  const [dateRange, setDateRange] = useState(() => getDateRange('7d'));

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`${API_URL}/organizations/${orgId}/projects/${projectId}`, {
          credentials: 'include',
        });

        if (cancelled) return;

        if (res.status === 401) {
          router.replace('/login');
          return;
        }
        if (res.status === 404) {
          setState({ status: 'not-found' });
          return;
        }
        if (!res.ok) {
          setState({ status: 'error' });
          return;
        }

        const project = (await res.json()) as ProjectInfo;
        setState({ status: 'ready', project });
      } catch {
        if (!cancelled) {
          setState({ status: 'error' });
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [orgId, projectId, router]);

  async function handleArchiveToggle() {
    if (state.status !== 'ready') return;
    const { project } = state;
    const isArchiving = project.status === 'ACTIVE';

    if (
      isArchiving &&
      !confirm(
        'Are you sure you want to archive this project? Archived projects will not accept new events.',
      )
    ) {
      return;
    }

    setArchiving(true);
    try {
      const res = await fetch(`${API_URL}/organizations/${orgId}/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: isArchiving ? 'ARCHIVED' : 'ACTIVE' }),
      });

      if (res.ok) {
        const updated = (await res.json()) as ProjectInfo;
        setState({ status: 'ready', project: updated });
      }
    } catch {
      // Ignore
    } finally {
      setArchiving(false);
    }
  }

  if (state.status === 'loading') {
    return <p className="text-zinc-600 dark:text-zinc-400">Loading project…</p>;
  }

  if (state.status === 'not-found') {
    return (
      <main className="flex w-full max-w-md flex-col gap-4 rounded-2xl bg-white p-10 text-center shadow-sm dark:bg-zinc-950">
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">Project not found</h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          This project does not exist or you don&apos;t have access to it.
        </p>
        <Link
          href={`/organizations/${orgId}`}
          className="mt-2 text-sm font-medium text-zinc-700 underline underline-offset-4 hover:text-black dark:text-zinc-300 dark:hover:text-zinc-50"
        >
          Back to organization
        </Link>
      </main>
    );
  }

  if (state.status === 'error') {
    return (
      <main className="flex w-full max-w-md flex-col gap-4 rounded-2xl bg-white p-10 text-center shadow-sm dark:bg-zinc-950">
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
          Something went wrong
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          We couldn&apos;t load this project. Please try again.
        </p>
        <Link
          href={`/organizations/${orgId}`}
          className="mt-2 text-sm font-medium text-zinc-700 underline underline-offset-4 hover:text-black dark:text-zinc-300 dark:hover:text-zinc-50"
        >
          Back to organization
        </Link>
      </main>
    );
  }

  const { project } = state;
  const isArchived = project.status === 'ARCHIVED';

  return (
    <main className="flex w-full max-w-2xl flex-col gap-6 rounded-2xl bg-white p-10 shadow-sm dark:bg-zinc-950">
      <div className="flex items-center gap-3">
        <Link
          href={`/organizations/${orgId}`}
          className="text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          aria-label="Back to organization"
        >
          &larr;
        </Link>
        <div className="flex flex-1 items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">{project.name}</h1>
            {project.description && (
              <span className="text-sm text-zinc-500 dark:text-zinc-400">
                {project.description}
              </span>
            )}
          </div>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
              isArchived
                ? 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                : 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
            }`}
          >
            {project.status}
          </span>
        </div>
      </div>

      <hr className="border-black/[.08] dark:border-white/[.145]" />

      {editing ? (
        <EditProjectForm
          project={project}
          orgId={orgId}
          onUpdated={(updated) => {
            setState({ status: 'ready', project: updated });
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <div className="flex gap-2">
          <button
            onClick={() => setEditing(true)}
            className="rounded-lg border border-black/[.15] px-3 py-1.5 text-sm font-medium text-black transition-colors hover:bg-zinc-50 dark:border-white/[.2] dark:text-zinc-50 dark:hover:bg-zinc-900"
          >
            Edit
          </button>
          <button
            onClick={handleArchiveToggle}
            disabled={archiving}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 ${
              isArchived
                ? 'border border-black/[.15] text-black hover:bg-zinc-50 dark:border-white/[.2] dark:text-zinc-50 dark:hover:bg-zinc-900'
                : 'border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950'
            }`}
          >
            {archiving
              ? isArchived
                ? 'Restoring…'
                : 'Archiving…'
              : isArchived
                ? 'Restore'
                : 'Archive'}
          </button>
        </div>
      )}

      <hr className="border-black/[.08] dark:border-white/[.145]" />

      <TrackingCredentials orgId={orgId} projectId={project.id} />

      <hr className="border-black/[.08] dark:border-white/[.145]" />

      <EventCollectionStatus orgId={orgId} projectId={project.id} />

      <hr className="border-black/[.08] dark:border-white/[.145]" />

      <DateRangeControl
        startDate={dateRange.startDate}
        endDate={dateRange.endDate}
        onChange={(startDate, endDate) => setDateRange({ startDate, endDate })}
      />

      <hr className="border-black/[.08] dark:border-white/[.145]" />

      <EventActivitySection
        orgId={orgId}
        projectId={project.id}
        startDate={dateRange.startDate}
        endDate={dateRange.endDate}
      />

      <hr className="border-black/[.08] dark:border-white/[.145]" />

      <ActiveUsersSection
        orgId={orgId}
        projectId={project.id}
        startDate={dateRange.startDate}
        endDate={dateRange.endDate}
      />

      <hr className="border-black/[.08] dark:border-white/[.145]" />

      <FeatureAdoptionSection
        orgId={orgId}
        projectId={project.id}
        startDate={dateRange.startDate}
        endDate={dateRange.endDate}
      />

      <hr className="border-black/[.08] dark:border-white/[.145]" />

      <FeatureUsageTrendsSection
        orgId={orgId}
        projectId={project.id}
        startDate={dateRange.startDate}
        endDate={dateRange.endDate}
      />

      <hr className="border-black/[.08] dark:border-white/[.145]" />

      <FeatureUsageComparisonSection
        orgId={orgId}
        projectId={project.id}
        startDate={dateRange.startDate}
        endDate={dateRange.endDate}
      />

      <hr className="border-black/[.08] dark:border-white/[.145]" />

      <FeaturesSection orgId={orgId} projectId={project.id} onFeaturesLoaded={setProjectFeatures} />

      <hr className="border-black/[.08] dark:border-white/[.145]" />

      <UnmappedEventsSection
        key={unmappedKey}
        orgId={orgId}
        projectId={project.id}
        features={projectFeatures}
        onMapped={() => {
          setUnmappedKey((k) => k + 1);
          fetch(`${API_URL}/organizations/${orgId}/projects/${project.id}/features`, {
            credentials: 'include',
          })
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
              if (data) setProjectFeatures(data);
            })
            .catch(() => {});
        }}
      />

      <p className="text-sm text-zinc-500 dark:text-zinc-500">
        Created {new Date(project.createdAt).toLocaleDateString()}
      </p>
    </main>
  );
}

export default function ProjectPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <Suspense fallback={<p className="text-zinc-600 dark:text-zinc-400">Loading project…</p>}>
        <ProjectDetail />
      </Suspense>
    </div>
  );
}
