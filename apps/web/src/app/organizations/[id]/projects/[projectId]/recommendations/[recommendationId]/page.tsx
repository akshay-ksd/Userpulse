'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

type RecommendationDetail = {
  id: string;
  analysisRunId: string;
  projectId: string;
  organizationId: string;
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
  supersededById: string | null;
  createdAt: string;
};

type State =
  | { status: 'loading' }
  | { status: 'not-found' }
  | { status: 'error' }
  | { status: 'ready'; rec: RecommendationDetail };

const categoryConfig: Record<string, { bg: string; icon: string }> = {
  adoption: { bg: 'bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400', icon: '🚀' },
  engagement: { bg: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', icon: '💡' },
  retention: { bg: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', icon: '🔄' },
  ux: { bg: 'bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400', icon: '✨' },
  general: { bg: 'bg-gray-100 text-gray-600 dark:bg-zinc-800 dark:text-zinc-400', icon: '📋' },
};

const statusConfig: Record<string, { bg: string; label: string }> = {
  PUBLISHED: { bg: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', label: 'Published' },
  ACCEPTED: { bg: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', label: 'Accepted' },
  REJECTED: { bg: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400', label: 'Rejected' },
  DEFERRED: { bg: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', label: 'Deferred' },
};

const metricDefinitions: Record<string, string> = {
  adoptionRate: 'Percentage of active users who triggered at least one event mapped to this feature.',
  featureUsers: 'Number of distinct users who triggered events mapped to this feature in the period.',
  totalUsers: 'Total distinct users (by userId or anonymousId) active in the project during the period.',
  activeUsers: 'Distinct users who triggered any event in the project during the period.',
  currentCount: 'Total event count for this event name in the analysis period.',
  baselineCount: 'Total event count for this event name in the equivalent preceding period.',
  percentChange: 'Percentage change from baseline to current period.',
  totalEvents: 'Total events triggered for this feature during the analysis period.',
  classification: 'Relative usage level (high/low/normal) compared to other features in the same project.',
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
    <div className="flex flex-col">
      <div className="flex items-center justify-between gap-4 py-2">
        <span className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-zinc-400">
          {label}
          {definition && (
            <button
              type="button"
              onClick={() => setShowDef(!showDef)}
              className="flex h-4 w-4 items-center justify-center rounded-full bg-gray-200 text-[9px] font-bold text-gray-500 transition-colors hover:bg-gray-300 dark:bg-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-600"
              aria-label={`Define ${label}`}
            >
              ?
            </button>
          )}
        </span>
        <span className="text-sm font-semibold tabular-nums text-gray-900 dark:text-zinc-100">
          {typeof value === 'number' ? value.toLocaleString() : value}
        </span>
      </div>
      {showDef && definition && (
        <p className="mb-1 rounded-lg bg-blue-50 px-3 py-1.5 text-xs text-blue-700 dark:bg-blue-900/20 dark:text-blue-400">
          {definition}
        </p>
      )}
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
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 dark:bg-zinc-800">
          <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m5.231 13.481L15 17.25m-4.5-15H5.625c-.621 0-1.125.504-1.125 1.125v16.5c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9zm3.75 11.625a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
          </svg>
        </div>
        <p className="text-sm text-gray-500 dark:text-zinc-400">No supporting evidence available.</p>
      </div>
    );
  }

  const evidenceType = evidence.type as string | undefined;
  const period = evidence.period as { start?: string; end?: string } | undefined;
  const displayStart = period?.start ?? periodStart;
  const displayEnd = period?.end ?? periodEnd;

  let title = 'Supporting data';
  let rows: { label: string; value: string | number; key?: string }[] = [];

  if (evidenceType === 'feature_adoption') {
    title = `Feature adoption — ${(evidence.featureName as string) ?? 'Unknown feature'}`;
    rows = [
      { label: 'Adoption rate', value: `${evidence.adoptionRate}%`, key: 'adoptionRate' },
      { label: 'Feature users', value: evidence.featureUsers as number, key: 'featureUsers' },
      { label: 'Total active users', value: evidence.totalUsers as number, key: 'totalUsers' },
      { label: 'Project active users', value: evidence.activeUsers as number, key: 'activeUsers' },
    ];
  } else if (evidenceType === 'activity_change') {
    title = `Activity change — ${evidence.eventName as string}`;
    rows = [
      { label: 'Current period count', value: evidence.currentCount as number, key: 'currentCount' },
      { label: 'Baseline period count', value: evidence.baselineCount as number, key: 'baselineCount' },
      { label: 'Direction', value: evidence.direction as string },
      { label: 'Change', value: `${(evidence.percentChange as number) > 0 ? '+' : ''}${evidence.percentChange}%`, key: 'percentChange' },
    ];
  } else if (evidenceType === 'feature_usage') {
    title = `Feature usage — ${(evidence.featureName as string) ?? 'Unknown feature'}`;
    rows = [
      { label: 'Total events', value: evidence.totalEvents as number, key: 'totalEvents' },
      { label: 'Classification', value: evidence.classification as string, key: 'classification' },
    ];
  } else {
    rows = Object.entries(evidence)
      .filter(([k]) => k !== 'type' && k !== 'period')
      .map(([key, val]) => ({
        label: key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase()),
        value: typeof val === 'object' ? JSON.stringify(val) : String(val),
      }));
  }

  return (
    <div>
      <p className="mb-3 text-sm font-medium text-gray-900 dark:text-zinc-100">{title}</p>
      <div className="divide-y divide-gray-100 dark:divide-zinc-800">
        {rows.map((row) => (
          <EvidenceMetricRow key={row.label} label={row.label} value={row.value} definitionKey={row.key} />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-3 border-t border-gray-100 pt-3 dark:border-zinc-800">
        <span className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-zinc-400">
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
          </svg>
          {new Date(displayStart).toLocaleDateString()} – {new Date(displayEnd).toLocaleDateString()}
        </span>
        <span className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-zinc-400">
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3" />
          </svg>
          Run {analysisRunId.slice(0, 8)}…
        </span>
      </div>
    </div>
  );
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  const pct = Math.round(value * 100);
  const color =
    value > 0.6 ? 'bg-emerald-500' : value >= 0.3 ? 'bg-amber-500' : 'bg-gray-400';
  const textColor =
    value > 0.6
      ? 'text-emerald-700 dark:text-emerald-400'
      : value >= 0.3
        ? 'text-amber-700 dark:text-amber-400'
        : 'text-gray-500 dark:text-zinc-400';
  return (
    <div className="flex-1">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-xs text-gray-500 dark:text-zinc-400">{label}</span>
        <span className={`text-sm font-semibold tabular-nums ${textColor}`}>{value.toFixed(2)}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-zinc-800">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function RecommendationDetailContent() {
  const params = useParams();
  const router = useRouter();
  const orgId = params.id as string;
  const projectId = params.projectId as string;
  const recommendationId = params.recommendationId as string;
  const [state, setState] = useState<State>({ status: 'loading' });
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showDeferForm, setShowDeferForm] = useState(false);
  const [deferReason, setDeferReason] = useState('');

  async function handleStatusChange(newStatus: string, reason?: string) {
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch(
        `${API_URL}/organizations/${orgId}/projects/${projectId}/recommendations/${recommendationId}/status`,
        {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus, ...(reason ? { reason } : {}) }),
        },
      );
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        setActionError((data.message as string) ?? 'Failed to update status.');
        return;
      }
      const updated = (await res.json()) as RecommendationDetail;
      setState({ status: 'ready', rec: updated });
      setShowRejectForm(false);
      setRejectReason('');
      setShowDeferForm(false);
      setDeferReason('');
    } catch {
      setActionError('Network error. Please try again.');
    } finally {
      setActionLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(
          `${API_URL}/organizations/${orgId}/projects/${projectId}/recommendations/${recommendationId}`,
          { credentials: 'include' },
        );
        if (cancelled) return;
        if (res.status === 401) {
          router.push('/login');
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
        const rec = (await res.json()) as RecommendationDetail;
        setState({ status: 'ready', rec });
      } catch {
        if (!cancelled) setState({ status: 'error' });
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [orgId, projectId, recommendationId, router]);

  if (state.status === 'loading') {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-fuchsia-600" />
          <p className="text-sm text-gray-500 dark:text-zinc-400">Loading recommendation…</p>
        </div>
      </div>
    );
  }

  if (state.status === 'not-found' || state.status === 'error') {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-50 dark:bg-red-900/30">
          <svg className="h-7 w-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
        </div>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-zinc-50">
          {state.status === 'not-found' ? 'Recommendation not found' : 'Something went wrong'}
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-zinc-400">
          {state.status === 'not-found' ? 'This recommendation may have been removed.' : 'Please try again.'}
        </p>
        <Link
          href={`/organizations/${orgId}/projects/${projectId}/ai-analysis`}
          className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-fuchsia-600 hover:text-fuchsia-700 dark:text-fuchsia-400"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
          Back to AI Analysis
        </Link>
      </div>
    );
  }

  const { rec } = state;
  const catCfg = categoryConfig[rec.category] ?? categoryConfig.general;
  const stCfg = statusConfig[rec.status] ?? statusConfig.PUBLISHED;

  return (
    <div className="flex flex-col gap-6">
      {/* Back link */}
      <Link
        href={`/organizations/${orgId}/projects/${projectId}/ai-analysis`}
        className="inline-flex items-center gap-1 self-start text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-zinc-400 dark:hover:text-zinc-200"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
        </svg>
        AI Analysis
      </Link>

      {/* Header card */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="border-b border-gray-100 bg-gradient-to-r from-fuchsia-50 to-purple-50 px-6 py-5 dark:border-zinc-800 dark:from-fuchsia-950/30 dark:to-purple-950/30">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${catCfg.bg}`}>
              {catCfg.icon} {rec.category}
            </span>
            <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${stCfg.bg}`}>
              {stCfg.label}
            </span>
            {rec.affectedArea && (
              <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 dark:bg-zinc-800 dark:text-zinc-400">
                {rec.affectedArea}
              </span>
            )}
          </div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-zinc-50">{rec.title}</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-zinc-400">
            Created {new Date(rec.createdAt).toLocaleDateString()}
          </p>
        </div>

        <div className="px-6 py-5">
          <p className="text-sm leading-relaxed text-gray-700 dark:text-zinc-300">{rec.summary}</p>
        </div>
      </div>

      {/* Priority score card */}
      {rec.priorityScore != null && (
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="border-b border-gray-100 px-6 py-4 dark:border-zinc-800">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                </svg>
              </div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-zinc-50">Priority Score</h2>
            </div>
          </div>
          <div className="px-6 py-5">
            <div className="mb-5 flex items-center gap-3">
              <span className="text-3xl font-bold tabular-nums text-gray-900 dark:text-zinc-50">
                {rec.priorityScore.toFixed(2)}
              </span>
              <span className="text-sm text-gray-500 dark:text-zinc-400">/ 1.00</span>
            </div>
            <div className="flex gap-6">
              {rec.reach != null && <ScoreBar label="Reach" value={rec.reach} />}
              {rec.impact != null && <ScoreBar label="Impact" value={rec.impact} />}
              {rec.confidence != null && <ScoreBar label="Confidence" value={rec.confidence} />}
            </div>
            <p className="mt-4 text-xs text-gray-400 dark:text-zinc-500">
              Priority Score = Reach × Impact × Confidence. A relative ranking aid, not a guarantee of outcomes.
            </p>
          </div>
        </div>
      )}

      {/* Evidence card */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="border-b border-gray-100 px-6 py-4 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m5.231 13.481L15 17.25m-4.5-15H5.625c-.621 0-1.125.504-1.125 1.125v16.5c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9zm3.75 11.625a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
              </svg>
            </div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-zinc-50">Evidence</h2>
          </div>
        </div>
        <div className="px-6 py-5">
          <EvidenceDisplay
            evidence={rec.evidence}
            periodStart={rec.periodStart}
            periodEnd={rec.periodEnd}
            analysisRunId={rec.analysisRunId}
          />
        </div>
      </div>

      {/* Suggested action card */}
      <div className="overflow-hidden rounded-2xl border border-violet-200 bg-gradient-to-r from-violet-50 to-fuchsia-50 dark:border-violet-800/50 dark:from-violet-950/30 dark:to-fuchsia-950/30">
        <div className="px-6 py-5">
          <div className="mb-3 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-400">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
              </svg>
            </div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-zinc-50">Suggested Action</h2>
          </div>
          <p className="text-sm leading-relaxed text-gray-700 dark:text-zinc-300">{rec.suggestedAction}</p>
        </div>
      </div>

      {/* Action buttons */}
      {rec.status === 'PUBLISHED' && (
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="border-b border-gray-100 px-6 py-4 dark:border-zinc-800">
            <h2 className="text-base font-semibold text-gray-900 dark:text-zinc-50">Take Action</h2>
          </div>
          <div className="px-6 py-5">
            <div className="flex gap-3">
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => handleStatusChange('ACCEPTED')}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-50"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                {actionLoading ? 'Updating…' : 'Accept'}
              </button>
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => { setShowDeferForm(!showDeferForm); setShowRejectForm(false); }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-5 py-2.5 text-sm font-medium text-amber-700 transition-colors hover:bg-amber-100 disabled:opacity-50 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-400 dark:hover:bg-amber-900/40"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Defer
              </button>
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => { setShowRejectForm(!showRejectForm); setShowDeferForm(false); }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-red-50 px-5 py-2.5 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 disabled:opacity-50 dark:border-red-700 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/40"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
                Reject
              </button>
            </div>

            {showDeferForm && (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/50">
                <label htmlFor="defer-reason" className="mb-2 block text-sm font-medium text-amber-800 dark:text-amber-200">
                  Reason for deferral (optional)
                </label>
                <textarea
                  id="defer-reason"
                  value={deferReason}
                  onChange={(e) => setDeferReason(e.target.value)}
                  maxLength={1000}
                  rows={3}
                  placeholder="Why are you deferring this recommendation?"
                  className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 dark:border-amber-700 dark:bg-zinc-900 dark:text-zinc-100"
                />
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => handleStatusChange('DEFERRED', deferReason.trim() || undefined)}
                    className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                  >
                    {actionLoading ? 'Deferring…' : 'Confirm Deferral'}
                  </button>
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => { setShowDeferForm(false); setDeferReason(''); }}
                    className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {showRejectForm && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/50">
                <label htmlFor="reject-reason" className="mb-2 block text-sm font-medium text-red-800 dark:text-red-200">
                  Reason for rejection (optional)
                </label>
                <textarea
                  id="reject-reason"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  maxLength={1000}
                  rows={3}
                  placeholder="Why is this recommendation not relevant?"
                  className="w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-500/20 dark:border-red-700 dark:bg-zinc-900 dark:text-zinc-100"
                />
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => handleStatusChange('REJECTED', rejectReason.trim() || undefined)}
                    className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {actionLoading ? 'Rejecting…' : 'Confirm Rejection'}
                  </button>
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => { setShowRejectForm(false); setRejectReason(''); }}
                    className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {actionError && (
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 dark:bg-red-900/20">
                <svg className="h-4 w-4 flex-shrink-0 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
                <p className="text-sm text-red-700 dark:text-red-400">{actionError}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Status banner for reviewed recommendations */}
      {rec.status !== 'PUBLISHED' && (
        <div className={`flex items-center gap-3 rounded-2xl px-6 py-4 ${
          rec.status === 'ACCEPTED'
            ? 'border border-emerald-200 bg-emerald-50 dark:border-emerald-800/50 dark:bg-emerald-950/30'
            : rec.status === 'REJECTED'
              ? 'border border-red-200 bg-red-50 dark:border-red-800/50 dark:bg-red-950/30'
              : 'border border-amber-200 bg-amber-50 dark:border-amber-800/50 dark:bg-amber-950/30'
        }`}>
          <div className={`flex h-8 w-8 items-center justify-center rounded-full ${
            rec.status === 'ACCEPTED'
              ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400'
              : rec.status === 'REJECTED'
                ? 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400'
                : 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400'
          }`}>
            {rec.status === 'ACCEPTED' && (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            )}
            {rec.status === 'REJECTED' && (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
            {rec.status === 'DEFERRED' && (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
          </div>
          <p className="text-sm text-gray-700 dark:text-zinc-300">
            This recommendation has been <strong>{rec.status.toLowerCase()}</strong>
            {rec.status === 'DEFERRED' ? ' for later review.' : '.'}
          </p>
        </div>
      )}

      {rec.supersededById && (
        <div className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-6 py-4 dark:border-zinc-800 dark:bg-zinc-800/50">
          <svg className="h-5 w-5 flex-shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
          </svg>
          <p className="text-sm text-gray-600 dark:text-zinc-400">
            This recommendation has been superseded by a newer analysis.
          </p>
        </div>
      )}
    </div>
  );
}

export default function RecommendationDetailPage() {
  return (
    <div className="min-h-screen bg-gray-50 font-sans dark:bg-zinc-950">
      <div className="mx-auto max-w-3xl px-6 py-8 lg:px-10">
        <Suspense
          fallback={
            <div className="flex h-64 items-center justify-center">
              <div className="flex items-center gap-3">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-fuchsia-600" />
                <p className="text-sm text-gray-500 dark:text-zinc-400">Loading recommendation…</p>
              </div>
            </div>
          }
        >
          <RecommendationDetailContent />
        </Suspense>
      </div>
    </div>
  );
}
