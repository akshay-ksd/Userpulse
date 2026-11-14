'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

type Org = {
  id: string;
  name: string;
  slug: string;
  role: string;
  createdAt: string;
};

type Invitation = {
  id: string;
  email: string;
  role: string;
  status: string;
  expiresAt: string;
  createdAt: string;
};

type State =
  | { status: 'loading' }
  | { status: 'not-found' }
  | { status: 'error' }
  | { status: 'ready'; org: Org };

function InviteForm({ orgId, onInvited }: { orgId: string; onInvited: () => void }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'MEMBER' | 'ADMIN'>('MEMBER');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSubmitting(true);

    try {
      const res = await fetch(`${API_URL}/organizations/${orgId}/invitations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, role }),
      });

      if (res.status === 409) {
        const body = await res.json();
        setError(body.message ?? 'Invitation conflict.');
        return;
      }
      if (res.status === 403) {
        setError('Only organization owners can send invitations.');
        return;
      }
      if (!res.ok) {
        setError('Failed to send invitation. Please try again.');
        return;
      }

      setSuccess(`Invitation sent to ${email}.`);
      setEmail('');
      setRole('MEMBER');
      onInvited();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <h2 className="text-lg font-medium text-black dark:text-zinc-50">Invite a member</h2>
      <div className="flex gap-2">
        <input
          type="email"
          required
          placeholder="colleague@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={submitting}
          className="flex-1 rounded-lg border border-black/[.15] bg-transparent px-3 py-2 text-sm text-black placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-black/20 disabled:opacity-50 dark:border-white/[.2] dark:text-zinc-50 dark:placeholder:text-zinc-500 dark:focus:ring-white/20"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as 'MEMBER' | 'ADMIN')}
          disabled={submitting}
          className="rounded-lg border border-black/[.15] bg-transparent px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-black/20 disabled:opacity-50 dark:border-white/[.2] dark:text-zinc-50 dark:focus:ring-white/20"
        >
          <option value="MEMBER">Member</option>
          <option value="ADMIN">Admin</option>
        </select>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-50 dark:text-black dark:hover:bg-zinc-200"
        >
          {submitting ? 'Sending…' : 'Invite'}
        </button>
      </div>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {success && <p className="text-sm text-green-600 dark:text-green-400">{success}</p>}
    </form>
  );
}

function PendingInvitations({ orgId, refreshKey }: { orgId: string; refreshKey: number }) {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadInvitations() {
      try {
        const res = await fetch(`${API_URL}/organizations/${orgId}/invitations`, {
          credentials: 'include',
        });
        if (!cancelled && res.ok) {
          setInvitations(await res.json());
        }
      } catch {
        // Silently ignore — list is supplementary
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadInvitations();
    return () => {
      cancelled = true;
    };
  }, [orgId, refreshKey]);

  async function handleCancel(invitationId: string) {
    try {
      const res = await fetch(`${API_URL}/organizations/${orgId}/invitations/${invitationId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.ok || res.status === 204) {
        setInvitations((prev) => prev.filter((i) => i.id !== invitationId));
      }
    } catch {
      // Ignore
    }
  }

  if (loading) return null;
  if (invitations.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Pending invitations</h3>
      <ul className="divide-y divide-black/[.08] rounded-lg border border-black/[.08] dark:divide-white/[.08] dark:border-white/[.08]">
        {invitations.map((inv) => (
          <li key={inv.id} className="flex items-center justify-between px-4 py-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm text-black dark:text-zinc-50">{inv.email}</span>
              <span className="text-xs text-zinc-500">
                {inv.role} · Expires {new Date(inv.expiresAt).toLocaleDateString()}
              </span>
            </div>
            <button
              onClick={() => handleCancel(inv.id)}
              className="text-xs text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
            >
              Cancel
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function OrganizationWorkspace() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [inviteRefresh, setInviteRefresh] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`${API_URL}/organizations/${id}`, {
          credentials: 'include',
        });

        if (cancelled) return;

        if (res.status === 401) {
          router.replace('/login');
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

        const org = (await res.json()) as Org;
        setState({ status: 'ready', org });
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
  }, [id, router]);

  if (state.status === 'loading') {
    return <p className="text-zinc-600 dark:text-zinc-400">Loading workspace…</p>;
  }

  if (state.status === 'not-found') {
    return (
      <main className="flex w-full max-w-md flex-col gap-4 rounded-2xl bg-white p-10 text-center shadow-sm dark:bg-zinc-950">
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
          Organization not found
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          This organization does not exist or you don&apos;t have access to it.
        </p>
        <Link
          href="/dashboard"
          className="mt-2 text-sm font-medium text-zinc-700 underline underline-offset-4 hover:text-black dark:text-zinc-300 dark:hover:text-zinc-50"
        >
          Back to dashboard
        </Link>
      </main>
    );
  }

  if (state.status === 'error') {
    return (
      <main className="flex w-full max-w-md flex-col gap-4 rounded-2xl bg-white p-10 text-center shadow-sm dark:bg-zinc-950">
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
          Something went wrong
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          We couldn&apos;t load this workspace. Please try again.
        </p>
        <Link
          href="/dashboard"
          className="mt-2 text-sm font-medium text-zinc-700 underline underline-offset-4 hover:text-black dark:text-zinc-300 dark:hover:text-zinc-50"
        >
          Back to dashboard
        </Link>
      </main>
    );
  }

  const { org } = state;
  const isOwner = org.role === 'OWNER';

  return (
    <main className="flex w-full max-w-2xl flex-col gap-6 rounded-2xl bg-white p-10 shadow-sm dark:bg-zinc-950">
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard"
          className="text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          aria-label="Back to dashboard"
        >
          &larr;
        </Link>
        <div className="flex flex-1 items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">{org.name}</h1>
            <span className="text-sm text-zinc-500 dark:text-zinc-500">{org.slug}</span>
          </div>
          <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            {org.role}
          </span>
        </div>
      </div>

      <hr className="border-black/[.08] dark:border-white/[.145]" />

      <div className="rounded-xl border border-dashed border-black/[.15] p-6 text-center dark:border-white/[.2]">
        <p className="text-zinc-600 dark:text-zinc-400">Projects and settings will appear here.</p>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-500">
          Created {new Date(org.createdAt).toLocaleDateString()}
        </p>
      </div>

      {isOwner && (
        <>
          <hr className="border-black/[.08] dark:border-white/[.145]" />
          <InviteForm orgId={id} onInvited={() => setInviteRefresh((n) => n + 1)} />
          <PendingInvitations orgId={id} refreshKey={inviteRefresh} />
        </>
      )}
    </main>
  );
}

export default function OrganizationPage() {
  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <Suspense fallback={<p className="text-zinc-600 dark:text-zinc-400">Loading workspace…</p>}>
        <OrganizationWorkspace />
      </Suspense>
    </div>
  );
}
