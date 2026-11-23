'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useProject } from '../project-context';
import {
  FeatureUsageInsightsSection,
  RecommendationsSection,
  AnalysisRunsSection,
  DateRangeControl,
} from '../_components';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const TABS = [
  { key: 'insights', label: 'Insights' },
  { key: 'recommendations', label: 'Recommendations' },
  { key: 'runs', label: 'Analysis Runs' },
] as const;

type Tab = (typeof TABS)[number]['key'];

export default function AIAnalysisPage() {
  const router = useRouter();
  const { orgId, project, status, dateRange, setDateRange } = useProject();
  const [activeTab, setActiveTab] = useState<Tab>('insights');
  const [requesting, setRequesting] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [runsRefreshKey, setRunsRefreshKey] = useState(0);

  async function handleRequestAnalysis() {
    if (!project) return;
    setRequesting(true);
    setRequestError(null);
    try {
      const res = await fetch(
        `${API_URL}/organizations/${orgId}/projects/${project.id}/analysis-runs`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        },
      );
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      if (res.ok) {
        setActiveTab('runs');
        setRunsRefreshKey((k) => k + 1);
      } else if (res.status === 409) {
        setRequestError('An analysis is already in progress.');
        setActiveTab('runs');
      } else {
        setRequestError('Failed to request analysis.');
      }
    } catch {
      setRequestError('Network error requesting analysis.');
    } finally {
      setRequesting(false);
    }
  }

  if (status === 'loading' || !project) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
          <p className="text-gray-500 dark:text-zinc-400">Loading…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8 lg:px-10">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-100 to-purple-100 dark:from-violet-900/40 dark:to-purple-900/40">
            <svg className="h-5 w-5 text-violet-600 dark:text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-zinc-50">AI Analysis</h1>
            <p className="text-sm text-gray-500 dark:text-zinc-400">Insights, recommendations, and analysis runs</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {activeTab === 'insights' && (
            <DateRangeControl
              startDate={dateRange.startDate}
              endDate={dateRange.endDate}
              onChange={(s, e) => setDateRange({ startDate: s, endDate: e })}
            />
          )}
          <button
            onClick={handleRequestAnalysis}
            disabled={requesting}
            className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
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
      </div>

      {requestError && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 dark:bg-red-900/20">
          <svg className="h-4 w-4 flex-shrink-0 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          <p className="text-sm text-red-700 dark:text-red-400">{requestError}</p>
          <button onClick={() => setRequestError(null)} className="ml-auto text-red-400 hover:text-red-600">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      <div className="mb-6 flex gap-1 rounded-xl border border-gray-200 bg-gray-100 p-1 dark:border-zinc-700 dark:bg-zinc-800">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
              activeTab === tab.key
                ? 'bg-white text-gray-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-50'
                : 'text-gray-500 hover:text-gray-700 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'insights' && (
        <FeatureUsageInsightsSection orgId={orgId} projectId={project.id} startDate={dateRange.startDate} endDate={dateRange.endDate} />
      )}

      {activeTab === 'recommendations' && (
        <RecommendationsSection orgId={orgId} projectId={project.id} />
      )}

      {activeTab === 'runs' && (
        <AnalysisRunsSection key={runsRefreshKey} orgId={orgId} projectId={project.id} />
      )}
    </div>
  );
}
