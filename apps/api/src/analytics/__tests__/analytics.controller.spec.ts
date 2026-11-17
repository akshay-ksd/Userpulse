import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { AnalyticsController } from '../analytics.controller.js';
import type { AnalyticsService } from '../analytics.service.js';

describe('AnalyticsController', () => {
  let controller: AnalyticsController;
  let service: {
    getEventActivity: ReturnType<typeof vi.fn>;
    getActiveUsers: ReturnType<typeof vi.fn>;
    getFeatureAdoption: ReturnType<typeof vi.fn>;
    getFeatureUsageTrends: ReturnType<typeof vi.fn>;
    getActivityChanges: ReturnType<typeof vi.fn>;
  };
  const user = { id: 'user1', email: 'test@example.com', name: 'Test' };

  beforeEach(() => {
    service = {
      getEventActivity: vi.fn(),
      getActiveUsers: vi.fn(),
      getFeatureAdoption: vi.fn(),
      getFeatureUsageTrends: vi.fn(),
      getActivityChanges: vi.fn(),
    };
    controller = new AnalyticsController(
      service as unknown as AnalyticsService,
    );
  });

  it('returns event activity for valid params', async () => {
    const result = {
      total: 42,
      daily: [{ date: '2026-11-15', count: 42 }],
      startDate: '2026-11-15',
      endDate: '2026-11-15',
    };
    service.getEventActivity.mockResolvedValue(result);

    const response = await controller.getEventActivity(
      user as any,
      'org1',
      'proj1',
      { startDate: '2026-11-15', endDate: '2026-11-15' },
    );

    expect(response).toEqual(result);
    expect(service.getEventActivity).toHaveBeenCalledWith(
      'org1',
      'proj1',
      'user1',
      '2026-11-15',
      '2026-11-15',
    );
  });

  it('throws BadRequestException for missing startDate', async () => {
    await expect(
      controller.getEventActivity(user as any, 'org1', 'proj1', {
        endDate: '2026-11-15',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws BadRequestException for invalid date format', async () => {
    await expect(
      controller.getEventActivity(user as any, 'org1', 'proj1', {
        startDate: 'not-a-date',
        endDate: '2026-11-15',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws BadRequestException when endDate is before startDate', async () => {
    await expect(
      controller.getEventActivity(user as any, 'org1', 'proj1', {
        startDate: '2026-11-15',
        endDate: '2026-11-10',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws BadRequestException when range exceeds 365 days', async () => {
    await expect(
      controller.getEventActivity(user as any, 'org1', 'proj1', {
        startDate: '2025-01-01',
        endDate: '2026-11-15',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('returns active users for valid params', async () => {
    const result = {
      total: 5,
      daily: [{ date: '2026-11-15', count: 5 }],
      startDate: '2026-11-15',
      endDate: '2026-11-15',
      definition: 'An active user is...',
    };
    service.getActiveUsers.mockResolvedValue(result);

    const response = await controller.getActiveUsers(
      user as any,
      'org1',
      'proj1',
      { startDate: '2026-11-15', endDate: '2026-11-15' },
    );

    expect(response).toEqual(result);
    expect(service.getActiveUsers).toHaveBeenCalledWith(
      'org1',
      'proj1',
      'user1',
      '2026-11-15',
      '2026-11-15',
    );
  });

  it('throws BadRequestException for missing dates on active-users', async () => {
    await expect(
      controller.getActiveUsers(user as any, 'org1', 'proj1', {
        endDate: '2026-11-15',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('returns feature adoption for valid params', async () => {
    const result = {
      features: [
        {
          featureId: 'f1',
          featureName: 'Login',
          adoptionRate: 50,
          featureUsers: 5,
          totalUsers: 10,
        },
      ],
      totalActiveUsers: 10,
      startDate: '2026-11-15',
      endDate: '2026-11-15',
      definition: 'Feature adoption rate...',
    };
    service.getFeatureAdoption.mockResolvedValue(result);

    const response = await controller.getFeatureAdoption(
      user as any,
      'org1',
      'proj1',
      { startDate: '2026-11-15', endDate: '2026-11-15' },
    );

    expect(response).toEqual(result);
    expect(service.getFeatureAdoption).toHaveBeenCalledWith(
      'org1',
      'proj1',
      'user1',
      '2026-11-15',
      '2026-11-15',
    );
  });

  it('throws BadRequestException for missing dates on feature-adoption', async () => {
    await expect(
      controller.getFeatureAdoption(user as any, 'org1', 'proj1', {
        endDate: '2026-11-15',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('returns feature usage trends for valid params', async () => {
    const result = {
      featureId: 'f1',
      featureName: 'Login',
      total: 42,
      daily: [{ date: '2026-11-15', count: 42 }],
      startDate: '2026-11-15',
      endDate: '2026-11-15',
    };
    service.getFeatureUsageTrends.mockResolvedValue(result);

    const response = await controller.getFeatureUsageTrends(
      user as any,
      'org1',
      'proj1',
      { startDate: '2026-11-15', endDate: '2026-11-15', featureId: 'f1' },
    );

    expect(response).toEqual(result);
    expect(service.getFeatureUsageTrends).toHaveBeenCalledWith(
      'org1',
      'proj1',
      'user1',
      'f1',
      '2026-11-15',
      '2026-11-15',
    );
  });

  it('throws BadRequestException for missing featureId on feature-usage-trends', async () => {
    await expect(
      controller.getFeatureUsageTrends(user as any, 'org1', 'proj1', {
        startDate: '2026-11-15',
        endDate: '2026-11-15',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws BadRequestException for missing dates on feature-usage-trends', async () => {
    await expect(
      controller.getFeatureUsageTrends(user as any, 'org1', 'proj1', {
        featureId: 'f1',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('returns activity changes for valid params', async () => {
    const result = {
      overall: {
        currentTotal: 100,
        baselineTotal: 80,
        direction: 'increase',
        percentChange: 25,
      },
      changes: [],
      significantChanges: [],
      currentPeriod: { startDate: '2026-11-08', endDate: '2026-11-14' },
      baselinePeriod: { startDate: '2026-11-01', endDate: '2026-11-07' },
      method: 'Activity comparison...',
      insufficientData: false,
    };
    service.getActivityChanges.mockResolvedValue(result);

    const response = await controller.getActivityChanges(
      user as any,
      'org1',
      'proj1',
      { startDate: '2026-11-08', endDate: '2026-11-14' },
    );

    expect(response).toEqual(result);
    expect(service.getActivityChanges).toHaveBeenCalledWith(
      'org1',
      'proj1',
      'user1',
      '2026-11-08',
      '2026-11-14',
    );
  });

  it('throws BadRequestException for missing dates on activity-changes', async () => {
    await expect(
      controller.getActivityChanges(user as any, 'org1', 'proj1', {
        endDate: '2026-11-14',
      }),
    ).rejects.toThrow(BadRequestException);
  });
});
