process.env.DATABASE_URL ??=
  'postgresql://postgres:postgres@localhost:5432/userpulse?schema=public';

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

describe('FeaturesController (e2e)', () => {
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
    await prisma.feature.deleteMany();
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

  describe('POST /organizations/:orgId/projects/:projectId/features', () => {
    it('creates a feature with name and description (201)', async () => {
      const cookie = await registerAndSignIn();
      const orgId = await createOrg(cookie);
      const projectId = await createProject(cookie, orgId);

      const res = await request(app.getHttpServer())
        .post(`/organizations/${orgId}/projects/${projectId}/features`)
        .set('Cookie', cookie)
        .send({ name: 'Search', description: 'Full-text search feature' })
        .expect(201);

      expect(res.body).toMatchObject({
        id: expect.any(String),
        projectId,
        name: 'Search',
        description: 'Full-text search feature',
        status: 'ACTIVE',
      });
    });

    it('creates a feature with name only (201)', async () => {
      const cookie = await registerAndSignIn();
      const orgId = await createOrg(cookie);
      const projectId = await createProject(cookie, orgId);

      const res = await request(app.getHttpServer())
        .post(`/organizations/${orgId}/projects/${projectId}/features`)
        .set('Cookie', cookie)
        .send({ name: 'Dashboard' })
        .expect(201);

      expect(res.body.name).toBe('Dashboard');
      expect(res.body.description).toBeNull();
    });

    it('rejects empty name (400)', async () => {
      const cookie = await registerAndSignIn();
      const orgId = await createOrg(cookie);
      const projectId = await createProject(cookie, orgId);

      await request(app.getHttpServer())
        .post(`/organizations/${orgId}/projects/${projectId}/features`)
        .set('Cookie', cookie)
        .send({ name: '' })
        .expect(400);
    });

    it('rejects unauthenticated (401)', async () => {
      await request(app.getHttpServer())
        .post('/organizations/org-1/projects/proj-1/features')
        .send({ name: 'Search' })
        .expect(401);
    });

    it('rejects non-member (404)', async () => {
      const cookie1 = await registerAndSignIn(
        'owner@example.com',
        'password1',
        'Owner',
      );
      const orgId = await createOrg(cookie1);
      const projectId = await createProject(cookie1, orgId);

      const cookie2 = await registerAndSignIn(
        'other@example.com',
        'password1',
        'Other',
      );

      await request(app.getHttpServer())
        .post(`/organizations/${orgId}/projects/${projectId}/features`)
        .set('Cookie', cookie2)
        .send({ name: 'Search' })
        .expect(404);
    });
  });

  describe('GET /organizations/:orgId/projects/:projectId/features', () => {
    it('returns features list (200)', async () => {
      const cookie = await registerAndSignIn();
      const orgId = await createOrg(cookie);
      const projectId = await createProject(cookie, orgId);

      await request(app.getHttpServer())
        .post(`/organizations/${orgId}/projects/${projectId}/features`)
        .set('Cookie', cookie)
        .send({ name: 'Search' })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/organizations/${orgId}/projects/${projectId}/features`)
        .set('Cookie', cookie)
        .send({ name: 'Dashboard' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(`/organizations/${orgId}/projects/${projectId}/features`)
        .set('Cookie', cookie)
        .expect(200);

      expect(res.body).toHaveLength(2);
      expect(res.body[0].name).toBe('Dashboard');
      expect(res.body[1].name).toBe('Search');
    });

    it('returns empty list when no features exist (200)', async () => {
      const cookie = await registerAndSignIn();
      const orgId = await createOrg(cookie);
      const projectId = await createProject(cookie, orgId);

      const res = await request(app.getHttpServer())
        .get(`/organizations/${orgId}/projects/${projectId}/features`)
        .set('Cookie', cookie)
        .expect(200);

      expect(res.body).toEqual([]);
    });

    it('rejects unauthenticated (401)', async () => {
      await request(app.getHttpServer())
        .get('/organizations/org-1/projects/proj-1/features')
        .expect(401);
    });

    it('rejects non-member (404)', async () => {
      const cookie1 = await registerAndSignIn(
        'owner@example.com',
        'password1',
        'Owner',
      );
      const orgId = await createOrg(cookie1);
      const projectId = await createProject(cookie1, orgId);

      const cookie2 = await registerAndSignIn(
        'other@example.com',
        'password1',
        'Other',
      );

      await request(app.getHttpServer())
        .get(`/organizations/${orgId}/projects/${projectId}/features`)
        .set('Cookie', cookie2)
        .expect(404);
    });
  });
});
