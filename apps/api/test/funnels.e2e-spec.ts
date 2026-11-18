process.env.DATABASE_URL ??=
  'postgresql://postgres:postgres@localhost:5432/userpulse?schema=public';

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

describe('FunnelsController (e2e)', () => {
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
    await prisma.funnelStep.deleteMany();
    await prisma.funnel.deleteMany();
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

  function funnelUrl(orgId: string, projectId: string, funnelId?: string) {
    const base = `/organizations/${orgId}/projects/${projectId}/funnels`;
    return funnelId ? `${base}/${funnelId}` : base;
  }

  describe('POST /organizations/:orgId/projects/:projectId/funnels', () => {
    it('201 — creates a funnel with name and steps', async () => {
      const cookie = await registerAndSignIn();
      const orgId = await createOrg(cookie);
      const projectId = await createProject(cookie, orgId);

      const res = await request(app.getHttpServer())
        .post(funnelUrl(orgId, projectId))
        .set('Cookie', cookie)
        .send({
          name: 'Onboarding',
          steps: [{ eventName: 'sign_up' }, { eventName: 'complete_profile' }],
        })
        .expect(201);

      expect(res.body.name).toBe('Onboarding');
      expect(res.body.steps).toHaveLength(2);
      expect(res.body.steps[0].eventName).toBe('sign_up');
      expect(res.body.steps[0].stepOrder).toBe(0);
      expect(res.body.steps[1].eventName).toBe('complete_profile');
      expect(res.body.steps[1].stepOrder).toBe(1);
      expect(res.body.id).toBeDefined();
    });

    it('401 — unauthenticated', async () => {
      await request(app.getHttpServer())
        .post('/organizations/org-1/projects/proj-1/funnels')
        .send({
          name: 'Funnel',
          steps: [{ eventName: 'a' }, { eventName: 'b' }],
        })
        .expect(401);
    });

    it('404 — non-member org', async () => {
      const cookie = await registerAndSignIn();
      const cookie2 = await registerAndSignIn(
        'other@example.com',
        'password1',
        'Other',
      );
      const orgId = await createOrg(cookie);
      const projectId = await createProject(cookie, orgId);

      await request(app.getHttpServer())
        .post(funnelUrl(orgId, projectId))
        .set('Cookie', cookie2)
        .send({
          name: 'Funnel',
          steps: [{ eventName: 'a' }, { eventName: 'b' }],
        })
        .expect(404);
    });

    it('400 — fewer than 2 steps', async () => {
      const cookie = await registerAndSignIn();
      const orgId = await createOrg(cookie);
      const projectId = await createProject(cookie, orgId);

      await request(app.getHttpServer())
        .post(funnelUrl(orgId, projectId))
        .set('Cookie', cookie)
        .send({ name: 'Funnel', steps: [{ eventName: 'a' }] })
        .expect(400);
    });

    it('400 — missing name', async () => {
      const cookie = await registerAndSignIn();
      const orgId = await createOrg(cookie);
      const projectId = await createProject(cookie, orgId);

      await request(app.getHttpServer())
        .post(funnelUrl(orgId, projectId))
        .set('Cookie', cookie)
        .send({ steps: [{ eventName: 'a' }, { eventName: 'b' }] })
        .expect(400);
    });
  });

  describe('GET /organizations/:orgId/projects/:projectId/funnels', () => {
    it('200 — returns funnels with step counts', async () => {
      const cookie = await registerAndSignIn();
      const orgId = await createOrg(cookie);
      const projectId = await createProject(cookie, orgId);

      await request(app.getHttpServer())
        .post(funnelUrl(orgId, projectId))
        .set('Cookie', cookie)
        .send({
          name: 'Onboarding',
          steps: [{ eventName: 'sign_up' }, { eventName: 'verify' }],
        })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(funnelUrl(orgId, projectId))
        .set('Cookie', cookie)
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe('Onboarding');
      expect(res.body[0].stepCount).toBe(2);
    });

    it('200 — empty list', async () => {
      const cookie = await registerAndSignIn();
      const orgId = await createOrg(cookie);
      const projectId = await createProject(cookie, orgId);

      const res = await request(app.getHttpServer())
        .get(funnelUrl(orgId, projectId))
        .set('Cookie', cookie)
        .expect(200);

      expect(res.body).toEqual([]);
    });

    it('401 — unauthenticated', async () => {
      await request(app.getHttpServer())
        .get('/organizations/org-1/projects/proj-1/funnels')
        .expect(401);
    });
  });

  describe('GET /organizations/:orgId/projects/:projectId/funnels/:funnelId', () => {
    it('200 — returns funnel with steps', async () => {
      const cookie = await registerAndSignIn();
      const orgId = await createOrg(cookie);
      const projectId = await createProject(cookie, orgId);

      const createRes = await request(app.getHttpServer())
        .post(funnelUrl(orgId, projectId))
        .set('Cookie', cookie)
        .send({
          name: 'Checkout',
          steps: [
            { eventName: 'add_to_cart' },
            { eventName: 'begin_checkout' },
            { eventName: 'purchase' },
          ],
        })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(funnelUrl(orgId, projectId, createRes.body.id))
        .set('Cookie', cookie)
        .expect(200);

      expect(res.body.name).toBe('Checkout');
      expect(res.body.steps).toHaveLength(3);
    });

    it('404 — non-member', async () => {
      const cookie = await registerAndSignIn();
      const cookie2 = await registerAndSignIn(
        'other@example.com',
        'password1',
        'Other',
      );
      const orgId = await createOrg(cookie);
      const projectId = await createProject(cookie, orgId);

      const createRes = await request(app.getHttpServer())
        .post(funnelUrl(orgId, projectId))
        .set('Cookie', cookie)
        .send({
          name: 'Funnel',
          steps: [{ eventName: 'a' }, { eventName: 'b' }],
        })
        .expect(201);

      await request(app.getHttpServer())
        .get(funnelUrl(orgId, projectId, createRes.body.id))
        .set('Cookie', cookie2)
        .expect(404);
    });
  });

  describe('PATCH /organizations/:orgId/projects/:projectId/funnels/:funnelId', () => {
    it('200 — updates name', async () => {
      const cookie = await registerAndSignIn();
      const orgId = await createOrg(cookie);
      const projectId = await createProject(cookie, orgId);

      const createRes = await request(app.getHttpServer())
        .post(funnelUrl(orgId, projectId))
        .set('Cookie', cookie)
        .send({
          name: 'Old Name',
          steps: [{ eventName: 'a' }, { eventName: 'b' }],
        })
        .expect(201);

      const res = await request(app.getHttpServer())
        .patch(funnelUrl(orgId, projectId, createRes.body.id))
        .set('Cookie', cookie)
        .send({ name: 'New Name' })
        .expect(200);

      expect(res.body.name).toBe('New Name');
      expect(res.body.steps).toHaveLength(2);
    });

    it('200 — replaces steps', async () => {
      const cookie = await registerAndSignIn();
      const orgId = await createOrg(cookie);
      const projectId = await createProject(cookie, orgId);

      const createRes = await request(app.getHttpServer())
        .post(funnelUrl(orgId, projectId))
        .set('Cookie', cookie)
        .send({
          name: 'Funnel',
          steps: [{ eventName: 'a' }, { eventName: 'b' }],
        })
        .expect(201);

      const res = await request(app.getHttpServer())
        .patch(funnelUrl(orgId, projectId, createRes.body.id))
        .set('Cookie', cookie)
        .send({
          steps: [{ eventName: 'x' }, { eventName: 'y' }, { eventName: 'z' }],
        })
        .expect(200);

      expect(res.body.steps).toHaveLength(3);
      expect(res.body.steps[0].eventName).toBe('x');
    });

    it('404 — non-member', async () => {
      const cookie = await registerAndSignIn();
      const cookie2 = await registerAndSignIn(
        'other@example.com',
        'password1',
        'Other',
      );
      const orgId = await createOrg(cookie);
      const projectId = await createProject(cookie, orgId);

      const createRes = await request(app.getHttpServer())
        .post(funnelUrl(orgId, projectId))
        .set('Cookie', cookie)
        .send({
          name: 'Funnel',
          steps: [{ eventName: 'a' }, { eventName: 'b' }],
        })
        .expect(201);

      await request(app.getHttpServer())
        .patch(funnelUrl(orgId, projectId, createRes.body.id))
        .set('Cookie', cookie2)
        .send({ name: 'x' })
        .expect(404);
    });
  });

  describe('DELETE /organizations/:orgId/projects/:projectId/funnels/:funnelId', () => {
    it('204 — deletes funnel', async () => {
      const cookie = await registerAndSignIn();
      const orgId = await createOrg(cookie);
      const projectId = await createProject(cookie, orgId);

      const createRes = await request(app.getHttpServer())
        .post(funnelUrl(orgId, projectId))
        .set('Cookie', cookie)
        .send({
          name: 'Funnel',
          steps: [{ eventName: 'a' }, { eventName: 'b' }],
        })
        .expect(201);

      await request(app.getHttpServer())
        .delete(funnelUrl(orgId, projectId, createRes.body.id))
        .set('Cookie', cookie)
        .expect(204);

      await request(app.getHttpServer())
        .get(funnelUrl(orgId, projectId, createRes.body.id))
        .set('Cookie', cookie)
        .expect(404);
    });

    it('401 — unauthenticated', async () => {
      await request(app.getHttpServer())
        .delete('/organizations/org-1/projects/proj-1/funnels/fun-1')
        .expect(401);
    });

    it('404 — non-member', async () => {
      const cookie = await registerAndSignIn();
      const cookie2 = await registerAndSignIn(
        'other@example.com',
        'password1',
        'Other',
      );
      const orgId = await createOrg(cookie);
      const projectId = await createProject(cookie, orgId);

      const createRes = await request(app.getHttpServer())
        .post(funnelUrl(orgId, projectId))
        .set('Cookie', cookie)
        .send({
          name: 'Funnel',
          steps: [{ eventName: 'a' }, { eventName: 'b' }],
        })
        .expect(201);

      await request(app.getHttpServer())
        .delete(funnelUrl(orgId, projectId, createRes.body.id))
        .set('Cookie', cookie2)
        .expect(404);
    });
  });

  describe('GET /organizations/:orgId/projects/:projectId/funnels/event-names', () => {
    it('200 — returns event names', async () => {
      const cookie = await registerAndSignIn();
      const orgId = await createOrg(cookie);
      const projectId = await createProject(cookie, orgId);

      const res = await request(app.getHttpServer())
        .get(
          `/organizations/${orgId}/projects/${projectId}/funnels/event-names`,
        )
        .set('Cookie', cookie)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });
  });
});
