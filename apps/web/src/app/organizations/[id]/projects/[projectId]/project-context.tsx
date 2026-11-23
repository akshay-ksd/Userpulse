'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export type ProjectInfo = {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  status: string;
  createdAt: string;
};

export type FeatureInfo = {
  id: string;
  name: string;
  key: string;
  description: string | null;
  status: string;
  eventMappings: { id: string; eventName: string }[];
};

type PeriodPreset = '7d' | '30d' | '90d';

function getDateRange(preset: PeriodPreset): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date();
  if (preset === '7d') start.setDate(end.getDate() - 6);
  else if (preset === '30d') start.setDate(end.getDate() - 29);
  else start.setDate(end.getDate() - 89);
  return {
    startDate: start.toISOString().split('T')[0],
    endDate: end.toISOString().split('T')[0],
  };
}

type ProjectContextType = {
  orgId: string;
  projectId: string;
  project: ProjectInfo | null;
  setProject: (p: ProjectInfo) => void;
  status: 'loading' | 'ready' | 'not-found' | 'error';
  dateRange: { startDate: string; endDate: string };
  setDateRange: (d: { startDate: string; endDate: string }) => void;
  projectFeatures: FeatureInfo[];
  setProjectFeatures: (f: FeatureInfo[]) => void;
};

const ProjectContext = createContext<ProjectContextType | null>(null);

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const { id: orgId, projectId } = useParams<{ id: string; projectId: string }>();
  const router = useRouter();
  const [project, setProjectState] = useState<ProjectInfo | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'not-found' | 'error'>('loading');
  const [dateRange, setDateRange] = useState(() => getDateRange('7d'));
  const [projectFeatures, setProjectFeatures] = useState<FeatureInfo[]>([]);

  function setProject(p: ProjectInfo) {
    setProjectState(p);
    setStatus('ready');
  }

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
          setStatus('not-found');
          return;
        }
        if (!res.ok) {
          setStatus('error');
          return;
        }

        const data = (await res.json()) as ProjectInfo;
        setProjectState(data);
        setStatus('ready');
      } catch {
        if (!cancelled) setStatus('error');
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [orgId, projectId, router]);

  return (
    <ProjectContext.Provider
      value={{
        orgId,
        projectId,
        project,
        setProject,
        status,
        dateRange,
        setDateRange,
        projectFeatures,
        setProjectFeatures,
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error('useProject must be used within ProjectProvider');
  return ctx;
}
