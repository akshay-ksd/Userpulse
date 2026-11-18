import { z } from 'zod';

const funnelStepSchema = z.object({
  eventName: z.string().trim().min(1).max(500),
});

export const updateFunnelSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  steps: z.array(funnelStepSchema).min(2).max(20).optional(),
});

export type UpdateFunnelDto = z.infer<typeof updateFunnelSchema>;
