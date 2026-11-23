'use client';

import Link from 'next/link';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ProjectProvider } from './project-context';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

type ProjectInfo = { id: string; name: string; status: string };

type NavItem = { key: string; label: string; icon: React.FC<{ active: boolean }> };
type NavGroup = { title: string; items: NavItem[] };

const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Overview',
    items: [
      { key: 'overview', label: 'Dashboard', icon: DashboardIcon },
    ],
  },
  {
    title: 'Configure',
    items: [
      { key: 'credentials', label: 'API Keys', icon: KeyIcon },
      { key: 'features', label: 'Features', icon: CubeIcon },
    ],
  },
  {
    title: 'Analytics',
    items: [
      { key: 'usage', label: 'Usage Analytics', icon: TrendUpIcon },
    ],
  },
  {
    title: 'Intelligence',
    items: [
      { key: 'ai-analysis', label: 'AI Analysis', icon: FlaskIcon },
    ],
  },
];

const NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

function ProjectSwitcher({
  orgId,
  currentProjectId,
}: {
  orgId: string;
  currentProjectId: string;
}) {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = projects.find((p) => p.id === currentProjectId);

  useEffect(() => {
    fetch(`${API_URL}/organizations/${orgId}/projects`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : []))
      .then(setProjects)
      .catch(() => {});
  }, [orgId]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={ref} className="relative px-4 pb-2 pt-5">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-gray-100 dark:hover:bg-zinc-800/60"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 shadow-md">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M6 8l6-4 6 4" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M6 14l6-4 6 4" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
            <path d="M6 20l6-4 6 4" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.4" />
          </svg>
        </span>
        <div className="flex-1 overflow-hidden">
          <p className="truncate text-[14px] font-bold text-gray-900 dark:text-zinc-50">
            {current?.name ?? 'Loading…'}
          </p>
        </div>
        <ChevronUpDownIcon />
      </button>

      {open && (
        <div className="absolute left-4 right-4 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
          {projects.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                setOpen(false);
                router.push(`/organizations/${orgId}/projects/${p.id}`);
              }}
              className={`flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition-colors first:rounded-t-xl last:rounded-b-xl hover:bg-gray-50 dark:hover:bg-zinc-800 ${
                p.id === currentProjectId
                  ? 'bg-gray-50 font-semibold text-gray-900 dark:bg-zinc-800 dark:text-zinc-50'
                  : 'text-gray-600 dark:text-zinc-400'
              }`}
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 text-xs font-bold text-white">
                {p.name[0].toUpperCase()}
              </span>
              <span className="flex-1 truncate">{p.name}</span>
              {p.id === currentProjectId && (
                <svg className="h-4 w-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SidebarNavItem({
  item,
  active,
  href,
}: {
  item: (typeof NAV_ITEMS)[number];
  active: boolean;
  href: string;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={href}
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[14px] font-medium transition-all ${
        active
          ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400'
          : 'text-gray-600 hover:bg-gray-100 dark:text-zinc-400 dark:hover:bg-zinc-800/60'
      }`}
    >
      <Icon active={active} />
      <span>{item.label}</span>
    </Link>
  );
}

export default function ProjectSidebarLayout({ children }: { children: React.ReactNode }) {
  const { id: orgId, projectId } = useParams<{ id: string; projectId: string }>();
  const pathname = usePathname();
  const isSubPage = pathname.includes('/analysis-runs/') || pathname.includes('/recommendations/');

  if (isSubPage) {
    return <>{children}</>;
  }

  return (
    <ProjectProvider>
      <div className="flex h-screen bg-gray-50 font-sans dark:bg-zinc-950">
        <Sidebar orgId={orgId} projectId={projectId} />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </ProjectProvider>
  );
}

function Sidebar({ orgId, projectId }: { orgId: string; projectId: string }) {
  const pathname = usePathname();
  const basePath = `/organizations/${orgId}/projects/${projectId}`;

  function getActiveKey(): string {
    const suffix = pathname.replace(basePath, '').replace(/^\//, '');
    if (!suffix) return 'overview';
    return suffix;
  }

  const activeKey = getActiveKey();

  return (
    <aside className="flex w-[280px] shrink-0 flex-col border-r border-gray-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <ProjectSwitcher orgId={orgId} currentProjectId={projectId} />

      <nav className="flex-1 overflow-y-auto px-3 pb-4 pt-2">
        <div className="flex flex-col gap-4">
          {NAV_GROUPS.map((group) => (
            <div key={group.title}>
              <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-zinc-500">
                {group.title}
              </p>
              <div className="flex flex-col gap-0.5">
                {group.items.map((item) => (
                  <SidebarNavItem
                    key={item.key}
                    item={item}
                    active={activeKey === item.key}
                    href={item.key === 'overview' ? basePath : `${basePath}/${item.key}`}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </nav>

      <div className="border-t border-gray-100 px-4 py-4 dark:border-zinc-800">
        <Link
          href={`/organizations/${orgId}`}
          className="flex items-center gap-2 text-sm text-gray-500 transition-colors hover:text-gray-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to organization
        </Link>
      </div>
    </aside>
  );
}

// --- Filled / colorful icons matching MUI Minimal Dashboard style ---

function DashboardIcon({ active }: { active: boolean }) {
  return (
    <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="3" width="8" height="8" rx="2" fill={active ? '#3B82F6' : '#94A3B8'} />
      <rect x="13" y="3" width="8" height="8" rx="2" fill={active ? '#3B82F6' : '#94A3B8'} opacity="0.5" />
      <rect x="3" y="13" width="8" height="8" rx="2" fill={active ? '#3B82F6' : '#94A3B8'} opacity="0.5" />
      <rect x="13" y="13" width="8" height="8" rx="2" fill={active ? '#3B82F6' : '#94A3B8'} />
    </svg>
  );
}

function KeyIcon({ active }: { active: boolean }) {
  return (
    <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none">
      <circle cx="16" cy="8" r="5" fill={active ? '#F59E0B' : '#94A3B8'} opacity="0.3" />
      <path d="M15 10l-6.5 6.5M12 14l2 2M10 16l2 2" stroke={active ? '#F59E0B' : '#94A3B8'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="16" cy="8" r="2.5" stroke={active ? '#F59E0B' : '#94A3B8'} strokeWidth="2" />
    </svg>
  );
}

function FunnelIcon({ active }: { active: boolean }) {
  return (
    <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none">
      <path d="M4 4h16l-5.5 7v5l-5 3V11L4 4z" fill={active ? '#8B5CF6' : '#94A3B8'} opacity="0.3" />
      <path d="M4 4h16l-5.5 7v5l-5 3V11L4 4z" stroke={active ? '#8B5CF6' : '#94A3B8'} strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

function RouteIcon({ active }: { active: boolean }) {
  return (
    <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none">
      <circle cx="6" cy="18" r="3" fill={active ? '#EC4899' : '#94A3B8'} opacity="0.4" />
      <circle cx="18" cy="6" r="3" fill={active ? '#EC4899' : '#94A3B8'} />
      <path d="M6 15V9a4 4 0 014-4h4a4 4 0 014 4v6" stroke={active ? '#EC4899' : '#94A3B8'} strokeWidth="1.8" strokeLinecap="round" strokeDasharray="3 2" />
    </svg>
  );
}

function TrendUpIcon({ active }: { active: boolean }) {
  return (
    <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none">
      <path d="M4 18L10 12L14 16L20 6" stroke={active ? '#10B981' : '#94A3B8'} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15 6H20V11" stroke={active ? '#10B981' : '#94A3B8'} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 18L10 12L14 16L20 6" fill="none" />
      <path d="M4 18L10 12L14 16L20 10V18H4Z" fill={active ? '#10B981' : '#94A3B8'} opacity="0.15" />
    </svg>
  );
}

function CompareIcon({ active }: { active: boolean }) {
  return (
    <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="3" width="18" height="18" rx="3" stroke={active ? '#6366F1' : '#94A3B8'} strokeWidth="1.5" opacity="0.4" />
      <rect x="6" y="10" width="3" height="8" rx="1" fill={active ? '#6366F1' : '#94A3B8'} />
      <rect x="10.5" y="7" width="3" height="11" rx="1" fill={active ? '#6366F1' : '#94A3B8'} opacity="0.6" />
      <rect x="15" y="5" width="3" height="13" rx="1" fill={active ? '#6366F1' : '#94A3B8'} opacity="0.35" />
    </svg>
  );
}

function CubeIcon({ active }: { active: boolean }) {
  return (
    <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none">
      <path d="M12 2L3 7v10l9 5 9-5V7l-9-5z" fill={active ? '#8B5CF6' : '#94A3B8'} opacity="0.2" />
      <path d="M12 2L3 7l9 5 9-5-9-5z" fill={active ? '#8B5CF6' : '#94A3B8'} opacity="0.5" />
      <path d="M12 2L3 7v10l9 5 9-5V7l-9-5z" stroke={active ? '#8B5CF6' : '#94A3B8'} strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M12 12v10M12 12L3 7M12 12l9-5" stroke={active ? '#8B5CF6' : '#94A3B8'} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function FlaskIcon({ active }: { active: boolean }) {
  return (
    <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none">
      <path d="M9 3h6M10 3v7.4L5 18a1 1 0 00.85 1.5h12.3A1 1 0 0019 18l-5-7.6V3" fill={active ? '#8B5CF6' : '#94A3B8'} opacity="0.2" />
      <path d="M9 3h6M10 3v7.4L5 18a1 1 0 00.85 1.5h12.3A1 1 0 0019 18l-5-7.6V3" stroke={active ? '#8B5CF6' : '#94A3B8'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="11" cy="15" r="1" fill={active ? '#8B5CF6' : '#94A3B8'} />
      <circle cx="14" cy="13" r="0.8" fill={active ? '#8B5CF6' : '#94A3B8'} opacity="0.6" />
    </svg>
  );
}

function ChevronUpDownIcon() {
  return (
    <svg className="h-5 w-5 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 15L12 18.75 15.75 15m-7.5-6L12 5.25 15.75 9" />
    </svg>
  );
}
