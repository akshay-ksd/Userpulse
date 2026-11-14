import { describe, expect, it } from 'vitest';
import { appendSuffix, generateSlug } from './slug.js';

describe('generateSlug', () => {
  it('lowercases and replaces spaces with hyphens', () => {
    expect(generateSlug('My Company')).toBe('my-company');
  });

  it('strips special characters', () => {
    expect(generateSlug('Acme & Co.')).toBe('acme-co');
  });

  it('collapses multiple hyphens', () => {
    expect(generateSlug('  hello   world  ')).toBe('hello-world');
  });

  it('truncates to 60 characters', () => {
    const long = 'a'.repeat(80);
    expect(generateSlug(long).length).toBe(60);
  });

  it('returns empty string for purely special characters', () => {
    expect(generateSlug('!!!')).toBe('');
  });
});

describe('appendSuffix', () => {
  it('appends a 6-char hex suffix', () => {
    const result = appendSuffix('my-company');
    expect(result).toMatch(/^my-company-[a-f0-9]{6}$/);
  });

  it('truncates the base to avoid exceeding 60 chars', () => {
    const long = 'a'.repeat(60);
    const result = appendSuffix(long);
    expect(result.length).toBeLessThanOrEqual(60);
  });
});
