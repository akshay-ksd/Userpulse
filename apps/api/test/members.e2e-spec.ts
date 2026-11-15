process.env.DATABASE_URL ??=
  'postgresql://postgres:postgres@localhost:5432/userpulse?schema=public';

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

describe('Organization Members (e2e)', () => {
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

  async function addMemberDirectly(
    orgId: string,
    email: string,
    password = 'password1',
    name = 'Member',
    role: 'MEMBER' | 'ADMIN' | 'OWNER' = 'MEMBER',
  ): Promise<{ cookie: string; memberId: string; userId: string }> {
    const cookie = await registerAndSignIn(email, password, name);

    const user = await prisma.user.findUnique({ where: { email } });

    const membership = await prisma.organizationMember.create({
      data: {
        organizationId: orgId,
        userId: user!.id,
        role,
      },
    });

    return { cookie, memberId: membership.id, userId: user!.id };
  }

  describe('GET /organizations/:id/members', () => {
    it('returns member list for an org member', async () => {
      const ownerCookie = await registerAndSignIn(
        'owner@example.com',
        'password1',
        'Owner',
      );

      const orgRes = await request(app.getHttpServer())
        .post('/organizations')
        .set('Cookie', ownerCookie)
        .send({ name: 'Members Org' })
        .expect(201);

      const orgId = orgRes.body.id;

      const { cookie: memberCookie } = await addMemberDirectly(
        orgId,
        'member@example.com',
      );

      const response = await request(app.getHttpServer())
        .get(`/organizations/${orgId}/members`)
        .set('Cookie', memberCookie)
        .expect(200);

      expect(response.body).toHaveLength(2);
      expect(response.body).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            email: 'owner@example.com',
            role: 'OWNER',
          }),
          expect.objectContaining({
            email: 'member@example.com',
            role: 'MEMBER',
          }),
        ]),
      );
    });

    it('rejects unauthenticated requests with 401', async () => {
      await request(app.getHttpServer())
        .get('/organizations/some-id/members')
        .expect(401);
    });

    it('returns 404 for non-member', async () => {
      const ownerCookie = await registerAndSignIn(
        'owner@example.com',
        'password1',
        'Owner',
      );
      const nonMemberCookie = await registerAndSignIn(
        'outsider@example.com',
        'password1',
        'Outsider',
      );

      const orgRes = await request(app.getHttpServer())
        .post('/organizations')
        .set('Cookie', ownerCookie)
        .send({ name: 'Private Org' })
        .expect(201);

      await request(app.getHttpServer())
        .get(`/organizations/${orgRes.body.id}/members`)
        .set('Cookie', nonMemberCookie)
        .expect(404);
    });
  });

  describe('DELETE /organizations/:id/members/:memberId', () => {
    it('allows owner to remove a member (204)', async () => {
      const ownerCookie = await registerAndSignIn(
        'owner@example.com',
        'password1',
        'Owner',
      );

      const orgRes = await request(app.getHttpServer())
        .post('/organizations')
        .set('Cookie', ownerCookie)
        .send({ name: 'Remove Test Org' })
        .expect(201);

      const orgId = orgRes.body.id;

      const { memberId } = await addMemberDirectly(
        orgId,
        'removable@example.com',
      );

      await request(app.getHttpServer())
        .delete(`/organizations/${orgId}/members/${memberId}`)
        .set('Cookie', ownerCookie)
        .expect(204);

      const remaining = await prisma.organizationMember.findMany({
        where: { organizationId: orgId },
      });
      expect(remaining).toHaveLength(1);
    });

    it('removed member loses access to the organization', async () => {
      const ownerCookie = await registerAndSignIn(
        'owner@example.com',
        'password1',
        'Owner',
      );

      const orgRes = await request(app.getHttpServer())
        .post('/organizations')
        .set('Cookie', ownerCookie)
        .send({ name: 'Access Test Org' })
        .expect(201);

      const orgId = orgRes.body.id;

      const { cookie: memberCookie, memberId } = await addMemberDirectly(
        orgId,
        'kicked@example.com',
      );

      // Member can access before removal
      await request(app.getHttpServer())
        .get(`/organizations/${orgId}`)
        .set('Cookie', memberCookie)
        .expect(200);

      // Owner removes member
      await request(app.getHttpServer())
        .delete(`/organizations/${orgId}/members/${memberId}`)
        .set('Cookie', ownerCookie)
        .expect(204);

      // Member loses access
      await request(app.getHttpServer())
        .get(`/organizations/${orgId}`)
        .set('Cookie', memberCookie)
        .expect(404);
    });

    it('rejects non-owner removal with 403', async () => {
      const ownerCookie = await registerAndSignIn(
        'owner@example.com',
        'password1',
        'Owner',
      );

      const orgRes = await request(app.getHttpServer())
        .post('/organizations')
        .set('Cookie', ownerCookie)
        .send({ name: 'Forbidden Org' })
        .expect(201);

      const orgId = orgRes.body.id;

      const { cookie: memberCookie } = await addMemberDirectly(
        orgId,
        'member@example.com',
      );

      const { memberId: otherMemberId } = await addMemberDirectly(
        orgId,
        'other@example.com',
        'password1',
        'Other',
      );

      await request(app.getHttpServer())
        .delete(`/organizations/${orgId}/members/${otherMemberId}`)
        .set('Cookie', memberCookie)
        .expect(403);
    });

    it('prevents removing the last owner (400)', async () => {
      const ownerCookie = await registerAndSignIn(
        'owner@example.com',
        'password1',
        'Owner',
      );

      const orgRes = await request(app.getHttpServer())
        .post('/organizations')
        .set('Cookie', ownerCookie)
        .send({ name: 'Last Owner Org' })
        .expect(201);

      const orgId = orgRes.body.id;

      const ownerMember = await prisma.organizationMember.findFirst({
        where: { organizationId: orgId, role: 'OWNER' },
      });

      await request(app.getHttpServer())
        .delete(`/organizations/${orgId}/members/${ownerMember!.id}`)
        .set('Cookie', ownerCookie)
        .expect(400);
    });

    it('rejects unauthenticated requests with 401', async () => {
      await request(app.getHttpServer())
        .delete('/organizations/some-id/members/some-member-id')
        .expect(401);
    });

    it('returns 404 for non-existent member', async () => {
      const ownerCookie = await registerAndSignIn(
        'owner@example.com',
        'password1',
        'Owner',
      );

      const orgRes = await request(app.getHttpServer())
        .post('/organizations')
        .set('Cookie', ownerCookie)
        .send({ name: 'Not Found Org' })
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/organizations/${orgRes.body.id}/members/non-existent-id`)
        .set('Cookie', ownerCookie)
        .expect(404);
    });
  });
});
