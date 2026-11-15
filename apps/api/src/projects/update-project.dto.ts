import { z } from 'zod';

export const updateProjectSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  status: z.enum(['ACTIVE', 'ARCHIVED']).optional(),
});

export type UpdateProjectDto = z.infer<typeof updateProjectSchema>;
