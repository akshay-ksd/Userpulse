import { z } from 'zod';

const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;

export const eventActivityQuerySchema = z
  .object({
    startDate: z
      .string()
      .regex(isoDateRegex, 'startDate must be YYYY-MM-DD format'),
    endDate: z
      .string()
      .regex(isoDateRegex, 'endDate must be YYYY-MM-DD format'),
  })
  .refine((data) => data.endDate >= data.startDate, {
    message: 'endDate must not be before startDate',
  })
  .refine(
    (data) => {
      const start = new Date(data.startDate);
      const end = new Date(data.endDate);
      const diffDays =
        (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
      return diffDays <= 365;
    },
    { message: 'Date range must not exceed 365 days' },
  );

export type EventActivityQueryDto = z.infer<typeof eventActivityQuerySchema>;

export const featureUsageTrendsQuerySchema = z
  .object({
    startDate: z
      .string()
      .regex(isoDateRegex, 'startDate must be YYYY-MM-DD format'),
    endDate: z
      .string()
      .regex(isoDateRegex, 'endDate must be YYYY-MM-DD format'),
    featureId: z.string().min(1, 'featureId is required'),
  })
  .refine((data) => data.endDate >= data.startDate, {
    message: 'endDate must not be before startDate',
  })
  .refine(
    (data) => {
      const start = new Date(data.startDate);
      const end = new Date(data.endDate);
      const diffDays =
        (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
      return diffDays <= 365;
    },
    { message: 'Date range must not exceed 365 days' },
  );

export type FeatureUsageTrendsQueryDto = z.infer<
  typeof featureUsageTrendsQuerySchema
>;
