import { z } from 'zod';

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('Invalid email address')),
});

export type ForgotPasswordDto = z.infer<typeof forgotPasswordSchema>;
