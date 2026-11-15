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

function FeaturesSection({ orgId, projectId }: { orgId: string; projectId: string }) {
  const [features, setFeatures] = useState<FeatureInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [archivingId, setArchivingId] = useState<string | null>(null);

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
          setFeatures(await res.json());
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
  }, [orgId, projectId]);

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
              <div key={feat.id} className="flex items-center justify-between px-4 py-3">
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

      <FeaturesSection orgId={orgId} projectId={project.id} />

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
