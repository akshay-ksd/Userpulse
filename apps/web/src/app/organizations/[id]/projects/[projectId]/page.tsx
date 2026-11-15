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
      const res = await fetch(
        `${API_URL}/organizations/${orgId}/projects/${project.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            name,
            description: description || null,
          }),
        },
      );

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

    if (isArchiving && !confirm('Are you sure you want to archive this project? Archived projects will not accept new events.')) {
      return;
    }

    setArchiving(true);
    try {
      const res = await fetch(
        `${API_URL}/organizations/${orgId}/projects/${project.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ status: isArchiving ? 'ARCHIVED' : 'ACTIVE' }),
        },
      );

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

      <div className="rounded-xl border border-dashed border-black/[.15] p-6 text-center dark:border-white/[.2]">
        <p className="text-zinc-600 dark:text-zinc-400">
          Tracking credentials and analytics will appear here.
        </p>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-500">
          Created {new Date(project.createdAt).toLocaleDateString()}
        </p>
      </div>
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
