'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface RecommendationSummary {
  id: string;
  title: string;
  status: string;
  priorityScore: number | null;
}

interface AnalysisRunDetail {
  id: string;
  projectId: string;
  organizationId: string;
  requestedById: string;
  status: string;
  periodStart: string;
  periodEnd: string;
  eventCount: number | null;
  statusMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  recommendationCount: number;
  recommendations: RecommendationSummary[];
}

function statusBadge(status: string) {
  const styles: Record<string, string> = {
    QUEUED: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
    RUNNING: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
    COMPLETED: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
    FAILED: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
    INSUFFICIENT_DATA: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
  };
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${styles[status] ?? 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'}`}
    >
      {status.replace('_', ' ')}
    </span>
  );
}

function recStatusBadge(status: string) {
  const styles: Record<string, string> = {
    PUBLISHED: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
    ACCEPTED: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
    REJECTED: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
    DEFERRED: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
    SUPERSEDED: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
  };
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-medium ${styles[status] ?? 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'}`}
    >
      {status}
    </span>
  );
}

function AnalysisRunDetailContent() {
  const {
    id: orgId,
    projectId,
    runId,
  } = useParams<{ id: string; projectId: string; runId: string }>();
  const router = useRouter();
  const [run, setRun] = useState<AnalysisRunDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(
          `${API_URL}/organizations/${orgId}/projects/${projectId}/analysis-runs/${runId}`,
          { credentials: 'include' },
        );
        if (cancelled) return;
        if (res.status === 401) {
          router.push('/login');
          return;
        }
        if (res.status === 404) {
          setError('Analysis run not found.');
          setLoading(false);
          return;
        }
        if (!res.ok) {
          setError('Failed to load analysis run.');
          setLoading(false);
          return;
        }
        const data: AnalysisRunDetail = await res.json();
        setRun(data);
      } catch {
        if (!cancelled) setError('Network error.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [orgId, projectId, runId, router]);

  if (loading) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>;
  }

  if (error) {
    return (
      <div>
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        <Link
          href={`/organizations/${orgId}/projects/${projectId}`}
          className="mt-2 inline-block text-sm text-blue-600 hover:underline dark:text-blue-400"
        >
          Back to project
        </Link>
      </div>
    );
  }

  if (!run) return null;

  const isFailed = run.status === 'FAILED';
  const isInsufficientData = run.status === 'INSUFFICIENT_DATA';

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Link
          href={`/organizations/${orgId}/projects/${projectId}`}
          className="text-sm text-blue-600 hover:underline dark:text-blue-400"
        >
          ← Back to project
        </Link>
      </div>

      <div>
        <h1 className="text-xl font-semibold">Analysis Run</h1>
        <p className="mt-1 font-mono text-sm text-zinc-500 dark:text-zinc-400">{run.id}</p>
      </div>

      <div className="rounded-lg border border-black/[.08] p-4 dark:border-white/[.08]">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium uppercase text-zinc-400 dark:text-zinc-500">Status</p>
            <div className="mt-1">{statusBadge(run.status)}</div>
          </div>
          <div>
            <p className="text-xs font-medium uppercase text-zinc-400 dark:text-zinc-500">
              Analysis period
            </p>
            <p className="mt-1 text-sm">
              {new Date(run.periodStart).toLocaleDateString()} –{' '}
              {new Date(run.periodEnd).toLocaleDateString()}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase text-zinc-400 dark:text-zinc-500">
              Created
            </p>
            <p className="mt-1 text-sm">{new Date(run.createdAt).toLocaleString()}</p>
          </div>
          {run.startedAt && (
            <div>
              <p className="text-xs font-medium uppercase text-zinc-400 dark:text-zinc-500">
                Started
              </p>
              <p className="mt-1 text-sm">{new Date(run.startedAt).toLocaleString()}</p>
            </div>
          )}
          {run.completedAt && (
            <div>
              <p className="text-xs font-medium uppercase text-zinc-400 dark:text-zinc-500">
                Completed
              </p>
              <p className="mt-1 text-sm">{new Date(run.completedAt).toLocaleString()}</p>
            </div>
          )}
          {run.eventCount != null && (
            <div>
              <p className="text-xs font-medium uppercase text-zinc-400 dark:text-zinc-500">
                Events analyzed
              </p>
              <p className="mt-1 text-sm">{run.eventCount.toLocaleString()}</p>
            </div>
          )}
          <div>
            <p className="text-xs font-medium uppercase text-zinc-400 dark:text-zinc-500">
              Recommendations
            </p>
            <p className="mt-1 text-sm">{run.recommendationCount}</p>
          </div>
        </div>
      </div>

      {run.statusMessage && (
        <div
          className={`rounded-lg border p-4 ${
            isFailed
              ? 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950'
              : isInsufficientData
                ? 'border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950'
                : 'border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900'
          }`}
        >
          <p className="text-xs font-medium uppercase text-zinc-400 dark:text-zinc-500">
            {isFailed ? 'Failure details' : 'Status details'}
          </p>
          <p className={`mt-1 text-sm ${isFailed ? 'text-red-700 dark:text-red-300' : ''}`}>
            {run.statusMessage}
          </p>
        </div>
      )}

      {run.recommendations.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-semibold">Linked recommendations</h2>
          <div className="flex flex-col gap-2">
            {run.recommendations.map((rec) => (
              <Link
                key={rec.id}
                href={`/organizations/${orgId}/projects/${projectId}`}
                className="flex items-center justify-between rounded-lg border border-black/[.08] px-4 py-3 transition-colors hover:bg-zinc-50 dark:border-white/[.08] dark:hover:bg-zinc-900"
              >
                <div className="flex items-center gap-2">
                  {recStatusBadge(rec.status)}
                  <span className="text-sm">{rec.title}</span>
                </div>
                <span className="text-xs text-zinc-400 dark:text-zinc-500">
                  Priority: {rec.priorityScore ?? '—'}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {run.recommendations.length === 0 && run.status === 'COMPLETED' && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No recommendations were generated from this analysis run.
        </p>
      )}
    </div>
  );
}

export default function AnalysisRunDetailPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <Suspense fallback={<p className="text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>}>
        <AnalysisRunDetailContent />
      </Suspense>
    </main>
  );
}
