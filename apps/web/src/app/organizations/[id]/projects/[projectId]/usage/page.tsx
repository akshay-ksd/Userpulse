'use client';

import { useState } from 'react';
import { useProject } from '../project-context';
import {
  FeatureAdoptionSection,
  FeatureUsageTrendsSection,
  ActivityChangesSection,
  DateRangeControl,
} from '../_components';

const TABS = [
  { key: 'adoption', label: 'Adoption' },
  { key: 'trends', label: 'Trends' },
  { key: 'activity', label: 'Activity Changes' },
] as const;

type Tab = (typeof TABS)[number]['key'];

export default function UsagePage() {
  const { orgId, project, status, dateRange, setDateRange } = useProject();
  const [activeTab, setActiveTab] = useState<Tab>('adoption');

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
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-100 to-teal-100 dark:from-emerald-900/40 dark:to-teal-900/40">
            <svg className="h-5 w-5 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-zinc-50">Usage Analytics</h1>
            <p className="text-sm text-gray-500 dark:text-zinc-400">Adoption, trends, and activity changes</p>
          </div>
        </div>
        <DateRangeControl
          startDate={dateRange.startDate}
          endDate={dateRange.endDate}
          onChange={(s, e) => setDateRange({ startDate: s, endDate: e })}
        />
      </div>

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

      {activeTab === 'adoption' && (
        <FeatureAdoptionSection orgId={orgId} projectId={project.id} startDate={dateRange.startDate} endDate={dateRange.endDate} />
      )}

      {activeTab === 'trends' && (
        <FeatureUsageTrendsSection orgId={orgId} projectId={project.id} startDate={dateRange.startDate} endDate={dateRange.endDate} />
      )}

      {activeTab === 'activity' && (
        <ActivityChangesSection orgId={orgId} projectId={project.id} startDate={dateRange.startDate} endDate={dateRange.endDate} />
      )}
    </div>
  );
}
