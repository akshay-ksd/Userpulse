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

function ProjectDetail() {
  const { id: orgId, projectId } = useParams<{ id: string; projectId: string }>();
  const router = useRouter();
  const [state, setState] = useState<State>({ status: 'loading' });

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
          <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900 dark:text-green-300">
            {project.status}
          </span>
        </div>
      </div>

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
