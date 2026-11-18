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

const categoryColors: Record<string, string> = {
  adoption: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  engagement: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  retention: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  ux: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  general: 'bg-zinc-100 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-300',
};

const statusColors: Record<string, string> = {
  PUBLISHED: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  ACCEPTED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  REJECTED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  DEFERRED: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
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
      {evidenceType === 'feature_adoption' && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
            Feature adoption — {(evidence.featureName as string) ?? 'Unknown feature'}
          </p>
          <EvidenceMetricRow
            label="Adoption rate"
            value={`${evidence.adoptionRate}%`}
            definitionKey="adoptionRate"
          />
          <EvidenceMetricRow
            label="Feature users"
            value={evidence.featureUsers as number}
            definitionKey="featureUsers"
          />
          <EvidenceMetricRow
            label="Total active users"
            value={evidence.totalUsers as number}
            definitionKey="totalUsers"
          />
          <EvidenceMetricRow
            label="Project active users"
            value={evidence.activeUsers as number}
            definitionKey="activeUsers"
          />
        </div>
      )}
      {evidenceType === 'activity_change' && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
            Activity change — {evidence.eventName as string}
          </p>
          <EvidenceMetricRow
            label="Current period count"
            value={evidence.currentCount as number}
            definitionKey="currentCount"
          />
          <EvidenceMetricRow
            label="Baseline period count"
            value={evidence.baselineCount as number}
            definitionKey="baselineCount"
          />
          <EvidenceMetricRow label="Direction" value={evidence.direction as string} />
          <EvidenceMetricRow
            label="Change"
            value={`${(evidence.percentChange as number) > 0 ? '+' : ''}${evidence.percentChange}%`}
            definitionKey="percentChange"
          />
        </div>
      )}
      {evidenceType === 'feature_usage' && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
            Feature usage — {(evidence.featureName as string) ?? 'Unknown feature'}
          </p>
          <EvidenceMetricRow
            label="Total events"
            value={evidence.totalEvents as number}
            definitionKey="totalEvents"
          />
          <EvidenceMetricRow
            label="Classification"
            value={evidence.classification as string}
            definitionKey="classification"
          />
        </div>
      )}
      {evidenceType !== 'feature_adoption' &&
        evidenceType !== 'activity_change' &&
        evidenceType !== 'feature_usage' && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Supporting data</p>
            {Object.entries(evidence)
              .filter(([k]) => k !== 'type' && k !== 'period')
              .map(([key, val]) => (
                <EvidenceMetricRow
                  key={key}
                  label={key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())}
                  value={typeof val === 'object' ? JSON.stringify(val) : String(val)}
                />
              ))}
          </div>
        )}
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

function RecommendationDetailContent() {
  const params = useParams();
  const router = useRouter();
  const orgId = params.id as string;
  const projectId = params.projectId as string;
  const recommendationId = params.recommendationId as string;
  const [state, setState] = useState<State>({ status: 'loading' });

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
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading recommendation…</p>;
  }

  if (state.status === 'not-found') {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Recommendation not found.</p>
        <Link
          href={`/organizations/${orgId}/projects/${projectId}`}
          className="text-sm text-zinc-600 underline underline-offset-2 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          Back to project
        </Link>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-red-600 dark:text-red-400">
          Failed to load recommendation. Please try again.
        </p>
        <Link
          href={`/organizations/${orgId}/projects/${projectId}`}
          className="text-sm text-zinc-600 underline underline-offset-2 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          Back to project
        </Link>
      </div>
    );
  }

  const { rec } = state;
  const statusColor = statusColors[rec.status] ?? statusColors.PUBLISHED;

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={`/organizations/${orgId}/projects/${projectId}`}
        className="self-start text-sm text-zinc-600 underline underline-offset-2 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
      >
        Back to project
      </Link>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${categoryColors[rec.category] ?? categoryColors.general}`}
          >
            {rec.category}
          </span>
          <span
            className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusColor}`}
          >
            {rec.status}
          </span>
          {rec.affectedArea && (
            <span className="text-xs text-zinc-500 dark:text-zinc-400">{rec.affectedArea}</span>
          )}
        </div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-white">{rec.title}</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Created {new Date(rec.createdAt).toLocaleDateString()}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-medium text-zinc-900 dark:text-white">Summary</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{rec.summary}</p>
      </div>

      {rec.priorityScore != null && (
        <div className="flex flex-col gap-2">
          <h2 className="text-lg font-medium text-zinc-900 dark:text-white">Priority score</h2>
          <div className="flex flex-wrap items-center gap-4">
            <span
              className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-sm font-medium ${scoreBg(rec.priorityScore)} ${scoreColor(rec.priorityScore)}`}
            >
              {rec.priorityScore.toFixed(2)}
            </span>
            <div className="flex gap-4 text-xs text-zinc-500 dark:text-zinc-400">
              {rec.reach != null && (
                <span>
                  Reach: <strong className={scoreColor(rec.reach)}>{rec.reach.toFixed(2)}</strong>
                </span>
              )}
              {rec.impact != null && (
                <span>
                  Impact:{' '}
                  <strong className={scoreColor(rec.impact)}>{rec.impact.toFixed(2)}</strong>
                </span>
              )}
              {rec.confidence != null && (
                <span>
                  Confidence:{' '}
                  <strong className={scoreColor(rec.confidence)}>
                    {rec.confidence.toFixed(2)}
                  </strong>
                </span>
              )}
            </div>
          </div>
          <p className="text-xs italic text-zinc-400 dark:text-zinc-500">
            Priority Score = Reach × Impact × Confidence. This is a relative ranking aid, not a
            guarantee of outcomes.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-medium text-zinc-900 dark:text-white">Evidence</h2>
        <EvidenceDisplay
          evidence={rec.evidence}
          periodStart={rec.periodStart}
          periodEnd={rec.periodEnd}
          analysisRunId={rec.analysisRunId}
        />
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950">
        <h2 className="mb-2 text-sm font-medium text-amber-800 dark:text-amber-200">
          Suggested action
        </h2>
        <p className="text-sm text-amber-900 dark:text-amber-100">{rec.suggestedAction}</p>
      </div>

      {rec.supersededById && (
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-900">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            This recommendation has been superseded by a newer one.
          </p>
        </div>
      )}
    </div>
  );
}

export default function RecommendationDetailPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Suspense
        fallback={
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading recommendation…</p>
        }
      >
        <RecommendationDetailContent />
      </Suspense>
    </div>
  );
}
