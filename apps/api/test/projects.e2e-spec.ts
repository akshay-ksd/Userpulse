process.env.DATABASE_URL ??=
  'postgresql://postgres:postgres@localhost:5432/userpulse?schema=public';

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

describe('ProjectsController (e2e)', () => {
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

  describe('POST /organizations/:orgId/projects', () => {
    it('creates a project (201)', async () => {
      const cookie = await registerAndSignIn();
      const orgId = await createOrg(cookie);

      const res = await request(app.getHttpServer())
        .post(`/organizations/${orgId}/projects`)
        .set('Cookie', cookie)
        .send({ name: 'My App', description: 'A test application' })
        .expect(201);

      expect(res.body).toMatchObject({
        id: expect.any(String),
        organizationId: orgId,
        name: 'My App',
        description: 'A test application',
        status: 'ACTIVE',
        createdAt: expect.any(String),
      });
    });

    it('creates a project without description', async () => {
      const cookie = await registerAndSignIn();
      const orgId = await createOrg(cookie);

      const res = await request(app.getHttpServer())
        .post(`/organizations/${orgId}/projects`)
        .set('Cookie', cookie)
        .send({ name: 'Minimal Project' })
        .expect(201);

      expect(res.body.description).toBeNull();
    });

    it('rejects unauthenticated (401)', async () => {
      await request(app.getHttpServer())
        .post('/organizations/some-id/projects')
        .send({ name: 'My App' })
        .expect(401);
    });

    it('rejects non-member (404)', async () => {
      const cookie1 = await registerAndSignIn('user1@example.com');
      const orgId = await createOrg(cookie1);
      const cookie2 = await registerAndSignIn('user2@example.com');

      await request(app.getHttpServer())
        .post(`/organizations/${orgId}/projects`)
        .set('Cookie', cookie2)
        .send({ name: 'My App' })
        .expect(404);
    });

    it('rejects invalid name (400)', async () => {
      const cookie = await registerAndSignIn();
      const orgId = await createOrg(cookie);

      await request(app.getHttpServer())
        .post(`/organizations/${orgId}/projects`)
        .set('Cookie', cookie)
        .send({ name: '' })
        .expect(400);
    });
  });

  describe('GET /organizations/:orgId/projects', () => {
    it('returns projects for org member', async () => {
      const cookie = await registerAndSignIn();
      const orgId = await createOrg(cookie);

      await request(app.getHttpServer())
        .post(`/organizations/${orgId}/projects`)
        .set('Cookie', cookie)
        .send({ name: 'Project A' })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/organizations/${orgId}/projects`)
        .set('Cookie', cookie)
        .send({ name: 'Project B' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(`/organizations/${orgId}/projects`)
        .set('Cookie', cookie)
        .expect(200);

      expect(res.body).toHaveLength(2);
      expect(res.body[0].name).toBe('Project B');
      expect(res.body[1].name).toBe('Project A');
    });

    it('returns empty array for org with no projects', async () => {
      const cookie = await registerAndSignIn();
      const orgId = await createOrg(cookie);

      const res = await request(app.getHttpServer())
        .get(`/organizations/${orgId}/projects`)
        .set('Cookie', cookie)
        .expect(200);

      expect(res.body).toEqual([]);
    });

    it('rejects non-member (404)', async () => {
      const cookie1 = await registerAndSignIn('user1@example.com');
      const orgId = await createOrg(cookie1);
      const cookie2 = await registerAndSignIn('user2@example.com');

      await request(app.getHttpServer())
        .get(`/organizations/${orgId}/projects`)
        .set('Cookie', cookie2)
        .expect(404);
    });

    it('rejects unauthenticated (401)', async () => {
      await request(app.getHttpServer())
        .get('/organizations/some-id/projects')
        .expect(401);
    });
  });

  describe('GET /organizations/:orgId/projects/:projectId', () => {
    it('returns project for org member', async () => {
      const cookie = await registerAndSignIn();
      const orgId = await createOrg(cookie);

      const createRes = await request(app.getHttpServer())
        .post(`/organizations/${orgId}/projects`)
        .set('Cookie', cookie)
        .send({ name: 'My App' })
        .expect(201);

      const projectId = createRes.body.id;

      const res = await request(app.getHttpServer())
        .get(`/organizations/${orgId}/projects/${projectId}`)
        .set('Cookie', cookie)
        .expect(200);

      expect(res.body).toMatchObject({
        id: projectId,
        organizationId: orgId,
        name: 'My App',
      });
    });

    it('rejects non-member (404)', async () => {
      const cookie1 = await registerAndSignIn('user1@example.com');
      const orgId = await createOrg(cookie1);

      const createRes = await request(app.getHttpServer())
        .post(`/organizations/${orgId}/projects`)
        .set('Cookie', cookie1)
        .send({ name: 'My App' })
        .expect(201);

      const cookie2 = await registerAndSignIn('user2@example.com');

      await request(app.getHttpServer())
        .get(`/organizations/${orgId}/projects/${createRes.body.id}`)
        .set('Cookie', cookie2)
        .expect(404);
    });

    it('returns 404 for non-existent project', async () => {
      const cookie = await registerAndSignIn();
      const orgId = await createOrg(cookie);

      await request(app.getHttpServer())
        .get(`/organizations/${orgId}/projects/non-existent-id`)
        .set('Cookie', cookie)
        .expect(404);
    });

    it('returns 404 for project in different org', async () => {
      const cookie = await registerAndSignIn();
      const orgId1 = await createOrg(cookie, 'Org One');
      const orgId2 = await createOrg(cookie, 'Org Two');

      const createRes = await request(app.getHttpServer())
        .post(`/organizations/${orgId1}/projects`)
        .set('Cookie', cookie)
        .send({ name: 'My App' })
        .expect(201);

      await request(app.getHttpServer())
        .get(`/organizations/${orgId2}/projects/${createRes.body.id}`)
        .set('Cookie', cookie)
        .expect(404);
    });

    it('rejects unauthenticated (401)', async () => {
      await request(app.getHttpServer())
        .get('/organizations/some-id/projects/some-project')
        .expect(401);
    });
  });

  describe('PATCH /organizations/:orgId/projects/:projectId', () => {
    it('updates project name (200)', async () => {
      const cookie = await registerAndSignIn();
      const orgId = await createOrg(cookie);

      const createRes = await request(app.getHttpServer())
        .post(`/organizations/${orgId}/projects`)
        .set('Cookie', cookie)
        .send({ name: 'Old Name' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .patch(`/organizations/${orgId}/projects/${createRes.body.id}`)
        .set('Cookie', cookie)
        .send({ name: 'New Name' })
        .expect(200);

      expect(res.body.name).toBe('New Name');
    });

    it('updates project description (200)', async () => {
      const cookie = await registerAndSignIn();
      const orgId = await createOrg(cookie);

      const createRes = await request(app.getHttpServer())
        .post(`/organizations/${orgId}/projects`)
        .set('Cookie', cookie)
        .send({ name: 'My App', description: 'Old description' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .patch(`/organizations/${orgId}/projects/${createRes.body.id}`)
        .set('Cookie', cookie)
        .send({ description: 'New description' })
        .expect(200);

      expect(res.body.description).toBe('New description');
      expect(res.body.name).toBe('My App');
    });

    it('clears description with null (200)', async () => {
      const cookie = await registerAndSignIn();
      const orgId = await createOrg(cookie);

      const createRes = await request(app.getHttpServer())
        .post(`/organizations/${orgId}/projects`)
        .set('Cookie', cookie)
        .send({ name: 'My App', description: 'Some desc' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .patch(`/organizations/${orgId}/projects/${createRes.body.id}`)
        .set('Cookie', cookie)
        .send({ description: null })
        .expect(200);

      expect(res.body.description).toBeNull();
    });

    it('archives a project (200)', async () => {
      const cookie = await registerAndSignIn();
      const orgId = await createOrg(cookie);

      const createRes = await request(app.getHttpServer())
        .post(`/organizations/${orgId}/projects`)
        .set('Cookie', cookie)
        .send({ name: 'My App' })
        .expect(201);

      expect(createRes.body.status).toBe('ACTIVE');

      const res = await request(app.getHttpServer())
        .patch(`/organizations/${orgId}/projects/${createRes.body.id}`)
        .set('Cookie', cookie)
        .send({ status: 'ARCHIVED' })
        .expect(200);

      expect(res.body.status).toBe('ARCHIVED');
    });

    it('restores an archived project (200)', async () => {
      const cookie = await registerAndSignIn();
      const orgId = await createOrg(cookie);

      const createRes = await request(app.getHttpServer())
        .post(`/organizations/${orgId}/projects`)
        .set('Cookie', cookie)
        .send({ name: 'My App' })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/organizations/${orgId}/projects/${createRes.body.id}`)
        .set('Cookie', cookie)
        .send({ status: 'ARCHIVED' })
        .expect(200);

      const res = await request(app.getHttpServer())
        .patch(`/organizations/${orgId}/projects/${createRes.body.id}`)
        .set('Cookie', cookie)
        .send({ status: 'ACTIVE' })
        .expect(200);

      expect(res.body.status).toBe('ACTIVE');
    });

    it('archived project appears in project list', async () => {
      const cookie = await registerAndSignIn();
      const orgId = await createOrg(cookie);

      const createRes = await request(app.getHttpServer())
        .post(`/organizations/${orgId}/projects`)
        .set('Cookie', cookie)
        .send({ name: 'To Archive' })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/organizations/${orgId}/projects/${createRes.body.id}`)
        .set('Cookie', cookie)
        .send({ status: 'ARCHIVED' })
        .expect(200);

      const listRes = await request(app.getHttpServer())
        .get(`/organizations/${orgId}/projects`)
        .set('Cookie', cookie)
        .expect(200);

      expect(listRes.body).toHaveLength(1);
      expect(listRes.body[0].status).toBe('ARCHIVED');
    });

    it('rejects non-member (404)', async () => {
      const cookie1 = await registerAndSignIn('user1@example.com');
      const orgId = await createOrg(cookie1);

      const createRes = await request(app.getHttpServer())
        .post(`/organizations/${orgId}/projects`)
        .set('Cookie', cookie1)
        .send({ name: 'My App' })
        .expect(201);

      const cookie2 = await registerAndSignIn('user2@example.com');

      await request(app.getHttpServer())
        .patch(`/organizations/${orgId}/projects/${createRes.body.id}`)
        .set('Cookie', cookie2)
        .send({ name: 'Hacked' })
        .expect(404);
    });

    it('returns 404 for non-existent project', async () => {
      const cookie = await registerAndSignIn();
      const orgId = await createOrg(cookie);

      await request(app.getHttpServer())
        .patch(`/organizations/${orgId}/projects/non-existent`)
        .set('Cookie', cookie)
        .send({ name: 'X' })
        .expect(404);
    });

    it('rejects unauthenticated (401)', async () => {
      await request(app.getHttpServer())
        .patch('/organizations/some-id/projects/some-project')
        .send({ name: 'X' })
        .expect(401);
    });
  });

  describe('GET /organizations/:orgId/projects/:projectId/event-status', () => {
    it('returns zero events for empty project (200)', async () => {
      const cookie = await registerAndSignIn();
      const orgId = await createOrg(cookie);

      const createRes = await request(app.getHttpServer())
        .post(`/organizations/${orgId}/projects`)
        .set('Cookie', cookie)
        .send({ name: 'Empty Project' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(
          `/organizations/${orgId}/projects/${createRes.body.id}/event-status`,
        )
        .set('Cookie', cookie)
        .expect(200);

      expect(res.body).toEqual({
        totalEvents: 0,
        latestEventAt: null,
        earliestEventAt: null,
      });
    });

    it('returns event counts and timestamps when events exist (200)', async () => {
      const cookie = await registerAndSignIn();
      const orgId = await createOrg(cookie);

      const createRes = await request(app.getHttpServer())
        .post(`/organizations/${orgId}/projects`)
        .set('Cookie', cookie)
        .send({ name: 'Active Project' })
        .expect(201);

      const projectId = createRes.body.id;

      await prisma.event.createMany({
        data: [
          {
            organizationId: orgId,
            projectId,
            eventId: 'evt-1',
            eventName: 'click',
            eventTimestamp: new Date('2026-11-15T08:00:00Z'),
            validationStatus: 'VALID',
            processingStatus: 'PENDING',
          },
          {
            organizationId: orgId,
            projectId,
            eventId: 'evt-2',
            eventName: 'page_view',
            eventTimestamp: new Date('2026-11-15T09:00:00Z'),
            validationStatus: 'VALID',
            processingStatus: 'PROCESSED',
          },
          {
            organizationId: orgId,
            projectId,
            eventId: 'evt-3',
            eventName: 'bad_event',
            eventTimestamp: new Date('2026-11-15T09:30:00Z'),
            validationStatus: 'REJECTED',
            validationError: 'Invalid event name',
            processingStatus: 'REJECTED',
          },
        ],
      });

      const res = await request(app.getHttpServer())
        .get(`/organizations/${orgId}/projects/${projectId}/event-status`)
        .set('Cookie', cookie)
        .expect(200);

      expect(res.body.totalEvents).toBe(2);
      expect(res.body.latestEventAt).toBeTruthy();
      expect(res.body.earliestEventAt).toBeTruthy();
    });

    it('rejects unauthenticated (401)', async () => {
      await request(app.getHttpServer())
        .get('/organizations/some-id/projects/some-project/event-status')
        .expect(401);
    });

    it('rejects non-member (404)', async () => {
      const cookie1 = await registerAndSignIn('user1@example.com');
      const orgId = await createOrg(cookie1);

      const createRes = await request(app.getHttpServer())
        .post(`/organizations/${orgId}/projects`)
        .set('Cookie', cookie1)
        .send({ name: 'My App' })
        .expect(201);

      const cookie2 = await registerAndSignIn('user2@example.com');

      await request(app.getHttpServer())
        .get(
          `/organizations/${orgId}/projects/${createRes.body.id}/event-status`,
        )
        .set('Cookie', cookie2)
        .expect(404);
    });

    it('returns 404 for non-existent project', async () => {
      const cookie = await registerAndSignIn();
      const orgId = await createOrg(cookie);

      await request(app.getHttpServer())
        .get(`/organizations/${orgId}/projects/non-existent-id/event-status`)
        .set('Cookie', cookie)
        .expect(404);
    });
  });
});
