process.env.DATABASE_URL ??=
  'postgresql://postgres:postgres@localhost:5432/userpulse?schema=public';

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

describe('Invitations (e2e)', () => {
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

  async function createOrg(cookie: string, name = 'Test Org'): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/organizations')
      .set('Cookie', cookie)
      .send({ name })
      .expect(201);
    return res.body.id;
  }

  describe('POST /organizations/:orgId/invitations', () => {
    it('creates an invitation (201)', async () => {
      const cookie = await registerAndSignIn();
      const orgId = await createOrg(cookie);

      const res = await request(app.getHttpServer())
        .post(`/organizations/${orgId}/invitations`)
        .set('Cookie', cookie)
        .send({ email: 'colleague@example.com' })
        .expect(201);

      expect(res.body).toMatchObject({
        id: expect.any(String),
        organizationId: orgId,
        email: 'colleague@example.com',
        role: 'MEMBER',
        status: 'PENDING',
      });
    });

    it('creates an invitation with ADMIN role', async () => {
      const cookie = await registerAndSignIn();
      const orgId = await createOrg(cookie);

      const res = await request(app.getHttpServer())
        .post(`/organizations/${orgId}/invitations`)
        .set('Cookie', cookie)
        .send({ email: 'admin@example.com', role: 'ADMIN' })
        .expect(201);

      expect(res.body.role).toBe('ADMIN');
    });

    it('rejects unauthenticated request (401)', async () => {
      await request(app.getHttpServer())
        .post('/organizations/some-org/invitations')
        .send({ email: 'colleague@example.com' })
        .expect(401);
    });

    it('rejects non-owner inviter (403)', async () => {
      const ownerCookie = await registerAndSignIn(
        'owner@example.com',
        'password1',
        'Owner',
      );
      const orgId = await createOrg(ownerCookie);

      // Register another user and add them as MEMBER manually
      const memberCookie = await registerAndSignIn(
        'member@example.com',
        'password1',
        'Member',
      );
      const memberUser = await prisma.user.findUnique({
        where: { email: 'member@example.com' },
      });
      await prisma.organizationMember.create({
        data: {
          organizationId: orgId,
          userId: memberUser!.id,
          role: 'MEMBER',
        },
      });

      await request(app.getHttpServer())
        .post(`/organizations/${orgId}/invitations`)
        .set('Cookie', memberCookie)
        .send({ email: 'someone@example.com' })
        .expect(403);
    });

    it('rejects duplicate active invitation (409)', async () => {
      const cookie = await registerAndSignIn();
      const orgId = await createOrg(cookie);

      await request(app.getHttpServer())
        .post(`/organizations/${orgId}/invitations`)
        .set('Cookie', cookie)
        .send({ email: 'colleague@example.com' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .post(`/organizations/${orgId}/invitations`)
        .set('Cookie', cookie)
        .send({ email: 'colleague@example.com' })
        .expect(409);

      expect(res.body.message).toContain('active invitation already exists');
    });

    it('rejects invitation to existing member (409)', async () => {
      const ownerCookie = await registerAndSignIn(
        'owner@example.com',
        'password1',
        'Owner',
      );
      const orgId = await createOrg(ownerCookie);

      // Register the target user and add them as a member
      await registerAndSignIn('existing@example.com', 'password1', 'Existing');
      const existingUser = await prisma.user.findUnique({
        where: { email: 'existing@example.com' },
      });
      await prisma.organizationMember.create({
        data: {
          organizationId: orgId,
          userId: existingUser!.id,
          role: 'MEMBER',
        },
      });

      const res = await request(app.getHttpServer())
        .post(`/organizations/${orgId}/invitations`)
        .set('Cookie', ownerCookie)
        .send({ email: 'existing@example.com' })
        .expect(409);

      expect(res.body.message).toContain('already a member');
    });
  });

  describe('GET /organizations/:orgId/invitations', () => {
    it('lists pending invitations for owner', async () => {
      const cookie = await registerAndSignIn();
      const orgId = await createOrg(cookie);

      await request(app.getHttpServer())
        .post(`/organizations/${orgId}/invitations`)
        .set('Cookie', cookie)
        .send({ email: 'a@example.com' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(`/organizations/${orgId}/invitations`)
        .set('Cookie', cookie)
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].email).toBe('a@example.com');
    });
  });

  describe('DELETE /organizations/:orgId/invitations/:id', () => {
    it('cancels an invitation (204)', async () => {
      const cookie = await registerAndSignIn();
      const orgId = await createOrg(cookie);

      const created = await request(app.getHttpServer())
        .post(`/organizations/${orgId}/invitations`)
        .set('Cookie', cookie)
        .send({ email: 'cancel@example.com' })
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/organizations/${orgId}/invitations/${created.body.id}`)
        .set('Cookie', cookie)
        .expect(204);

      // Verify it's cancelled
      const inv = await prisma.organizationInvitation.findUnique({
        where: { id: created.body.id },
      });
      expect(inv!.status).toBe('CANCELLED');
    });
  });

  describe('POST /invitations/accept', () => {
    it('accepts an invitation and creates membership', async () => {
      const ownerCookie = await registerAndSignIn(
        'owner@example.com',
        'password1',
        'Owner',
      );
      const orgId = await createOrg(ownerCookie);

      // Create invitation for another user
      await request(app.getHttpServer())
        .post(`/organizations/${orgId}/invitations`)
        .set('Cookie', ownerCookie)
        .send({ email: 'invitee@example.com' })
        .expect(201);

      // Get the raw token from the DB (in production this would come via email)
      const invitation = await prisma.organizationInvitation.findFirst({
        where: { email: 'invitee@example.com', organizationId: orgId },
      });
      expect(invitation).toBeTruthy();

      // We need the raw token, but we only have the hash. For e2e test, create a known token.
      // Let's instead create the invitation with a known token via the DB directly.
      const crypto = await import('node:crypto');
      const rawToken = crypto.randomBytes(32).toString('base64url');
      const tokenHash = crypto
        .createHash('sha256')
        .update(rawToken)
        .digest('hex');

      // Update the invitation's tokenHash
      await prisma.organizationInvitation.update({
        where: { id: invitation!.id },
        data: { tokenHash },
      });

      // Register and sign in as the invitee
      const inviteeCookie = await registerAndSignIn(
        'invitee@example.com',
        'password1',
        'Invitee',
      );

      const res = await request(app.getHttpServer())
        .post('/invitations/accept')
        .set('Cookie', inviteeCookie)
        .send({ token: rawToken })
        .expect(200);

      expect(res.body).toMatchObject({
        organizationId: orgId,
        role: 'MEMBER',
      });

      // Verify membership was created
      const inviteeUser = await prisma.user.findUnique({
        where: { email: 'invitee@example.com' },
      });
      const membership = await prisma.organizationMember.findUnique({
        where: {
          organizationId_userId: {
            organizationId: orgId,
            userId: inviteeUser!.id,
          },
        },
      });
      expect(membership).toBeTruthy();
      expect(membership!.role).toBe('MEMBER');
    });

    it('rejects unauthenticated accept (401)', async () => {
      await request(app.getHttpServer())
        .post('/invitations/accept')
        .send({ token: 'some-token' })
        .expect(401);
    });

    it('rejects accept with wrong email (403)', async () => {
      const ownerCookie = await registerAndSignIn(
        'owner@example.com',
        'password1',
        'Owner',
      );
      const orgId = await createOrg(ownerCookie);

      const crypto = await import('node:crypto');
      const rawToken = crypto.randomBytes(32).toString('base64url');
      const tokenHash = crypto
        .createHash('sha256')
        .update(rawToken)
        .digest('hex');

      const owner = await prisma.user.findUnique({
        where: { email: 'owner@example.com' },
      });

      await prisma.organizationInvitation.create({
        data: {
          organizationId: orgId,
          email: 'specific@example.com',
          role: 'MEMBER',
          tokenHash,
          invitedById: owner!.id,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      // Sign in as a different user
      const wrongCookie = await registerAndSignIn(
        'wrong@example.com',
        'password1',
        'Wrong',
      );

      await request(app.getHttpServer())
        .post('/invitations/accept')
        .set('Cookie', wrongCookie)
        .send({ token: rawToken })
        .expect(403);
    });

    it('rejects expired invitation (400)', async () => {
      const ownerCookie = await registerAndSignIn(
        'owner@example.com',
        'password1',
        'Owner',
      );
      const orgId = await createOrg(ownerCookie);

      const crypto = await import('node:crypto');
      const rawToken = crypto.randomBytes(32).toString('base64url');
      const tokenHash = crypto
        .createHash('sha256')
        .update(rawToken)
        .digest('hex');

      const owner = await prisma.user.findUnique({
        where: { email: 'owner@example.com' },
      });

      await prisma.organizationInvitation.create({
        data: {
          organizationId: orgId,
          email: 'invitee@example.com',
          role: 'MEMBER',
          tokenHash,
          invitedById: owner!.id,
          expiresAt: new Date(Date.now() - 1000), // expired
        },
      });

      const inviteeCookie = await registerAndSignIn(
        'invitee@example.com',
        'password1',
        'Invitee',
      );

      await request(app.getHttpServer())
        .post('/invitations/accept')
        .set('Cookie', inviteeCookie)
        .send({ token: rawToken })
        .expect(400);
    });

    it('rejects invalid token (400)', async () => {
      const cookie = await registerAndSignIn();

      await request(app.getHttpServer())
        .post('/invitations/accept')
        .set('Cookie', cookie)
        .send({ token: 'totally-invalid-token' })
        .expect(400);
    });
  });
});
