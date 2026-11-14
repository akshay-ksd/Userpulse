'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const PASSWORD_RULES = [
  { test: (password: string) => password.length >= 8, message: 'at least 8 characters' },
  { test: (password: string) => password.length <= 72, message: 'at most 72 characters' },
  { test: (password: string) => /[A-Za-z]/.test(password), message: 'at least one letter' },
  { test: (password: string) => /[0-9]/.test(password), message: 'at least one number' },
];

type FieldErrors = {
  name?: string;
  email?: string;
  password?: string;
};

export default function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [registered, setRegistered] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function validate(): boolean {
    const errors: FieldErrors = {};

    if (name.trim().length > 100) {
      errors.name = 'Name must be at most 100 characters.';
    }
    if (!EMAIL_PATTERN.test(email.trim())) {
      errors.email = 'Enter a valid email address.';
    }
    const failedRules = PASSWORD_RULES.filter((rule) => !rule.test(password));
    if (failedRules.length > 0) {
      errors.password = `Password must contain ${failedRules.map((rule) => rule.message).join(', ')}.`;
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
      const response = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          password,
          name: name.trim() === '' ? undefined : name.trim(),
        }),
      });

      if (response.status === 201) {
        setRegistered(true);
        return;
      }
      if (response.status === 409) {
        setFieldErrors({ email: 'An account with this email already exists.' });
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

  if (registered) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
        <main className="flex w-full max-w-md flex-col gap-4 rounded-2xl bg-white p-10 text-center shadow-sm dark:bg-zinc-950">
          <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">Account created</h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            Your account was registered successfully. You can now sign in.
          </p>
          <Link
            href="/login"
            className="mt-2 flex h-11 items-center justify-center rounded-full bg-foreground px-5 font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
          >
            Go to sign in
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-md flex-col gap-6 rounded-2xl bg-white p-10 shadow-sm dark:bg-zinc-950">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
            Create your account
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Register with your email and a password.
          </p>
        </div>

        <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="name" className="text-sm font-medium text-black dark:text-zinc-50">
              Name <span className="font-normal text-zinc-500">(optional)</span>
            </label>
            <input
              id="name"
              name="name"
              type="text"
              autoComplete="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="h-11 rounded-lg border border-black/[.08] bg-transparent px-3 text-black outline-none transition-colors focus:border-black/40 dark:border-white/[.145] dark:text-zinc-50 dark:focus:border-white/40"
            />
            {fieldErrors.name && (
              <p className="text-sm text-red-600 dark:text-red-400">{fieldErrors.name}</p>
            )}
          </div>

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
              autoComplete="new-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="h-11 rounded-lg border border-black/[.08] bg-transparent px-3 text-black outline-none transition-colors focus:border-black/40 dark:border-white/[.145] dark:text-zinc-50 dark:focus:border-white/40"
            />
            {fieldErrors.password ? (
              <p className="text-sm text-red-600 dark:text-red-400">{fieldErrors.password}</p>
            ) : (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                At least 8 characters, with at least one letter and one number.
              </p>
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
            {submitting ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="text-center text-sm text-zinc-600 dark:text-zinc-400">
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-zinc-950 underline dark:text-zinc-50">
            Sign in
          </Link>
        </p>
      </main>
    </div>
  );
}
