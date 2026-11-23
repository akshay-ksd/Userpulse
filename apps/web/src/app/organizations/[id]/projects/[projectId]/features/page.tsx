'use client';

import { useState } from 'react';
import { useProject } from '../project-context';
import { FeaturesSection, UnmappedEventsSection } from '../_components';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const TABS = [
  { key: 'manage', label: 'Manage Features' },
  { key: 'unmapped', label: 'Unmapped Events' },
] as const;

type Tab = (typeof TABS)[number]['key'];

export default function FeaturesPage() {
  const { orgId, project, status, projectFeatures, setProjectFeatures } = useProject();
  const [activeTab, setActiveTab] = useState<Tab>('manage');
  const [unmappedKey, setUnmappedKey] = useState(0);

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
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-100 to-teal-100 dark:from-cyan-900/40 dark:to-teal-900/40">
            <svg className="h-5 w-5 text-cyan-600 dark:text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-zinc-50">Features</h1>
            <p className="text-sm text-gray-500 dark:text-zinc-400">Manage features and map events</p>
          </div>
        </div>
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

      {activeTab === 'manage' && (
        <FeaturesSection orgId={orgId} projectId={project.id} onFeaturesLoaded={setProjectFeatures} />
      )}

      {activeTab === 'unmapped' && (
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
      )}
    </div>
  );
}
