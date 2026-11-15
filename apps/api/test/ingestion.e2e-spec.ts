process.env.DATABASE_URL ??=
  'postgresql://postgres:postgres@localhost:5432/userpulse?schema=public';

import { createHash } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

describe('IngestionController (e2e)', () => {
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

  describe('POST /v1/events', () => {
    it('accepts a valid batch (202)', async () => {
      const cookie = await registerAndSignIn();
      const orgId = await createOrg(cookie);
      const projectId = await createProject(cookie, orgId);
      const apiKey = await createApiKey(cookie, orgId, projectId);

      const res = await request(app.getHttpServer())
        .post('/v1/events')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({ batch: [makeEvent(), makeEvent()] })
        .expect(202);

      expect(res.body.accepted).toBe(2);
      expect(res.body.rejected).toBe(0);
    });

    it('stores events in the database with correct org/project IDs', async () => {
      const cookie = await registerAndSignIn();
      const orgId = await createOrg(cookie);
      const projectId = await createProject(cookie, orgId);
      const apiKey = await createApiKey(cookie, orgId, projectId);
      const event = makeEvent({
        userId: 'user-42',
        properties: { page: '/home' },
      });

      await request(app.getHttpServer())
        .post('/v1/events')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({ batch: [event] })
        .expect(202);

      const stored = await prisma.event.findMany();
      expect(stored).toHaveLength(1);
      expect(stored[0].organizationId).toBe(orgId);
      expect(stored[0].projectId).toBe(projectId);
      expect(stored[0].eventId).toBe(event.eventId);
      expect(stored[0].eventName).toBe('button_click');
      expect(stored[0].userId).toBe('user-42');
      expect(stored[0].properties).toEqual({ page: '/home' });
    });

    it('rejects missing Authorization header (401)', async () => {
      await request(app.getHttpServer())
        .post('/v1/events')
        .send({ batch: [makeEvent()] })
        .expect(401);
    });

    it('rejects invalid API key (401)', async () => {
      await request(app.getHttpServer())
        .post('/v1/events')
        .set('Authorization', 'Bearer invalid-key')
        .send({ batch: [makeEvent()] })
        .expect(401);
    });

    it('rejects revoked API key (403)', async () => {
      const cookie = await registerAndSignIn();
      const orgId = await createOrg(cookie);
      const projectId = await createProject(cookie, orgId);
      const apiKey = await createApiKey(cookie, orgId, projectId);

      const keyHash = createHash('sha256').update(apiKey).digest('hex');
      await prisma.projectApiKey.updateMany({
        where: { keyHash },
        data: { revokedAt: new Date() },
      });

      await request(app.getHttpServer())
        .post('/v1/events')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({ batch: [makeEvent()] })
        .expect(403);
    });

    it('rejects archived project (403)', async () => {
      const cookie = await registerAndSignIn();
      const orgId = await createOrg(cookie);
      const projectId = await createProject(cookie, orgId);
      const apiKey = await createApiKey(cookie, orgId, projectId);

      await prisma.project.update({
        where: { id: projectId },
        data: { status: 'ARCHIVED' },
      });

      await request(app.getHttpServer())
        .post('/v1/events')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({ batch: [makeEvent()] })
        .expect(403);
    });

    it('rejects empty batch (400)', async () => {
      const cookie = await registerAndSignIn();
      const orgId = await createOrg(cookie);
      const projectId = await createProject(cookie, orgId);
      const apiKey = await createApiKey(cookie, orgId, projectId);

      await request(app.getHttpServer())
        .post('/v1/events')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({ batch: [] })
        .expect(400);
    });

    it('rejects batch exceeding 100 events (400)', async () => {
      const cookie = await registerAndSignIn();
      const orgId = await createOrg(cookie);
      const projectId = await createProject(cookie, orgId);
      const apiKey = await createApiKey(cookie, orgId, projectId);

      const batch = Array.from({ length: 101 }, () => makeEvent());

      await request(app.getHttpServer())
        .post('/v1/events')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({ batch })
        .expect(400);
    });

    it('rejects event with missing eventId (400)', async () => {
      const cookie = await registerAndSignIn();
      const orgId = await createOrg(cookie);
      const projectId = await createProject(cookie, orgId);
      const apiKey = await createApiKey(cookie, orgId, projectId);

      const { eventId, ...badEvent } = makeEvent();

      await request(app.getHttpServer())
        .post('/v1/events')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({ batch: [badEvent] })
        .expect(400);
    });

    it('rejects event with invalid timestamp (400)', async () => {
      const cookie = await registerAndSignIn();
      const orgId = await createOrg(cookie);
      const projectId = await createProject(cookie, orgId);
      const apiKey = await createApiKey(cookie, orgId, projectId);

      await request(app.getHttpServer())
        .post('/v1/events')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({ batch: [makeEvent({ timestamp: 'not-a-date' })] })
        .expect(400);
    });

    it('updates lastUsedAt on the API key after successful ingestion', async () => {
      const cookie = await registerAndSignIn();
      const orgId = await createOrg(cookie);
      const projectId = await createProject(cookie, orgId);
      const apiKey = await createApiKey(cookie, orgId, projectId);

      const keyHash = createHash('sha256').update(apiKey).digest('hex');
      const before = await prisma.projectApiKey.findUnique({
        where: { keyHash },
      });
      expect(before!.lastUsedAt).toBeNull();

      await request(app.getHttpServer())
        .post('/v1/events')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({ batch: [makeEvent()] })
        .expect(202);

      // Small delay for fire-and-forget update
      await new Promise((r) => setTimeout(r, 100));

      const after = await prisma.projectApiKey.findUnique({
        where: { keyHash },
      });
      expect(after!.lastUsedAt).not.toBeNull();
    });

    it('includes CORS headers for cross-origin requests', async () => {
      const cookie = await registerAndSignIn();
      const orgId = await createOrg(cookie);
      const projectId = await createProject(cookie, orgId);
      const apiKey = await createApiKey(cookie, orgId, projectId);

      const res = await request(app.getHttpServer())
        .post('/v1/events')
        .set('Authorization', `Bearer ${apiKey}`)
        .set('Origin', 'https://customer-app.example.com')
        .send({ batch: [makeEvent()] })
        .expect(202);

      expect(res.headers['access-control-allow-origin']).toBe(
        'https://customer-app.example.com',
      );
    });

    it('partially rejects events with whitespace-only eventName (202)', async () => {
      const cookie = await registerAndSignIn();
      const orgId = await createOrg(cookie);
      const projectId = await createProject(cookie, orgId);
      const apiKey = await createApiKey(cookie, orgId, projectId);

      const res = await request(app.getHttpServer())
        .post('/v1/events')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({
          batch: [makeEvent(), makeEvent({ eventName: '   ' })],
        })
        .expect(202);

      expect(res.body.accepted).toBe(1);
      expect(res.body.rejected).toBe(1);
      expect(res.body.errors).toHaveLength(1);
      expect(res.body.errors[0].index).toBe(1);
    });

    it('rejects events with future timestamps and accepts others (202)', async () => {
      const cookie = await registerAndSignIn();
      const orgId = await createOrg(cookie);
      const projectId = await createProject(cookie, orgId);
      const apiKey = await createApiKey(cookie, orgId, projectId);

      const futureEvent = makeEvent({
        timestamp: new Date(Date.now() + 2 * 3_600_000).toISOString(),
      });

      const res = await request(app.getHttpServer())
        .post('/v1/events')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({ batch: [makeEvent(), futureEvent] })
        .expect(202);

      expect(res.body.accepted).toBe(1);
      expect(res.body.rejected).toBe(1);
      expect(res.body.errors[0].error).toContain('future');
    });

    it('strips tenant IDs from properties before storage', async () => {
      const cookie = await registerAndSignIn();
      const orgId = await createOrg(cookie);
      const projectId = await createProject(cookie, orgId);
      const apiKey = await createApiKey(cookie, orgId, projectId);

      await request(app.getHttpServer())
        .post('/v1/events')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({
          batch: [
            makeEvent({
              properties: {
                organizationId: 'org-hack',
                projectId: 'proj-hack',
                safe: 'keep',
              },
            }),
          ],
        })
        .expect(202);

      const stored = await prisma.event.findMany();
      expect(stored).toHaveLength(1);
      expect(stored[0].properties).toEqual({ safe: 'keep' });
    });

    it('rejects events with oversized properties', async () => {
      const cookie = await registerAndSignIn();
      const orgId = await createOrg(cookie);
      const projectId = await createProject(cookie, orgId);
      const apiKey = await createApiKey(cookie, orgId, projectId);

      const bigEvent = makeEvent({
        properties: { data: 'x'.repeat(40_000) },
      });

      const res = await request(app.getHttpServer())
        .post('/v1/events')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({ batch: [bigEvent] })
        .expect(202);

      expect(res.body.accepted).toBe(0);
      expect(res.body.rejected).toBe(1);
      expect(res.body.errors[0].error).toContain('maximum size');
    });

    it('stores rejected events with REJECTED validationStatus', async () => {
      const cookie = await registerAndSignIn();
      const orgId = await createOrg(cookie);
      const projectId = await createProject(cookie, orgId);
      const apiKey = await createApiKey(cookie, orgId, projectId);

      await request(app.getHttpServer())
        .post('/v1/events')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({ batch: [makeEvent({ eventName: '   ' })] })
        .expect(202);

      const stored = await prisma.event.findMany();
      expect(stored).toHaveLength(1);
      expect(stored[0].validationStatus).toBe('REJECTED');
      expect(stored[0].validationError).toContain('eventName');
    });
  });
});
