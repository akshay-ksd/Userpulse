process.env.DATABASE_URL ??=
  'postgresql://postgres:postgres@localhost:5432/userpulse?schema=public';

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

describe('AnalysisRunsController (e2e)', () => {
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
    await prisma.analysisRun.deleteMany();
    await prisma.event.deleteMany();
    await prisma.projectApiKey.deleteMany();
    await prisma.featureEventMapping.deleteMany();
    await prisma.feature.deleteMany();
    await prisma.funnelStep.deleteMany();
    await prisma.funnel.deleteMany();
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
    email = 'analysis@example.com',
    password = 'password1',
    name = 'Analysis User',
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

  describe('POST /organizations/:orgId/projects/:projectId/analysis-runs', () => {
    it('creates a QUEUED analysis run (201)', async () => {
      const cookie = await registerAndSignIn();
      const orgId = await createOrg(cookie);
      const projectId = await createProject(cookie, orgId);

      const res = await request(app.getHttpServer())
        .post(`/organizations/${orgId}/projects/${projectId}/analysis-runs`)
        .set('Cookie', cookie)
        .send({})
        .expect(201);

      expect(res.body.status).toBe('QUEUED');
      expect(res.body.projectId).toBe(projectId);
      expect(res.body.organizationId).toBe(orgId);
    });

    it('rejects concurrent runs (409)', async () => {
      const cookie = await registerAndSignIn();
      const orgId = await createOrg(cookie);
      const projectId = await createProject(cookie, orgId);

      await request(app.getHttpServer())
        .post(`/organizations/${orgId}/projects/${projectId}/analysis-runs`)
        .set('Cookie', cookie)
        .send({})
        .expect(201);

      await request(app.getHttpServer())
        .post(`/organizations/${orgId}/projects/${projectId}/analysis-runs`)
        .set('Cookie', cookie)
        .send({})
        .expect(409);
    });

    it('rejects unauthenticated (401)', async () => {
      await request(app.getHttpServer())
        .post('/organizations/org-1/projects/proj-1/analysis-runs')
        .send({})
        .expect(401);
    });

    it('rejects non-member (404)', async () => {
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
        .post(`/organizations/${orgId}/projects/${projectId}/analysis-runs`)
        .set('Cookie', cookie2)
        .send({})
        .expect(404);
    });
  });

  describe('GET /organizations/:orgId/projects/:projectId/analysis-runs', () => {
    it('returns analysis runs (200)', async () => {
      const cookie = await registerAndSignIn();
      const orgId = await createOrg(cookie);
      const projectId = await createProject(cookie, orgId);

      await request(app.getHttpServer())
        .post(`/organizations/${orgId}/projects/${projectId}/analysis-runs`)
        .set('Cookie', cookie)
        .send({})
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(`/organizations/${orgId}/projects/${projectId}/analysis-runs`)
        .set('Cookie', cookie)
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].status).toBe('QUEUED');
    });

    it('rejects unauthenticated (401)', async () => {
      await request(app.getHttpServer())
        .get('/organizations/org-1/projects/proj-1/analysis-runs')
        .expect(401);
    });
  });

  describe('GET /organizations/:orgId/projects/:projectId/analysis-runs/:runId', () => {
    it('returns a specific run (200)', async () => {
      const cookie = await registerAndSignIn();
      const orgId = await createOrg(cookie);
      const projectId = await createProject(cookie, orgId);

      const createRes = await request(app.getHttpServer())
        .post(`/organizations/${orgId}/projects/${projectId}/analysis-runs`)
        .set('Cookie', cookie)
        .send({})
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(
          `/organizations/${orgId}/projects/${projectId}/analysis-runs/${createRes.body.id}`,
        )
        .set('Cookie', cookie)
        .expect(200);

      expect(res.body.id).toBe(createRes.body.id);
    });

    it('returns 404 for non-existent run', async () => {
      const cookie = await registerAndSignIn();
      const orgId = await createOrg(cookie);
      const projectId = await createProject(cookie, orgId);

      await request(app.getHttpServer())
        .get(
          `/organizations/${orgId}/projects/${projectId}/analysis-runs/non-existent`,
        )
        .set('Cookie', cookie)
        .expect(404);
    });

    it('rejects unauthenticated (401)', async () => {
      await request(app.getHttpServer())
        .get('/organizations/org-1/projects/proj-1/analysis-runs/run-1')
        .expect(401);
    });
  });
});
