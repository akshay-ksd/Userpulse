import { z } from 'zod';

const eventSchema = z.object({
  eventId: z.string().uuid(),
  eventName: z.string().min(1).max(200),
  timestamp: z.string().datetime(),
  anonymousId: z.string().optional(),
  userId: z.string().optional(),
  sessionId: z.string().optional(),
  properties: z.record(z.string(), z.unknown()).optional(),
  pageName: z.string().optional(),
  pagePath: z.string().optional(),
  sdkVersion: z.string().optional(),
});

export const submitBatchSchema = z.object({
  batch: z.array(eventSchema).min(1).max(100),
});

export type SubmitBatchDto = z.infer<typeof submitBatchSchema>;
export type EventDto = z.infer<typeof eventSchema>;
