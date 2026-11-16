import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { AnalyticsController } from '../analytics.controller.js';
import type { AnalyticsService } from '../analytics.service.js';

describe('AnalyticsController', () => {
  let controller: AnalyticsController;
  let service: {
    getEventActivity: ReturnType<typeof vi.fn>;
    getActiveUsers: ReturnType<typeof vi.fn>;
  };
  const user = { id: 'user1', email: 'test@example.com', name: 'Test' };

  beforeEach(() => {
    service = { getEventActivity: vi.fn(), getActiveUsers: vi.fn() };
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
});
