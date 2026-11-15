process.env.DATABASE_URL ??=
  'postgresql://postgres:postgres@localhost:5432/userpulse?schema=public';

import { randomBytes, createHash } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

describe('Ingestion (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.eventBatch.deleteMany();
    await prisma.projectApiKey.deleteMany();
    await prisma.project.deleteMany();
    await prisma.organizationInvitation.deleteMany();
    await prisma.organizationMember.deleteMany();
    await prisma.organization.deleteMany();
    await prisma.passwordResetToken.deleteMany();
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await app.close();
  });

  function validEvent(overrides?: Record<string, unknown>) {
    return {
      eventId: crypto.randomUUID(),
      eventName: 'button_click',
      timestamp: new Date().toISOString(),
      anonymousId: 'anon-123',
      sdkVersion: '0.1.0',
      ...overrides,
    };
  }

  async function createProjectWithKey(): Promise<{
    orgId: string;
    projectId: string;
    rawKey: string;
    keyId: string;
  }> {
    const org = await prisma.organization.create({
      data: { name: 'Test Org', slug: 'test-org-ingestion' },
    });
    const user = await prisma.user.create({
      data: {
        email: 'dev@example.com',
        passwordHash: 'hash',
        name: 'Dev',
      },
    });
    await prisma.organizationMember.create({
      data: {
        organizationId: org.id,
        userId: user.id,
        role: 'OWNER',
      },
    });
    const project = await prisma.project.create({
      data: {
        organizationId: org.id,
        name: 'Test Project',
        status: 'ACTIVE',
      },
    });

    const rawKey = randomBytes(32).toString('base64url');
    const keyHash = createHash('sha256').update(rawKey).digest('hex');
    const apiKey = await prisma.projectApiKey.create({
      data: {
        projectId: project.id,
        name: 'Test Key',
        keyHash,
        keyPrefix: rawKey.slice(0, 8),
        createdBy: user.id,
      },
    });

    return {
      orgId: org.id,
      projectId: project.id,
      rawKey,
      keyId: apiKey.id,
    };
  }

  it('accepts a valid batch (202)', async () => {
    const { rawKey, projectId } = await createProjectWithKey();

    const response = await request(app.getHttpServer())
      .post('/v1/events')
      .set('Authorization', `Bearer ${rawKey}`)
      .send({ batch: [validEvent()] })
      .expect(202);

    expect(response.body).toEqual({
      accepted: true,
      eventCount: 1,
    });

    const batches = await prisma.eventBatch.findMany({
      where: { projectId },
    });
    expect(batches).toHaveLength(1);
    expect(batches[0].eventCount).toBe(1);
    expect(batches[0].status).toBe('PENDING');
  });

  it('rejects missing Authorization header (401)', async () => {
    await request(app.getHttpServer())
      .post('/v1/events')
      .send({ batch: [validEvent()] })
      .expect(401);
  });

  it('rejects invalid API key (401)', async () => {
    await request(app.getHttpServer())
      .post('/v1/events')
      .set('Authorization', 'Bearer invalid-key')
      .send({ batch: [validEvent()] })
      .expect(401);
  });

  it('rejects revoked API key (401)', async () => {
    const { rawKey, keyId } = await createProjectWithKey();
    await prisma.projectApiKey.update({
      where: { id: keyId },
      data: { revokedAt: new Date() },
    });

    await request(app.getHttpServer())
      .post('/v1/events')
      .set('Authorization', `Bearer ${rawKey}`)
      .send({ batch: [validEvent()] })
      .expect(401);
  });

  it('rejects archived project (403)', async () => {
    const { rawKey, projectId } = await createProjectWithKey();
    await prisma.project.update({
      where: { id: projectId },
      data: { status: 'ARCHIVED' },
    });

    await request(app.getHttpServer())
      .post('/v1/events')
      .set('Authorization', `Bearer ${rawKey}`)
      .send({ batch: [validEvent()] })
      .expect(403);
  });

  it('rejects empty batch (400)', async () => {
    const { rawKey } = await createProjectWithKey();

    await request(app.getHttpServer())
      .post('/v1/events')
      .set('Authorization', `Bearer ${rawKey}`)
      .send({ batch: [] })
      .expect(400);
  });

  it('rejects batch over 100 events (400)', async () => {
    const { rawKey } = await createProjectWithKey();
    const events = Array.from({ length: 101 }, () => validEvent());

    await request(app.getHttpServer())
      .post('/v1/events')
      .set('Authorization', `Bearer ${rawKey}`)
      .send({ batch: events })
      .expect(400);
  });

  it('rejects event missing required fields (400)', async () => {
    const { rawKey } = await createProjectWithKey();

    await request(app.getHttpServer())
      .post('/v1/events')
      .set('Authorization', `Bearer ${rawKey}`)
      .send({ batch: [{ eventName: 'click' }] })
      .expect(400);
  });

  it('updates lastUsedAt on the API key', async () => {
    const { rawKey, keyId } = await createProjectWithKey();

    const before = await prisma.projectApiKey.findUnique({
      where: { id: keyId },
    });
    expect(before!.lastUsedAt).toBeNull();

    await request(app.getHttpServer())
      .post('/v1/events')
      .set('Authorization', `Bearer ${rawKey}`)
      .send({ batch: [validEvent()] })
      .expect(202);

    const after = await prisma.projectApiKey.findUnique({
      where: { id: keyId },
    });
    expect(after!.lastUsedAt).not.toBeNull();
  });

  it('accepts a multi-event batch', async () => {
    const { rawKey } = await createProjectWithKey();
    const events = Array.from({ length: 5 }, () => validEvent());

    const response = await request(app.getHttpServer())
      .post('/v1/events')
      .set('Authorization', `Bearer ${rawKey}`)
      .send({ batch: events })
      .expect(202);

    expect(response.body.eventCount).toBe(5);
  });
});
