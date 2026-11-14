import { z } from 'zod';

export const createInvitationSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  role: z.enum(['ADMIN', 'MEMBER']).optional().default('MEMBER'),
});

export type CreateInvitationDto = z.infer<typeof createInvitationSchema>;
