import { z } from 'zod';

export const signInSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('Invalid email address')),
  // No password policy here: a password set under older rules must still work.
  password: z.string().min(1, 'Password is required'),
});

export type SignInDto = z.infer<typeof signInSchema>;
