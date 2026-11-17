import { z } from 'zod';

const funnelStepSchema = z.object({
  eventName: z.string().trim().min(1).max(500),
});

export const createFunnelSchema = z.object({
  name: z.string().trim().min(1).max(200),
  steps: z.array(funnelStepSchema).min(2).max(20),
});

export type CreateFunnelDto = z.infer<typeof createFunnelSchema>;
