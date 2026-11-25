import { z } from 'zod';

const eventSchema = z.object({
  eventId: z.string().uuid(),
  eventName: z.string().min(1).max(500),
  timestamp: z.string().datetime(),
  anonymousId: z.string().max(200).optional(),
  userId: z.string().max(200).optional(),
  properties: z.record(z.string(), z.unknown()).optional(),
  description: z.string().max(1000).optional(),
  featureName: z.string().max(200).optional(),
  sdkVersion: z.string().max(50).optional(),
});

export const submitEventsSchema = z.object({
  batch: z.array(eventSchema).min(1).max(100),
});

export type SubmitEventsDto = z.infer<typeof submitEventsSchema>;
export type EventDto = z.infer<typeof eventSchema>;
