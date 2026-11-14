import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('Invalid email address')),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password must be at most 72 characters')
    .regex(/[A-Za-z]/, 'Password must contain at least one letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  name: z.string().trim().min(1, 'Name must not be empty').max(100).optional(),
});

export type RegisterDto = z.infer<typeof registerSchema>;
