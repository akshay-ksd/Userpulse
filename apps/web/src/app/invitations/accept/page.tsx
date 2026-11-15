'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

type AcceptState =
  | { status: 'loading' }
  | { status: 'success'; organizationId: string; organizationName: string; role: string }
  | { status: 'error'; message: string }
  | { status: 'no-token' };

function AcceptInvitation() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token');
  const [state, setState] = useState<AcceptState>(
    token ? { status: 'loading' } : { status: 'no-token' },
  );

  useEffect(() => {
    if (!token) return;

    let cancelled = false;

    async function accept() {
      try {
        const res = await fetch(`${API_URL}/invitations/accept`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ token }),
        });

        if (cancelled) return;

        if (res.status === 401) {
          const returnUrl = encodeURIComponent(`/invitations/accept?token=${token}`);
          router.replace(`/login?returnTo=${returnUrl}`);
          return;
        }

        const body = await res.json();

        if (!res.ok) {
          setState({
            status: 'error',
            message: body.message ?? 'Failed to accept invitation.',
          });
          return;
        }

        setState({
          status: 'success',
          organizationId: body.organizationId,
          organizationName: body.organizationName,
          role: body.role,
        });
      } catch {
        if (!cancelled) {
          setState({ status: 'error', message: 'Network error. Please try again.' });
        }
      }
    }

    void accept();
    return () => {
      cancelled = true;
    };
  }, [token, router]);

  if (state.status === 'loading') {
    return <p className="text-zinc-600 dark:text-zinc-400">Accepting invitation…</p>;
  }

  if (state.status === 'no-token') {
    return (
      <main className="flex w-full max-w-md flex-col gap-4 rounded-2xl bg-white p-10 text-center shadow-sm dark:bg-zinc-950">
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
          Invalid invitation link
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          No invitation token was provided. Please check the link and try again.
        </p>
        <Link
          href="/dashboard"
          className="mt-2 text-sm font-medium text-zinc-700 underline underline-offset-4 hover:text-black dark:text-zinc-300 dark:hover:text-zinc-50"
        >
          Go to dashboard
        </Link>
      </main>
    );
  }

  if (state.status === 'error') {
    return (
      <main className="flex w-full max-w-md flex-col gap-4 rounded-2xl bg-white p-10 text-center shadow-sm dark:bg-zinc-950">
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
          Could not accept invitation
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400">{state.message}</p>
        <Link
          href="/dashboard"
          className="mt-2 text-sm font-medium text-zinc-700 underline underline-offset-4 hover:text-black dark:text-zinc-300 dark:hover:text-zinc-50"
        >
          Go to dashboard
        </Link>
      </main>
    );
  }

  return (
    <main className="flex w-full max-w-md flex-col gap-4 rounded-2xl bg-white p-10 text-center shadow-sm dark:bg-zinc-950">
      <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">Invitation accepted</h1>
      <p className="text-zinc-600 dark:text-zinc-400">
        You have joined <strong>{state.organizationName}</strong> as a {state.role.toLowerCase()}.
      </p>
      <Link
        href={`/organizations/${state.organizationId}`}
        className="mt-2 rounded-lg bg-black px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-50 dark:text-black dark:hover:bg-zinc-200"
      >
        Go to workspace
      </Link>
    </main>
  );
}

export default function AcceptInvitationPage() {
  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <Suspense
        fallback={<p className="text-zinc-600 dark:text-zinc-400">Accepting invitation…</p>}
      >
        <AcceptInvitation />
      </Suspense>
    </div>
  );
}
