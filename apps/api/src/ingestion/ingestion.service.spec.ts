import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IngestionService } from './ingestion.service.js';

describe('IngestionService', () => {
  let service: IngestionService;
  let prisma: {
    $transaction: ReturnType<typeof vi.fn>;
    eventBatch: { create: ReturnType<typeof vi.fn> };
    projectApiKey: { update: ReturnType<typeof vi.fn> };
  };

  beforeEach(() => {
    prisma = {
      $transaction: vi.fn().mockResolvedValue([{}, {}]),
      eventBatch: { create: vi.fn() },
      projectApiKey: { update: vi.fn() },
    };
    service = new IngestionService(prisma as never);
  });

  const events = [
    {
      eventId: '550e8400-e29b-41d4-a716-446655440000',
      eventName: 'click',
      timestamp: '2026-11-15T10:00:00.000Z',
      anonymousId: 'anon-1',
    },
    {
      eventId: '550e8400-e29b-41d4-a716-446655440001',
      eventName: 'page_view',
      timestamp: '2026-11-15T10:00:01.000Z',
      anonymousId: 'anon-1',
    },
  ];

  it('stores batch and returns event count', async () => {
    const result = await service.submitBatch(
      'proj-1',
      'org-1',
      'key-1',
      events,
    );
    expect(result).toEqual({ eventCount: 2 });
  });

  it('calls $transaction with batch create and lastUsedAt update', async () => {
    await service.submitBatch('proj-1', 'org-1', 'key-1', events);
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    const args = prisma.$transaction.mock.calls[0]![0];
    expect(args).toHaveLength(2);
  });
});
