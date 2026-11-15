import { z } from 'zod';

export const updateFeatureSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  status: z.enum(['ACTIVE', 'ARCHIVED']).optional(),
});

export type UpdateFeatureDto = z.infer<typeof updateFeatureSchema>;
