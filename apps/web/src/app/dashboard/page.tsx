'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

type Me = {
  id: string;
  email: string;
  name: string | null;
};

type Org = {
  id: string;
  name: string;
  slug: string;
  role: string;
  createdAt: string;
};

type State =
  { status: 'loading' } | { status: 'error' } | { status: 'ready'; user: Me; orgs: Org[] };

export default function DashboardPage() {
  const router = useRouter();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [signingOut, setSigningOut] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [orgName, setOrgName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [meRes, orgsRes] = await Promise.all([
          fetch(`${API_URL}/me`, { credentials: 'include' }),
          fetch(`${API_URL}/organizations`, { credentials: 'include' }),
        ]);

        if (cancelled) return;

        if (meRes.status === 401 || orgsRes.status === 401) {
          router.replace('/login');
          return;
        }
        if (!meRes.ok || !orgsRes.ok) {
          setState({ status: 'error' });
          return;
        }

        const user = (await meRes.json()) as Me;
        const orgs = (await orgsRes.json()) as Org[];
        setState({ status: 'ready', user, orgs });
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
  }, [router]);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await fetch(`${API_URL}/auth/sign-out`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // Even on network error, redirect to login — the user wants to leave.
    }
    router.replace('/login');
  }

  async function handleCreateOrg(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateError(null);

    const trimmed = orgName.trim();
    if (!trimmed) {
      setCreateError('Organization name is required.');
      return;
    }

    setCreating(true);
    try {
      const response = await fetch(`${API_URL}/organizations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: trimmed }),
      });

      if (response.ok) {
        const newOrg = (await response.json()) as Org;
        if (state.status === 'ready') {
          setState({ ...state, orgs: [newOrg, ...state.orgs] });
        }
        setOrgName('');
        setShowCreateForm(false);
        return;
      }

      if (response.status === 400) {
        const body = (await response.json()) as { message?: string | string[] };
        const messages = Array.isArray(body.message) ? body.message : [body.message];
        setCreateError(messages.filter(Boolean).join(' ') || 'Invalid organization name.');
        return;
      }

      setCreateError('Something went wrong. Please try again.');
    } catch {
      setCreateError('Could not reach the server. Please try again.');
    } finally {
      setCreating(false);
    }
  }

  if (state.status === 'loading') {
    return (
      <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
        <p className="text-zinc-600 dark:text-zinc-400">Checking your session…</p>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
        <main className="flex w-full max-w-md flex-col gap-4 rounded-2xl bg-white p-10 text-center shadow-sm dark:bg-zinc-950">
          <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
            Something went wrong
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            We couldn&apos;t load your workspace. Please try again.
          </p>
        </main>
      </div>
    );
  }

  const displayName = state.user.name ?? state.user.email;

  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-lg flex-col gap-6 rounded-2xl bg-white p-10 shadow-sm dark:bg-zinc-950">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
            Welcome, {displayName}
          </h1>
          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            className="rounded-lg border border-black/[.08] px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/[.145] dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium text-black dark:text-zinc-50">Organizations</h2>
            {!showCreateForm && (
              <button
                type="button"
                onClick={() => setShowCreateForm(true)}
                className="rounded-lg bg-foreground px-3 py-1.5 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
              >
                Create organization
              </button>
            )}
          </div>

          {showCreateForm && (
            <form
              className="flex flex-col gap-3 rounded-xl border border-black/[.08] p-4 dark:border-white/[.145]"
              onSubmit={handleCreateOrg}
            >
              <label
                htmlFor="org-name"
                className="text-sm font-medium text-black dark:text-zinc-50"
              >
                Organization name
              </label>
              <input
                id="org-name"
                type="text"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                placeholder="e.g. Acme Corp"
                maxLength={100}
                className="h-10 rounded-lg border border-black/[.08] bg-transparent px-3 text-black outline-none transition-colors focus:border-black/40 dark:border-white/[.145] dark:text-zinc-50 dark:focus:border-white/40"
              />
              {createError && (
                <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                  {createError}
                </p>
              )}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={creating}
                  className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-[#383838] disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-[#ccc]"
                >
                  {creating ? 'Creating…' : 'Create'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateForm(false);
                    setOrgName('');
                    setCreateError(null);
                  }}
                  className="rounded-lg border border-black/[.08] px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-white/[.145] dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {state.orgs.length === 0 && !showCreateForm ? (
            <div className="rounded-xl border border-dashed border-black/[.15] p-6 text-center dark:border-white/[.2]">
              <p className="text-zinc-600 dark:text-zinc-400">
                You don&apos;t have any organizations yet.
              </p>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-500">
                Create one to start managing your product analytics.
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {state.orgs.map((org) => (
                <li key={org.id}>
                  <div className="flex items-center justify-between rounded-xl border border-black/[.08] p-4 transition-colors hover:bg-zinc-50 dark:border-white/[.145] dark:hover:bg-zinc-900">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium text-black dark:text-zinc-50">{org.name}</span>
                      <span className="text-xs text-zinc-500 dark:text-zinc-500">{org.slug}</span>
                    </div>
                    <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                      {org.role}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}
