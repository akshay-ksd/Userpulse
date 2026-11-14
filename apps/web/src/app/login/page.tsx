'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type FieldErrors = {
  email?: string;
  password?: string;
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function validate(): boolean {
    const errors: FieldErrors = {};

    if (!EMAIL_PATTERN.test(email.trim())) {
      errors.email = 'Enter a valid email address.';
    }
    if (password.length === 0) {
      errors.password = 'Enter your password.';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});

    if (!validate()) {
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`${API_URL}/auth/sign-in`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: email.trim(), password }),
      });

      if (response.ok) {
        router.push('/dashboard');
        return;
      }
      if (response.status === 401) {
        setFormError('Invalid email or password.');
        return;
      }
      if (response.status === 400) {
        const body = (await response.json()) as { message?: string | string[] };
        const messages = Array.isArray(body.message) ? body.message : [body.message];
        setFormError(messages.filter(Boolean).join(' ') || 'Check the entered details.');
        return;
      }
      setFormError('Something went wrong. Please try again.');
    } catch {
      setFormError('Could not reach the server. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-md flex-col gap-6 rounded-2xl bg-white p-10 shadow-sm dark:bg-zinc-950">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">Sign in</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Sign in to access your workspace.
          </p>
        </div>

        <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-sm font-medium text-black dark:text-zinc-50">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="h-11 rounded-lg border border-black/[.08] bg-transparent px-3 text-black outline-none transition-colors focus:border-black/40 dark:border-white/[.145] dark:text-zinc-50 dark:focus:border-white/40"
            />
            {fieldErrors.email && (
              <p className="text-sm text-red-600 dark:text-red-400">{fieldErrors.email}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-sm font-medium text-black dark:text-zinc-50">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="h-11 rounded-lg border border-black/[.08] bg-transparent px-3 text-black outline-none transition-colors focus:border-black/40 dark:border-white/[.145] dark:text-zinc-50 dark:focus:border-white/40"
            />
            {fieldErrors.password && (
              <p className="text-sm text-red-600 dark:text-red-400">{fieldErrors.password}</p>
            )}
          </div>

          {formError && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {formError}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 flex h-11 items-center justify-center rounded-full bg-foreground px-5 font-medium text-background transition-colors hover:bg-[#383838] disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-[#ccc]"
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="text-center text-sm text-zinc-600 dark:text-zinc-400">
          Don&apos;t have an account?{' '}
          <Link href="/register" className="font-medium text-zinc-950 underline dark:text-zinc-50">
            Register
          </Link>
        </p>
      </main>
    </div>
  );
}
