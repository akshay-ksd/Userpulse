process.env.DATABASE_URL ??=
  'postgresql://postgres:postgres@localhost:5432/userpulse?schema=public';

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { EventProcessorService } from './../src/event-processor/event-processor.service.js';

describe('EventProcessor (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let processor: EventProcessorService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    processor = app.get(EventProcessorService);
  });

  beforeEach(async () => {
    await prisma.event.deleteMany();
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

  async function registerAndSignIn(
    email = 'jane@example.com',
    password = 'password1',
    name = 'Jane',
  ): Promise<string> {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password, name })
      .expect(201);

    const response = await request(app.getHttpServer())
      .post('/auth/sign-in')
      .send({ email, password })
      .expect(200);

    const cookie = (response.headers['set-cookie'] as unknown as string[])[0];
    return cookie.split(';')[0];
  }

  async function createOrg(
    cookie: string,
    name = 'Acme Corp',
  ): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/organizations')
      .set('Cookie', cookie)
      .send({ name })
      .expect(201);
    return res.body.id;
  }

  async function createProject(
    cookie: string,
    orgId: string,
    name = 'My App',
  ): Promise<string> {
    const res = await request(app.getHttpServer())
      .post(`/organizations/${orgId}/projects`)
      .set('Cookie', cookie)
      .send({ name })
      .expect(201);
    return res.body.id;
  }

  async function createApiKey(
    cookie: string,
    orgId: string,
    projectId: string,
    name = 'SDK Key',
  ): Promise<string> {
    const res = await request(app.getHttpServer())
      .post(`/organizations/${orgId}/projects/${projectId}/api-keys`)
      .set('Cookie', cookie)
      .send({ name })
      .expect(201);
    return res.body.key;
  }

  function makeEvent(overrides: Record<string, unknown> = {}) {
    return {
      eventId: crypto.randomUUID(),
      eventName: 'button_click',
      timestamp: new Date().toISOString(),
      anonymousId: 'anon-1',
      sdkVersion: '0.1.0',
      ...overrides,
    };
  }

  it('processes ingested events from PENDING to PROCESSED', async () => {
    const cookie = await registerAndSignIn();
    const orgId = await createOrg(cookie);
    const projectId = await createProject(cookie, orgId);
    const apiKey = await createApiKey(cookie, orgId, projectId);

    await request(app.getHttpServer())
      .post('/v1/events')
      .set('Authorization', `Bearer ${apiKey}`)
      .send({ batch: [makeEvent(), makeEvent()] })
      .expect(202);

    const pending = await prisma.event.findMany({
      where: { processingStatus: 'PENDING' },
    });
    expect(pending).toHaveLength(2);

    await processor.processNextBatch();

    const processed = await prisma.event.findMany({
      where: { processingStatus: 'PROCESSED' },
    });
    expect(processed).toHaveLength(2);
    expect(processed[0].processedAt).not.toBeNull();
  });

  it('does not process REJECTED events', async () => {
    const cookie = await registerAndSignIn();
    const orgId = await createOrg(cookie);
    const projectId = await createProject(cookie, orgId);
    const apiKey = await createApiKey(cookie, orgId, projectId);

    await request(app.getHttpServer())
      .post('/v1/events')
      .set('Authorization', `Bearer ${apiKey}`)
      .send({ batch: [makeEvent({ eventName: '   ' })] })
      .expect(202);

    await processor.processNextBatch();

    const events = await prisma.event.findMany();
    expect(events).toHaveLength(1);
    expect(events[0].processingStatus).toBe('REJECTED');
  });

  describe('GET /internal/metrics/processing', () => {
    it('returns processing metrics (requires auth)', async () => {
      const cookie = await registerAndSignIn();
      const orgId = await createOrg(cookie);
      const projectId = await createProject(cookie, orgId);
      const apiKey = await createApiKey(cookie, orgId, projectId);

      await request(app.getHttpServer())
        .post('/v1/events')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({ batch: [makeEvent()] })
        .expect(202);

      const res = await request(app.getHttpServer())
        .get('/internal/metrics/processing')
        .set('Cookie', cookie)
        .expect(200);

      expect(res.body.pending).toBe(1);
      expect(res.body.processed).toBe(0);
    });

    it('rejects unauthenticated requests (401)', async () => {
      await request(app.getHttpServer())
        .get('/internal/metrics/processing')
        .expect(401);
    });
  });
});
