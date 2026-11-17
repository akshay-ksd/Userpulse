import { z } from 'zod';

export const requestAnalysisSchema = z
  .object({
    periodStart: z.string().datetime().optional(),
    periodEnd: z.string().datetime().optional(),
  })
  .transform((val) => {
    const now = new Date();
    const end = val.periodEnd ? new Date(val.periodEnd) : now;
    const start = val.periodStart
      ? new Date(val.periodStart)
      : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    return { periodStart: start, periodEnd: end };
  })
  .refine((val) => val.periodStart < val.periodEnd, {
    message: 'periodStart must be before periodEnd',
  })
  .refine(
    (val) =>
      val.periodEnd.getTime() - val.periodStart.getTime() <=
      90 * 24 * 60 * 60 * 1000,
    { message: 'Analysis period cannot exceed 90 days' },
  )
  .refine((val) => val.periodEnd.getTime() <= Date.now() + 60 * 60 * 1000, {
    message: 'periodEnd cannot be more than 1 hour in the future',
  });

export type RequestAnalysisDto = z.output<typeof requestAnalysisSchema>;
