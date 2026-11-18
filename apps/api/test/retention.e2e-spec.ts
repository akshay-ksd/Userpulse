process.env.DATABASE_URL ??=
  'postgresql://postgres:postgres@localhost:5432/userpulse?schema=public';

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

describe('RetentionController (e2e)', () => {
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
    await prisma.dataRetentionSetting.deleteMany();
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

  describe('GET /organizations/:orgId/retention', () => {
    it('returns default retention settings (200)', async () => {
      const cookie = await registerAndSignIn();
      const orgId = await createOrg(cookie);

      const res = await request(app.getHttpServer())
        .get(`/organizations/${orgId}/retention`)
        .set('Cookie', cookie)
        .expect(200);

      expect(res.body.eventRetentionDays).toBe(90);
      expect(res.body.organizationId).toBe(orgId);
    });

    it('rejects unauthenticated requests (401)', async () => {
      await request(app.getHttpServer())
        .get('/organizations/fake-org-id/retention')
        .expect(401);
    });

    it('rejects non-members (404)', async () => {
      const ownerCookie = await registerAndSignIn(
        'owner@example.com',
        'password1',
        'Owner',
      );
      const orgId = await createOrg(ownerCookie);

      const otherCookie = await registerAndSignIn(
        'other@example.com',
        'password1',
        'Other',
      );

      await request(app.getHttpServer())
        .get(`/organizations/${orgId}/retention`)
        .set('Cookie', otherCookie)
        .expect(404);
    });
  });

  describe('PATCH /organizations/:orgId/retention', () => {
    it('updates retention settings for owner (200)', async () => {
      const cookie = await registerAndSignIn();
      const orgId = await createOrg(cookie);

      const res = await request(app.getHttpServer())
        .patch(`/organizations/${orgId}/retention`)
        .set('Cookie', cookie)
        .send({ eventRetentionDays: 180 })
        .expect(200);

      expect(res.body.eventRetentionDays).toBe(180);
    });

    it('rejects non-owners (403)', async () => {
      const ownerCookie = await registerAndSignIn(
        'owner@example.com',
        'password1',
        'Owner',
      );
      const orgId = await createOrg(ownerCookie);

      // Add a member
      const memberCookie = await registerAndSignIn(
        'member@example.com',
        'password1',
        'Member',
      );
      // Invite and accept
      const invRes = await request(app.getHttpServer())
        .post(`/organizations/${orgId}/invitations`)
        .set('Cookie', ownerCookie)
        .send({ email: 'member@example.com', role: 'MEMBER' })
        .expect(201);

      await request(app.getHttpServer())
        .post('/invitations/accept')
        .set('Cookie', memberCookie)
        .send({ token: invRes.body.token })
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/organizations/${orgId}/retention`)
        .set('Cookie', memberCookie)
        .send({ eventRetentionDays: 180 })
        .expect(403);
    });

    it('rejects invalid retention days (400)', async () => {
      const cookie = await registerAndSignIn();
      const orgId = await createOrg(cookie);

      await request(app.getHttpServer())
        .patch(`/organizations/${orgId}/retention`)
        .set('Cookie', cookie)
        .send({ eventRetentionDays: 5 })
        .expect(400);

      await request(app.getHttpServer())
        .patch(`/organizations/${orgId}/retention`)
        .set('Cookie', cookie)
        .send({ eventRetentionDays: 5000 })
        .expect(400);
    });
  });
});
