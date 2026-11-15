import { randomBytes } from 'node:crypto';

export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 60);
}

export function appendSuffix(slug: string): string {
  const suffix = randomBytes(3).toString('hex');
  const base = slug.slice(0, 53);
  return `${base}-${suffix}`;
}
