'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useProject } from './project-context';
import {
  EditProjectForm,
  DateRangeControl,
} from './_components';
import type { ProjectInfo } from './project-context';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

type EventActivityData = {
  total: number;
  daily: Array<{ date: string; count: number }>;
  startDate: string;
  endDate: string;
};

type ActiveUsersData = {
  total: number;
  daily: Array<{ date: string; count: number }>;
  startDate: string;
  endDate: string;
  definition: string;
};

type EventStatus = {
  totalEvents: number;
  latestEventAt: string | null;
  earliestEventAt: string | null;
};

type FeatureCount = { total: number };

function useApiData<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    setLoading(true);
    fetch(url, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [url]);

  return { data, loading };
}

function StatCard({
  label,
  value,
  subtitle,
  trend,
  gradient,
  icon,
  sparkData,
  sparkColor,
}: {
  label: string;
  value: string;
  subtitle?: string;
  trend?: { value: string; positive: boolean } | null;
  gradient: string;
  icon: React.ReactNode;
  sparkData?: number[];
  sparkColor?: string;
}) {
  const maxSpark = sparkData ? Math.max(...sparkData, 1) : 1;

  return (
    <div className={`relative overflow-hidden rounded-2xl ${gradient} p-5 min-h-[160px] flex flex-col justify-between`}>
      <div className="flex items-start justify-between">
        <div className="flex h-12 w-12 items-center justify-center">
          {icon}
        </div>
        {trend && (
          <div className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
            trend.positive
              ? 'bg-white/20 text-green-800 dark:text-green-200'
              : 'bg-white/20 text-red-700 dark:text-red-300'
          }`}>
            <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none">
              {trend.positive ? (
                <path d="M2 8l4-4 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              ) : (
                <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              )}
            </svg>
            {trend.value}
          </div>
        )}
      </div>

      <div className="mt-auto">
        <p className="text-sm font-medium text-gray-700/80 dark:text-gray-200/70">{label}</p>
        <div className="flex items-end justify-between">
          <p className="text-3xl font-bold text-gray-900 dark:text-white">{value}</p>
          {sparkData && sparkData.length > 1 && (
            <svg className="h-10 w-20 opacity-60" viewBox={`0 0 ${sparkData.length * 10} 40`} fill="none">
              <polyline
                points={sparkData
                  .map((v, i) => `${i * 10},${40 - (v / maxSpark) * 36}`)
                  .join(' ')}
                stroke={sparkColor ?? '#1F2937'}
                strokeWidth="2"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </div>
        {subtitle && (
          <p className="mt-0.5 text-xs text-gray-600/70 dark:text-gray-300/60">{subtitle}</p>
        )}
      </div>
    </div>
  );
}

function ChartCardSkeleton() {
  return (
    <div className="flex h-[240px] items-center justify-center rounded-2xl border border-gray-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center gap-2">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-blue-500" />
        <p className="text-sm text-gray-400 dark:text-zinc-500">Loading…</p>
      </div>
    </div>
  );
}

function ChartCardEmpty({ label, icon, message }: { label: string; icon: React.ReactNode; message: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
      <p className="mb-4 text-base font-semibold text-gray-900 dark:text-zinc-50">{label}</p>
      <div className="flex h-[160px] flex-col items-center justify-center">
        <div className="mb-3 text-gray-200 dark:text-zinc-700">{icon}</div>
        <p className="text-sm text-gray-400 dark:text-zinc-500">{message}</p>
        <p className="mt-1 text-xs text-gray-300 dark:text-zinc-600">Start sending events to see data here</p>
      </div>
    </div>
  );
}

function MiniBarChart({
  data,
  color,
  colorLight,
  label,
  icon,
}: {
  data: Array<{ date: string; count: number }>;
  color: string;
  colorLight: string;
  label: string;
  icon: React.ReactNode;
}) {
  const max = Math.max(...data.map((d) => d.count), 1);
  const total = data.reduce((s, d) => s + d.count, 0);
  const chartH = 140;
  const gridLines = 4;

  const dateLabels: { idx: number; label: string }[] = [];
  if (data.length > 0) {
    const step = Math.max(1, Math.floor(data.length / 5));
    for (let i = 0; i < data.length; i += step) {
      const d = new Date(data[i].date);
      dateLabels.push({ idx: i, label: `${d.getMonth() + 1}/${d.getDate()}` });
    }
    const lastIdx = data.length - 1;
    if (!dateLabels.find((l) => l.idx === lastIdx)) {
      const d = new Date(data[lastIdx].date);
      dateLabels.push({ idx: lastIdx, label: `${d.getMonth() + 1}/${d.getDate()}` });
    }
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: colorLight, color }}>
            {icon}
          </div>
          <p className="text-sm font-semibold text-gray-900 dark:text-zinc-50">{label}</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-gray-900 dark:text-zinc-50">{formatNum(total)}</p>
          <p className="text-[11px] text-gray-400 dark:text-zinc-500">total</p>
        </div>
      </div>

      <div className="relative" style={{ height: chartH }}>
        {Array.from({ length: gridLines }).map((_, i) => (
          <div
            key={i}
            className="absolute left-0 right-0 border-t border-dashed border-gray-100 dark:border-zinc-800/60"
            style={{ top: `${(i / gridLines) * 100}%` }}
          />
        ))}
        <div className="absolute bottom-0 left-0 right-0 border-t border-gray-200/60 dark:border-zinc-700/60" />

        <div className="relative flex h-full items-end gap-[3px] px-[1px]">
          {data.map((d) => {
            const pct = max > 0 ? (d.count / max) * 100 : 0;
            return (
              <div key={d.date} className="group relative flex-1 flex flex-col items-center justify-end h-full">
                <div
                  className="w-full transition-all duration-200 group-hover:brightness-110"
                  style={{
                    height: `${Math.max(pct, d.count > 0 ? 2 : 0)}%`,
                    minHeight: d.count > 0 ? '2px' : '0',
                    background: `linear-gradient(to top, ${color}, ${color}dd)`,
                    borderRadius: '4px 4px 1px 1px',
                    opacity: 0.8,
                  }}
                />
                <div className="pointer-events-none absolute -top-12 left-1/2 z-10 hidden -translate-x-1/2 rounded-lg px-3 py-2 text-xs font-medium shadow-xl group-hover:block bg-gray-900 text-white dark:bg-zinc-100 dark:text-zinc-900 border border-gray-800 dark:border-zinc-200">
                  <div className="text-[10px] opacity-60 mb-0.5">{new Date(d.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</div>
                  <div className="text-sm font-bold">{d.count.toLocaleString()}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {dateLabels.length > 0 && (
        <div className="relative mt-2.5 flex justify-between px-[1px]">
          {dateLabels.map(({ idx, label: lbl }) => (
            <span key={idx} className="text-[10px] font-medium text-gray-400 dark:text-zinc-500">
              {lbl}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}m`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString();
}

function computeTrend(daily: Array<{ count: number }>): { value: string; positive: boolean } | null {
  if (daily.length < 4) return null;
  const mid = Math.floor(daily.length / 2);
  const firstHalf = daily.slice(0, mid).reduce((s, d) => s + d.count, 0);
  const secondHalf = daily.slice(mid).reduce((s, d) => s + d.count, 0);
  if (firstHalf === 0 && secondHalf === 0) return null;
  if (firstHalf === 0) return { value: '+100%', positive: true };
  const pct = ((secondHalf - firstHalf) / firstHalf) * 100;
  return {
    value: `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`,
    positive: pct >= 0,
  };
}

function Dashboard() {
  const { orgId, project, setProject, status, dateRange, setDateRange } = useProject();
  const [editing, setEditing] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const baseUrl = project
    ? `${API_URL}/organizations/${orgId}/projects/${project.id}`
    : null;

  const { data: eventActivity, loading: eventsLoading } = useApiData<EventActivityData>(
    baseUrl ? `${baseUrl}/analytics/event-activity?startDate=${dateRange.startDate}&endDate=${dateRange.endDate}` : null,
  );

  const { data: activeUsers, loading: usersLoading } = useApiData<ActiveUsersData>(
    baseUrl ? `${baseUrl}/analytics/active-users?startDate=${dateRange.startDate}&endDate=${dateRange.endDate}` : null,
  );

  const { data: eventStatus } = useApiData<EventStatus>(
    baseUrl ? `${baseUrl}/event-status` : null,
  );

  const { data: featuresData } = useApiData<FeatureCount[] | { total?: number }>(
    baseUrl ? `${baseUrl}/features` : null,
  );

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  if (status === 'loading' || !project) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
          <p className="text-gray-500 dark:text-zinc-400">Loading project…</p>
        </div>
      </div>
    );
  }

  const isArchived = project.status === 'ARCHIVED';

  async function handleArchiveToggle() {
    if (!project) return;
    const isArchiving = project.status === 'ACTIVE';
    if (
      isArchiving &&
      !confirm('Are you sure you want to archive this project? Archived projects will not accept new events.')
    )
      return;

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
        setProject(updated);
      }
    } catch {
      // ignore
    } finally {
      setArchiving(false);
    }
  }

  const totalEvents = eventActivity?.total ?? eventStatus?.totalEvents ?? 0;
  const totalUsers = activeUsers?.total ?? 0;
  const featureCount = Array.isArray(featuresData) ? featuresData.length : 0;
  const eventTrend = eventActivity ? computeTrend(eventActivity.daily) : null;
  const userTrend = activeUsers ? computeTrend(activeUsers.daily) : null;

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8 lg:px-10">
      {/* Welcome header + date range + actions */}
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-zinc-50">
              Hi, Welcome back 👋
            </h1>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                isArchived
                  ? 'bg-gray-100 text-gray-500 dark:bg-zinc-800 dark:text-zinc-400'
                  : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
              }`}
            >
              {project.status}
            </span>
          </div>
          {project.description && (
            <p className="mt-1 text-sm text-gray-500 dark:text-zinc-400">{project.description}</p>
          )}
        </div>

        <div className="flex items-center gap-3">
          <DateRangeControl
            startDate={dateRange.startDate}
            endDate={dateRange.endDate}
            onChange={(s, e) => setDateRange({ startDate: s, endDate: e })}
          />
          <div ref={menuRef} className="relative">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
            >
              <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4z" />
              </svg>
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full z-50 mt-1 w-40 rounded-xl border border-gray-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
                <button
                  onClick={() => { setEditing(true); setMenuOpen(false); }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487z" />
                  </svg>
                  Edit project
                </button>
                <button
                  onClick={() => { handleArchiveToggle(); setMenuOpen(false); }}
                  disabled={archiving}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors disabled:opacity-50 ${
                    isArchived
                      ? 'text-gray-700 hover:bg-gray-50 dark:text-zinc-300 dark:hover:bg-zinc-800'
                      : 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950'
                  }`}
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                  </svg>
                  {archiving ? (isArchived ? 'Restoring…' : 'Archiving…') : isArchived ? 'Restore' : 'Archive'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Stat cards row */}
      <div className="mb-8 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total Events"
          value={formatNum(totalEvents)}
          subtitle={eventStatus?.latestEventAt ? `Latest: ${formatRelativeTime(eventStatus.latestEventAt)}` : undefined}
          trend={eventTrend}
          gradient="bg-gradient-to-br from-blue-100 via-blue-50 to-blue-100 dark:from-blue-950/60 dark:via-blue-900/40 dark:to-blue-950/60"
          sparkData={eventActivity?.daily.map((d) => d.count)}
          sparkColor="#3B82F6"
          icon={
            <svg width="40" height="40" viewBox="0 0 48 48" fill="none">
              <rect x="4" y="20" width="10" height="22" rx="3" fill="#3B82F6" />
              <rect x="19" y="10" width="10" height="32" rx="3" fill="#3B82F6" opacity="0.6" />
              <rect x="34" y="4" width="10" height="38" rx="3" fill="#3B82F6" opacity="0.3" />
            </svg>
          }
        />

        <StatCard
          label="Active Users"
          value={formatNum(totalUsers)}
          trend={userTrend}
          gradient="bg-gradient-to-br from-purple-100 via-fuchsia-50 to-purple-100 dark:from-purple-950/60 dark:via-fuchsia-900/40 dark:to-purple-950/60"
          sparkData={activeUsers?.daily.map((d) => d.count)}
          sparkColor="#8B5CF6"
          icon={
            <svg width="40" height="40" viewBox="0 0 48 48" fill="none">
              <circle cx="20" cy="16" r="8" fill="#8B5CF6" />
              <ellipse cx="20" cy="36" rx="14" ry="8" fill="#8B5CF6" opacity="0.4" />
              <circle cx="36" cy="18" r="5" fill="#8B5CF6" opacity="0.5" />
              <ellipse cx="36" cy="34" rx="8" ry="5" fill="#8B5CF6" opacity="0.2" />
            </svg>
          }
        />

        <StatCard
          label="Features"
          value={featureCount.toString()}
          subtitle="Tracked features"
          gradient="bg-gradient-to-br from-amber-100 via-yellow-50 to-amber-100 dark:from-amber-950/60 dark:via-yellow-900/40 dark:to-amber-950/60"
          sparkColor="#F59E0B"
          icon={
            <svg width="40" height="40" viewBox="0 0 48 48" fill="none">
              <path d="M24 4L6 14v20l18 10 18-10V14L24 4z" fill="#F59E0B" opacity="0.25" />
              <path d="M24 4L6 14l18 10 18-10L24 4z" fill="#F59E0B" opacity="0.6" />
              <path d="M24 4L6 14v20l18 10 18-10V14L24 4z" stroke="#F59E0B" strokeWidth="2" strokeLinejoin="round" fill="none" />
              <path d="M24 24v20M24 24L6 14M24 24l18-10" stroke="#F59E0B" strokeWidth="2" strokeLinejoin="round" />
            </svg>
          }
        />

        <StatCard
          label="Status"
          value={isArchived ? 'Archived' : 'Active'}
          subtitle={`Created ${new Date(project.createdAt).toLocaleDateString()}`}
          gradient="bg-gradient-to-br from-emerald-100 via-green-50 to-emerald-100 dark:from-emerald-950/60 dark:via-green-900/40 dark:to-emerald-950/60"
          icon={
            <svg width="40" height="40" viewBox="0 0 48 48" fill="none">
              <circle cx="24" cy="24" r="18" fill="#10B981" opacity="0.2" />
              <path d="M15 24l6 6 12-12" stroke="#10B981" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          }
        />
      </div>

      {editing && (
        <div className="-mt-4 mb-6 rounded-2xl border border-gray-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <EditProjectForm
            project={project}
            orgId={orgId}
            onUpdated={(updated) => {
              setProject(updated);
              setEditing(false);
            }}
            onCancel={() => setEditing(false)}
          />
        </div>
      )}

      {/* Charts row */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {eventsLoading ? (
          <ChartCardSkeleton />
        ) : eventActivity && eventActivity.daily.length > 0 ? (
          <MiniBarChart
            data={eventActivity.daily}
            color="#6366F1"
            colorLight="rgba(99,102,241,0.12)"
            label="Event Activity"
            icon={<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none"><rect x="4" y="12" width="4" height="8" rx="1" fill="currentColor" /><rect x="10" y="8" width="4" height="12" rx="1" fill="currentColor" opacity="0.6" /><rect x="16" y="4" width="4" height="16" rx="1" fill="currentColor" opacity="0.3" /></svg>}
          />
        ) : (
          <ChartCardEmpty
            label="Event Activity"
            icon={<svg className="h-10 w-10" viewBox="0 0 24 24" fill="none"><rect x="4" y="12" width="4" height="8" rx="1" fill="currentColor" /><rect x="10" y="8" width="4" height="12" rx="1" fill="currentColor" opacity="0.6" /><rect x="16" y="4" width="4" height="16" rx="1" fill="currentColor" opacity="0.3" /></svg>}
            message="No event data yet"
          />
        )}

        {usersLoading ? (
          <ChartCardSkeleton />
        ) : activeUsers && activeUsers.daily.length > 0 ? (
          <MiniBarChart
            data={activeUsers.daily}
            color="#8B5CF6"
            colorLight="rgba(139,92,246,0.12)"
            label="Active Users"
            icon={<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none"><circle cx="9" cy="7" r="3.5" fill="currentColor" /><ellipse cx="9" cy="17" rx="6" ry="3.5" fill="currentColor" opacity="0.4" /></svg>}
          />
        ) : (
          <ChartCardEmpty
            label="Active Users"
            icon={<svg className="h-10 w-10" viewBox="0 0 24 24" fill="none"><circle cx="9" cy="7" r="3.5" fill="currentColor" /><ellipse cx="9" cy="17" rx="6" ry="3.5" fill="currentColor" opacity="0.4" /></svg>}
            message="No user data yet"
          />
        )}
      </div>
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
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function ProjectPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center">
          <div className="flex items-center gap-3">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
            <p className="text-gray-500 dark:text-zinc-400">Loading project…</p>
          </div>
        </div>
      }
    >
      <Dashboard />
    </Suspense>
  );
}
