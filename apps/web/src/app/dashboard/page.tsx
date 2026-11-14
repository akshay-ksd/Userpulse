'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

type Me = {
  id: string;
  email: string;
  name: string | null;
};

type State = { status: 'loading' } | { status: 'error' } | { status: 'ready'; user: Me };

export default function DashboardPage() {
  const router = useRouter();
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch(`${API_URL}/me`, {
          credentials: 'include',
        });
        if (cancelled) {
          return;
        }
        if (response.status === 401) {
          router.replace('/login');
          return;
        }
        if (!response.ok) {
          setState({ status: 'error' });
          return;
        }
        setState({ status: 'ready', user: (await response.json()) as Me });
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
      <main className="flex w-full max-w-md flex-col gap-4 rounded-2xl bg-white p-10 shadow-sm dark:bg-zinc-950">
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
          Welcome, {displayName}
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          You are signed in. Your workspace is on the way — organization setup arrives next.
        </p>
      </main>
    </div>
  );
}
