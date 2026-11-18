import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { HealthMetricsController } from './health-metrics.controller.js';
import { PlatformHealthService } from './platform-health.service.js';

describe('HealthMetricsController', () => {
  let controller: HealthMetricsController;
  let platformHealth: PlatformHealthService;
  const originalEnv = process.env.INTERNAL_METRICS_TOKEN;

  beforeEach(() => {
    platformHealth = {
      getAggregatedMetrics: vi.fn().mockResolvedValue({
        api: {},
        eventProcessing: {},
        analysisRuns: {},
        retention: {},
        dataDeletion: {},
        database: {},
        alerts: [],
      }),
    } as unknown as PlatformHealthService;
    controller = new HealthMetricsController(platformHealth);
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.INTERNAL_METRICS_TOKEN = originalEnv;
    } else {
      delete process.env.INTERNAL_METRICS_TOKEN;
    }
  });

  it('rejects request without internal token', async () => {
    process.env.INTERNAL_METRICS_TOKEN = 'secret-token';
    await expect(controller.getHealthMetrics(undefined)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('rejects request with wrong token', async () => {
    process.env.INTERNAL_METRICS_TOKEN = 'secret-token';
    await expect(controller.getHealthMetrics('wrong-token')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('returns metrics with valid token', async () => {
    process.env.INTERNAL_METRICS_TOKEN = 'secret-token';
    const result = await controller.getHealthMetrics('secret-token');
    expect(result).toHaveProperty('api');
    expect(result).toHaveProperty('alerts');
    expect(platformHealth.getAggregatedMetrics).toHaveBeenCalled();
  });

  it('rejects when no token is configured', async () => {
    delete process.env.INTERNAL_METRICS_TOKEN;
    await expect(controller.getHealthMetrics('any-token')).rejects.toThrow(
      ForbiddenException,
    );
  });
});
