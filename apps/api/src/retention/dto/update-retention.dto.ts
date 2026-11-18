import { z } from 'zod';

export const updateRetentionSchema = z.object({
  eventRetentionDays: z.number().int().min(30).max(3650),
});

export type UpdateRetentionDto = z.infer<typeof updateRetentionSchema>;
