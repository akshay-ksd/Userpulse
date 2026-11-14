import { describe, expect, it } from 'vitest';
import { registerSchema } from './register.dto.js';

describe('registerSchema', () => {
  it('accepts valid input and normalizes the email', () => {
    const result = registerSchema.parse({
      email: '  Jane@Example.COM ',
      password: 'password1',
      name: ' Jane ',
    });

    expect(result).toEqual({
      email: 'jane@example.com',
      password: 'password1',
      name: 'Jane',
    });
  });

  it('allows the name to be omitted', () => {
    const result = registerSchema.parse({
      email: 'jane@example.com',
      password: 'password1',
    });

    expect(result.name).toBeUndefined();
  });

  it('rejects an invalid email address', () => {
    const result = registerSchema.safeParse({
      email: 'not-an-email',
      password: 'password1',
    });

    expect(result.success).toBe(false);
  });

  it.each([
    ['too short', 'pass1'],
    ['no letter', '12345678'],
    ['no number', 'password'],
    ['too long', `${'a1'.repeat(36)}x`],
  ])('rejects a password that is %s', (_case, password) => {
    const result = registerSchema.safeParse({
      email: 'jane@example.com',
      password,
    });

    expect(result.success).toBe(false);
  });

  it('rejects a blank name', () => {
    const result = registerSchema.safeParse({
      email: 'jane@example.com',
      password: 'password1',
      name: '   ',
    });

    expect(result.success).toBe(false);
  });

  it('strips unknown properties', () => {
    const result = registerSchema.parse({
      email: 'jane@example.com',
      password: 'password1',
      role: 'admin',
    });

    expect(result).not.toHaveProperty('role');
  });
});
