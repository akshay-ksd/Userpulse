process.env.DATABASE_URL ??=
  'postgresql://postgres:postgres@localhost:5432/userpulse?schema=public';

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

describe('AnalyticsController (e2e)', () => {
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
    email = 'analytics@example.com',
    password = 'password1',
    name = 'Analytics User',
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
  ): Promise<string> {
    const res = await request(app.getHttpServer())
      .post(`/organizations/${orgId}/projects/${projectId}/api-keys`)
      .set('Cookie', cookie)
      .send({ name: 'SDK Key' })
      .expect(201);
    return res.body.key;
  }

  async function submitEvents(
    apiKey: string,
    events: Array<Record<string, unknown>>,
  ): Promise<void> {
    await request(app.getHttpServer())
      .post('/v1/events')
      .set('Authorization', `Bearer ${apiKey}`)
      .send({ batch: events })
      .expect(202);
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

  describe('GET /organizations/:orgId/projects/:projectId/analytics/event-activity', () => {
    it('returns event activity with correct total (200)', async () => {
      const cookie = await registerAndSignIn();
      const orgId = await createOrg(cookie);
      const projectId = await createProject(cookie, orgId);
      const apiKey = await createApiKey(cookie, orgId, projectId);

      const now = new Date();
      const today = now.toISOString().slice(0, 10);

      await submitEvents(apiKey, [
        makeEvent({ timestamp: now.toISOString() }),
        makeEvent({ timestamp: now.toISOString() }),
        makeEvent({ timestamp: now.toISOString() }),
      ]);

      const res = await request(app.getHttpServer())
        .get(
          `/organizations/${orgId}/projects/${projectId}/analytics/event-activity`,
        )
        .query({ startDate: today, endDate: today })
        .set('Cookie', cookie)
        .expect(200);

      expect(res.body.total).toBe(3);
      expect(res.body.startDate).toBe(today);
      expect(res.body.endDate).toBe(today);
      expect(res.body.daily).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ date: today, count: 3 }),
        ]),
      );
    });

    it('returns zero total for date range with no events (200)', async () => {
      const cookie = await registerAndSignIn();
      const orgId = await createOrg(cookie);
      const projectId = await createProject(cookie, orgId);

      const res = await request(app.getHttpServer())
        .get(
          `/organizations/${orgId}/projects/${projectId}/analytics/event-activity`,
        )
        .query({ startDate: '2026-01-01', endDate: '2026-01-03' })
        .set('Cookie', cookie)
        .expect(200);

      expect(res.body.total).toBe(0);
      expect(res.body.daily).toHaveLength(3);
      expect(
        res.body.daily.every((d: { count: number }) => d.count === 0),
      ).toBe(true);
    });

    it('rejects unauthenticated requests (401)', async () => {
      await request(app.getHttpServer())
        .get('/organizations/org1/projects/proj1/analytics/event-activity')
        .query({ startDate: '2026-11-01', endDate: '2026-11-07' })
        .expect(401);
    });

    it('returns 404 for non-member', async () => {
      const cookie1 = await registerAndSignIn(
        'user1@example.com',
        'password1',
        'User 1',
      );
      const cookie2 = await registerAndSignIn(
        'user2@example.com',
        'password1',
        'User 2',
      );
      const orgId = await createOrg(cookie1);
      const projectId = await createProject(cookie1, orgId);

      await request(app.getHttpServer())
        .get(
          `/organizations/${orgId}/projects/${projectId}/analytics/event-activity`,
        )
        .query({ startDate: '2026-11-01', endDate: '2026-11-07' })
        .set('Cookie', cookie2)
        .expect(404);
    });

    it('returns 400 for missing query params', async () => {
      const cookie = await registerAndSignIn();
      const orgId = await createOrg(cookie);
      const projectId = await createProject(cookie, orgId);

      await request(app.getHttpServer())
        .get(
          `/organizations/${orgId}/projects/${projectId}/analytics/event-activity`,
        )
        .set('Cookie', cookie)
        .expect(400);
    });

    it('returns 400 for invalid date format', async () => {
      const cookie = await registerAndSignIn();
      const orgId = await createOrg(cookie);
      const projectId = await createProject(cookie, orgId);

      await request(app.getHttpServer())
        .get(
          `/organizations/${orgId}/projects/${projectId}/analytics/event-activity`,
        )
        .query({ startDate: 'not-a-date', endDate: '2026-11-07' })
        .set('Cookie', cookie)
        .expect(400);
    });

    it('returns 400 when endDate is before startDate', async () => {
      const cookie = await registerAndSignIn();
      const orgId = await createOrg(cookie);
      const projectId = await createProject(cookie, orgId);

      await request(app.getHttpServer())
        .get(
          `/organizations/${orgId}/projects/${projectId}/analytics/event-activity`,
        )
        .query({ startDate: '2026-11-15', endDate: '2026-11-10' })
        .set('Cookie', cookie)
        .expect(400);
    });

    it('excludes rejected events from count', async () => {
      const cookie = await registerAndSignIn();
      const orgId = await createOrg(cookie);
      const projectId = await createProject(cookie, orgId);
      const apiKey = await createApiKey(cookie, orgId, projectId);

      const now = new Date();
      const today = now.toISOString().slice(0, 10);

      // Submit valid events
      await submitEvents(apiKey, [
        makeEvent({ timestamp: now.toISOString() }),
        makeEvent({ timestamp: now.toISOString() }),
      ]);

      // Submit an event that will be rejected (empty eventName)
      await submitEvents(apiKey, [
        makeEvent({ eventName: '', timestamp: now.toISOString() }),
      ]);

      const res = await request(app.getHttpServer())
        .get(
          `/organizations/${orgId}/projects/${projectId}/analytics/event-activity`,
        )
        .query({ startDate: today, endDate: today })
        .set('Cookie', cookie)
        .expect(200);

      // Only valid events should be counted
      expect(res.body.total).toBe(2);
    });
  });
});
