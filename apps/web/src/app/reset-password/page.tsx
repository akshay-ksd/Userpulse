'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

type FieldErrors = {
  password?: string;
};

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  function validate(): boolean {
    const errors: FieldErrors = {};

    if (password.length < 8) {
      errors.password = 'Password must be at least 8 characters.';
    } else if (password.length > 72) {
      errors.password = 'Password must be at most 72 characters.';
    } else if (!/[A-Za-z]/.test(password)) {
      errors.password = 'Password must contain at least one letter.';
    } else if (!/[0-9]/.test(password)) {
      errors.password = 'Password must contain at least one number.';
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
      const response = await fetch(`${API_URL}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });

      if (response.ok) {
        setSuccess(true);
        return;
      }
      if (response.status === 400) {
        const body = (await response.json()) as { message?: string | string[] };
        const messages = Array.isArray(body.message) ? body.message : [body.message];
        const msg = messages.filter(Boolean).join(' ');
        if (msg.includes('expired') || msg.includes('invalid')) {
          setFormError('Reset link has expired or is invalid.');
        } else {
          setFormError(msg || 'Check the entered details.');
        }
        return;
      }
      setFormError('Something went wrong. Please try again.');
    } catch {
      setFormError('Could not reach the server. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <main className="flex w-full max-w-md flex-col gap-6 rounded-2xl bg-white p-10 shadow-sm dark:bg-zinc-950">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
            Invalid reset link
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            This password reset link is missing or invalid. Please request a new one.
          </p>
        </div>
        <Link
          href="/forgot-password"
          className="mt-2 flex h-11 items-center justify-center rounded-full bg-foreground px-5 font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
        >
          Request a new link
        </Link>
      </main>
    );
  }

  if (success) {
    return (
      <main className="flex w-full max-w-md flex-col gap-6 rounded-2xl bg-white p-10 shadow-sm dark:bg-zinc-950">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">Password reset</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Your password has been reset successfully. You can now sign in with your new password.
          </p>
        </div>
        <Link
          href="/login"
          className="mt-2 flex h-11 items-center justify-center rounded-full bg-foreground px-5 font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
        >
          Sign in
        </Link>
      </main>
    );
  }

  return (
    <main className="flex w-full max-w-md flex-col gap-6 rounded-2xl bg-white p-10 shadow-sm dark:bg-zinc-950">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">Set a new password</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Enter your new password below.</p>
      </div>

      <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="text-sm font-medium text-black dark:text-zinc-50">
            New password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
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
          {submitting ? 'Resetting…' : 'Reset password'}
        </button>
      </form>

      <p className="text-center text-sm text-zinc-600 dark:text-zinc-400">
        Remember your password?{' '}
        <Link href="/login" className="font-medium text-zinc-950 underline dark:text-zinc-50">
          Sign in
        </Link>
      </p>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <Suspense>
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}
