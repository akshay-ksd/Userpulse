import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Logger } from '@nestjs/common';
import { IngestionService } from './ingestion.service.js';

describe('IngestionService', () => {
  let service: IngestionService;
  let warn: ReturnType<typeof vi.spyOn>;
  let prisma: {
    $transaction: ReturnType<typeof vi.fn>;
    eventBatch: { create: ReturnType<typeof vi.fn> };
    projectApiKey: { update: ReturnType<typeof vi.fn> };
  };

  beforeEach(() => {
    prisma = {
      $transaction: vi.fn().mockResolvedValue([{ id: 'batch-1' }, {}]),
      eventBatch: { create: vi.fn() },
      projectApiKey: { update: vi.fn() },
    };
    warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    service = new IngestionService(prisma as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const timestamp = new Date().toISOString();
  const events = [
    {
      eventId: '550e8400-e29b-41d4-a716-446655440000',
      eventName: 'click',
      timestamp,
      anonymousId: 'anon-1',
    },
    {
      eventId: '550e8400-e29b-41d4-a716-446655440001',
      eventName: 'page_view',
      timestamp,
      anonymousId: 'anon-1',
    },
  ];
  const invalidEvent = {
    eventId: '550e8400-e29b-41d4-a716-446655440002',
    eventName: 'secret_event',
    timestamp,
    properties: { email: 'person@example.com' },
  };

  function createData() {
    return prisma.eventBatch.create.mock.calls[0]![0].data;
  }

  it('stores batch and returns event counts', async () => {
    const result = await service.submitBatch(
      'proj-1',
      'org-1',
      'key-1',
      events,
    );
    expect(result).toEqual({
      eventCount: 2,
      validEventCount: 2,
      invalidEventCount: 0,
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it('calls $transaction with batch create and lastUsedAt update', async () => {
    await service.submitBatch('proj-1', 'org-1', 'key-1', events);
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    const args = prisma.$transaction.mock.calls[0]![0];
    expect(args).toHaveLength(2);
  });

  it('stores normalized valid events with tenant scope from the credential', async () => {
    await service.submitBatch('proj-1', 'org-1', 'key-1', events);

    const data = createData();
    expect(data.status).toBe('PENDING');
    expect(data.validEventCount).toBe(2);
    expect(data.invalidEventCount).toBe(0);
    expect(data.invalidEvents).toEqual([]);
    expect(data.validEvents).toHaveLength(2);
    for (const event of data.validEvents) {
      expect(event).toMatchObject({
        organizationId: 'org-1',
        projectId: 'proj-1',
      });
      expect(event.ingestedAt).toEqual(expect.any(String));
    }
  });

  it('isolates invalid events and keeps the batch PENDING when some are valid', async () => {
    const result = await service.submitBatch('proj-1', 'org-1', 'key-1', [
      ...events,
      invalidEvent,
    ]);

    expect(result).toEqual({
      eventCount: 3,
      validEventCount: 2,
      invalidEventCount: 1,
    });
    const data = createData();
    expect(data.status).toBe('PENDING');
    expect(data.invalidEvents).toEqual([
      { eventId: invalidEvent.eventId, errors: ['identity_missing'] },
    ]);
  });

  it('marks the batch INVALID when every event fails validation', async () => {
    await service.submitBatch('proj-1', 'org-1', 'key-1', [invalidEvent]);

    const data = createData();
    expect(data.status).toBe('INVALID');
    expect(data.validEventCount).toBe(0);
    expect(data.validEvents).toEqual([]);
  });

  it('logs validation failures as counts and codes without event content', async () => {
    await service.submitBatch('proj-1', 'org-1', 'key-1', [
      ...events,
      invalidEvent,
    ]);

    expect(warn).toHaveBeenCalledOnce();
    const logged = warn.mock.calls[0]![0];
    expect(logged).toMatchObject({
      batchId: 'batch-1',
      projectId: 'proj-1',
      eventCount: 3,
      invalidEventCount: 1,
      errorCounts: { identity_missing: 1 },
    });
    const serialized = JSON.stringify(logged);
    expect(serialized).not.toContain('person@example.com');
    expect(serialized).not.toContain('secret_event');
    expect(serialized).not.toContain('anon-1');
  });
});
