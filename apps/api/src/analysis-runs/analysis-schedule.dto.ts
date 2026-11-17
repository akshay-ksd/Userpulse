import { z } from 'zod';

const SUPPORTED_INTERVALS = [24, 168] as const;

export const upsertScheduleSchema = z.object({
  intervalHours: z
    .number()
    .refine(
      (v): v is (typeof SUPPORTED_INTERVALS)[number] =>
        (SUPPORTED_INTERVALS as readonly number[]).includes(v),
      {
        message: `intervalHours must be one of: ${SUPPORTED_INTERVALS.join(', ')} (daily or weekly)`,
      },
    ),
  enabled: z.boolean().optional().default(true),
});

export type UpsertScheduleDto = z.output<typeof upsertScheduleSchema>;
