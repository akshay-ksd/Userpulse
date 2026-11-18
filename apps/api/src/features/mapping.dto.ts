import { z } from 'zod';

export const setMappingsSchema = z.object({
  eventNames: z.array(z.string().trim().min(1).max(200)).min(0).max(100),
});

export type SetMappingsDto = z.infer<typeof setMappingsSchema>;
