import { Prisma } from '@userpulse/database';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { EventValidationService } from './event-validation.service.js';
import { IngestionService } from './ingestion.service.js';
import type { EventDto } from './submit-events.dto.js';

function mockPrisma() {
  return {
    event: {
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    projectApiKey: {
      update: vi.fn().mockResolvedValue({}),
    },
  } as unknown as PrismaService;
}

function makeEvent(overrides: Partial<EventDto> = {}): EventDto {
  return {
    eventId: '550e8400-e29b-41d4-a716-446655440000',
    eventName: 'button_click',
    timestamp: '2026-11-15T10:00:00.000Z',
    anonymousId: 'anon-1',
    sdkVersion: '0.1.0',
    ...overrides,
  };
}

describe('IngestionService', () => {
  function createService(prisma?: PrismaService) {
    const p = prisma ?? mockPrisma();
    const validation = new EventValidationService();
    return { service: new IngestionService(p, validation), prisma: p };
  }

  it('accepts a valid batch and returns the count', async () => {
    const prisma = mockPrisma();
    (prisma.event.createMany as ReturnType<typeof vi.fn>).mockResolvedValue({
      count: 2,
    });
    const { service } = createService(prisma);
    const batch = [
      makeEvent(),
      makeEvent({ eventId: '550e8400-e29b-41d4-a716-446655440001' }),
    ];

    const result = await service.submitBatch('org-1', 'proj-1', 'key-1', batch);

    expect(result.accepted).toBe(2);
    expect(result.rejected).toBe(0);
    expect(result.duplicates).toBe(0);
    expect(prisma.event.createMany).toHaveBeenCalled();
  });

  it('inserts events with correct org and project context', async () => {
    const prisma = mockPrisma();
    (prisma.event.createMany as ReturnType<typeof vi.fn>).mockResolvedValue({
      count: 1,
    });
    const { service } = createService(prisma);
    const batch = [
      makeEvent({ userId: 'user-42', properties: { page: '/home' } }),
    ];

    await service.submitBatch('org-1', 'proj-1', 'key-1', batch);

    const call = (prisma.event.createMany as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    const inserted = call.data[0];
    expect(inserted.organizationId).toBe('org-1');
    expect(inserted.projectId).toBe('proj-1');
    expect(inserted.eventId).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(inserted.eventName).toBe('button_click');
    expect(inserted.userId).toBe('user-42');
    expect(inserted.properties).toEqual({ page: '/home' });
    expect(inserted.eventTimestamp).toBeInstanceOf(Date);
    expect(inserted.validationStatus).toBe('VALID');
    expect(inserted.processingStatus).toBe('PENDING');
  });

  it('passes skipDuplicates: true to createMany', async () => {
    const prisma = mockPrisma();
    (prisma.event.createMany as ReturnType<typeof vi.fn>).mockResolvedValue({
      count: 1,
    });
    const { service } = createService(prisma);

    await service.submitBatch('org-1', 'proj-1', 'key-1', [makeEvent()]);

    expect(prisma.event.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true }),
    );
  });

  it('reports duplicates when createMany inserts fewer than submitted', async () => {
    const prisma = mockPrisma();
    (prisma.event.createMany as ReturnType<typeof vi.fn>).mockResolvedValue({
      count: 1,
    });
    const { service } = createService(prisma);
    const batch = [
      makeEvent(),
      makeEvent({ eventId: '550e8400-e29b-41d4-a716-446655440001' }),
      makeEvent({ eventId: '550e8400-e29b-41d4-a716-446655440002' }),
    ];

    const result = await service.submitBatch('org-1', 'proj-1', 'key-1', batch);

    expect(result.accepted).toBe(1);
    expect(result.duplicates).toBe(2);
    expect(result.rejected).toBe(0);
  });

  it('returns zero duplicates when all events are new', async () => {
    const prisma = mockPrisma();
    (prisma.event.createMany as ReturnType<typeof vi.fn>).mockResolvedValue({
      count: 2,
    });
    const { service } = createService(prisma);
    const batch = [
      makeEvent(),
      makeEvent({ eventId: '550e8400-e29b-41d4-a716-446655440001' }),
    ];

    const result = await service.submitBatch('org-1', 'proj-1', 'key-1', batch);

    expect(result.accepted).toBe(2);
    expect(result.duplicates).toBe(0);
  });

  it('updates lastUsedAt on the API key', async () => {
    const prisma = mockPrisma();
    (prisma.event.createMany as ReturnType<typeof vi.fn>).mockResolvedValue({
      count: 1,
    });
    const { service } = createService(prisma);

    await service.submitBatch('org-1', 'proj-1', 'key-1', [makeEvent()]);

    expect(prisma.projectApiKey.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'key-1' },
        data: expect.objectContaining({ lastUsedAt: expect.any(Date) }),
      }),
    );
  });

  it('does not fail if lastUsedAt update fails', async () => {
    const prisma = mockPrisma();
    (prisma.event.createMany as ReturnType<typeof vi.fn>).mockResolvedValue({
      count: 1,
    });
    (prisma.projectApiKey.update as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('DB error'),
    );
    const { service } = createService(prisma);

    const result = await service.submitBatch('org-1', 'proj-1', 'key-1', [
      makeEvent(),
    ]);

    expect(result.accepted).toBe(1);
    expect(result.rejected).toBe(0);
    expect(result.duplicates).toBe(0);
  });

  it('handles optional fields as null when not provided', async () => {
    const prisma = mockPrisma();
    (prisma.event.createMany as ReturnType<typeof vi.fn>).mockResolvedValue({
      count: 1,
    });
    const { service } = createService(prisma);
    const batch = [
      makeEvent({
        anonymousId: undefined,
        userId: undefined,
        properties: undefined,
        sdkVersion: undefined,
      }),
    ];

    await service.submitBatch('org-1', 'proj-1', 'key-1', batch);

    const call = (prisma.event.createMany as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    const inserted = call.data[0];
    expect(inserted.anonymousId).toBeNull();
    expect(inserted.userId).toBeNull();
    expect(inserted.properties).toBe(Prisma.JsonNull);
    expect(inserted.sdkVersion).toBeNull();
  });

  it('rejects invalid events and accepts valid ones in the same batch', async () => {
    const prisma = mockPrisma();
    (prisma.event.createMany as ReturnType<typeof vi.fn>).mockResolvedValue({
      count: 1,
    });
    const { service } = createService(prisma);
    const batch = [
      makeEvent(),
      makeEvent({
        eventId: '550e8400-e29b-41d4-a716-446655440001',
        eventName: '   ',
      }),
    ];

    const result = await service.submitBatch('org-1', 'proj-1', 'key-1', batch);

    expect(result.accepted).toBe(1);
    expect(result.rejected).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors![0].index).toBe(1);
    expect(result.errors![0].error).toContain('eventName');
  });

  it('rejects all events when all are invalid', async () => {
    const { service } = createService();
    const batch = [
      makeEvent({ eventName: '   ' }),
      makeEvent({
        eventId: '550e8400-e29b-41d4-a716-446655440001',
        eventName: '',
      }),
    ];

    const result = await service.submitBatch('org-1', 'proj-1', 'key-1', batch);

    expect(result.accepted).toBe(0);
    expect(result.rejected).toBe(2);
  });

  it('strips tenant IDs from properties', async () => {
    const prisma = mockPrisma();
    (prisma.event.createMany as ReturnType<typeof vi.fn>).mockResolvedValue({
      count: 1,
    });
    const { service } = createService(prisma);
    const batch = [
      makeEvent({
        properties: {
          organizationId: 'org-hack',
          projectId: 'proj-hack',
          safe: 'keep',
        },
      }),
    ];

    await service.submitBatch('org-1', 'proj-1', 'key-1', batch);

    const call = (prisma.event.createMany as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    const inserted = call.data[0];
    expect(inserted.properties).toEqual({ safe: 'keep' });
  });

  it('stores rejected events with REJECTED status and error', async () => {
    const { service, prisma } = createService();
    const batch = [makeEvent({ eventName: '   ' })];

    await service.submitBatch('org-1', 'proj-1', 'key-1', batch);

    const call = (prisma.event.createMany as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    const inserted = call.data[0];
    expect(inserted.validationStatus).toBe('REJECTED');
    expect(inserted.validationError).toContain('eventName');
    expect(inserted.processingStatus).toBe('REJECTED');
  });
});
