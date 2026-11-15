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

describe('AuthController (e2e)', () => {
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
    await prisma.organizationMember.deleteMany();
    await prisma.organization.deleteMany();
    await prisma.passwordResetToken.deleteMany();
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await app.close();
  });

  it('registers a user without exposing the password', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'Jane@Example.com', password: 'password1', name: 'Jane' })
      .expect(201);

    expect(response.body).toMatchObject({
      email: 'jane@example.com',
      name: 'Jane',
    });
    expect(response.body.id).toEqual(expect.any(String));
    expect(response.body.createdAt).toEqual(expect.any(String));
    expect(response.body).not.toHaveProperty('password');
    expect(response.body).not.toHaveProperty('passwordHash');

    const stored = await prisma.user.findUniqueOrThrow({
      where: { email: 'jane@example.com' },
    });
    expect(stored.passwordHash).not.toBe('password1');
    expect(stored.passwordHash).toMatch(/^\$2[aby]\$/);
  });

  it('rejects a duplicate email with 409 and a clear message', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'jane@example.com', password: 'password1' })
      .expect(201);

    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'jane@example.com', password: 'otherpass2' })
      .expect(409);

    expect(response.body.message).toBe(
      'An account with this email already exists.',
    );
  });

  it.each([
    ['an invalid email', { email: 'not-an-email', password: 'password1' }],
    [
      'a password shorter than 8 characters',
      { email: 'jane@example.com', password: 'pass1' },
    ],
    [
      'a password without a letter',
      { email: 'jane@example.com', password: '12345678' },
    ],
    [
      'a password without a number',
      { email: 'jane@example.com', password: 'password' },
    ],
    ['a missing email', { password: 'password1' }],
    ['a missing password', { email: 'jane@example.com' }],
  ])('rejects %s with 400', async (_case, body) => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send(body)
      .expect(400);
  });

  it('ignores unknown properties in the payload', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'jane@example.com', password: 'password1', role: 'admin' })
      .expect(201);

    expect(response.body).not.toHaveProperty('role');
  });

  describe('sign-in', () => {
    const jane = { email: 'jane@example.com', password: 'password1' };

    beforeEach(async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ ...jane, name: 'Jane' })
        .expect(201);
    });

    it('creates a session for valid credentials and keeps only its hash', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/sign-in')
        .send(jane)
        .expect(200);

      expect(response.body.user).toEqual({
        id: expect.any(String),
        email: jane.email,
        name: 'Jane',
      });
      expect(response.body.user).not.toHaveProperty('password');
      expect(response.body.user).not.toHaveProperty('passwordHash');
      expect(response.body).not.toHaveProperty('token');

      const cookie = (response.headers['set-cookie'] as unknown as string[])[0];
      expect(cookie).toMatch(/^__Host-sid=/);
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Lax');

      // The session table holds the SHA-256 of the cookie token, never the token.
      const token = cookie.split(';')[0].split('=')[1];
      const sessions = await prisma.session.findMany();
      expect(sessions).toHaveLength(1);
      expect(sessions[0].id).not.toBe(token);
      expect(sessions[0].id).toBe(
        createHash('sha256').update(token).digest('base64url'),
      );

      const me = await request(app.getHttpServer())
        .get('/me')
        .set('Cookie', cookie.split(';')[0])
        .expect(200);
      expect(me.body).toEqual(response.body.user);
    });

    it('rejects a wrong password and an unknown email with the same generic 401', async () => {
      const wrongPassword = await request(app.getHttpServer())
        .post('/auth/sign-in')
        .send({ ...jane, password: 'otherpass2' })
        .expect(401);
      const unknownEmail = await request(app.getHttpServer())
        .post('/auth/sign-in')
        .send({ email: 'nobody@example.com', password: 'password1' })
        .expect(401);

      expect(wrongPassword.body.message).toBe('Invalid email or password.');
      expect(unknownEmail.body.message).toBe('Invalid email or password.');

      expect(await prisma.session.count()).toBe(0);
    });

    it('rejects unauthenticated requests to protected endpoints', async () => {
      await request(app.getHttpServer()).get('/me').expect(401);
      await request(app.getHttpServer())
        .get('/me')
        .set('Cookie', '__Host-sid=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')
        .expect(401);
    });

    it('rejects malformed sign-in payloads with 400', async () => {
      await request(app.getHttpServer())
        .post('/auth/sign-in')
        .send({ email: 'not-an-email', password: 'password1' })
        .expect(400);
      await request(app.getHttpServer())
        .post('/auth/sign-in')
        .send({ email: jane.email })
        .expect(400);
    });
  });

  describe('sign-out', () => {
    const jane = { email: 'jane@example.com', password: 'password1' };

    beforeEach(async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ ...jane, name: 'Jane' })
        .expect(201);
    });

    it('signs out and invalidates the session', async () => {
      const signInRes = await request(app.getHttpServer())
        .post('/auth/sign-in')
        .send(jane)
        .expect(200);

      const cookie = (
        signInRes.headers['set-cookie'] as unknown as string[]
      )[0].split(';')[0];

      expect(await prisma.session.count()).toBe(1);

      await request(app.getHttpServer())
        .post('/auth/sign-out')
        .set('Cookie', cookie)
        .expect(204);

      expect(await prisma.session.count()).toBe(0);

      await request(app.getHttpServer())
        .get('/me')
        .set('Cookie', cookie)
        .expect(401);
    });

    it('rejects sign-out without a session', async () => {
      await request(app.getHttpServer()).post('/auth/sign-out').expect(401);
    });
  });

  describe('forgot-password', () => {
    const jane = { email: 'jane@example.com', password: 'password1' };

    beforeEach(async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ ...jane, name: 'Jane' })
        .expect(201);
    });

    it('returns the same 200 message for a registered email', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ email: jane.email })
        .expect(200);

      expect(response.body.message).toBe(
        'If an account with that email exists, a password reset link has been sent.',
      );

      expect(await prisma.passwordResetToken.count()).toBe(1);
    });

    it('returns the same 200 message for an unregistered email', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ email: 'nobody@example.com' })
        .expect(200);

      expect(response.body.message).toBe(
        'If an account with that email exists, a password reset link has been sent.',
      );

      expect(await prisma.passwordResetToken.count()).toBe(0);
    });

    it('rejects an invalid email with 400', async () => {
      await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ email: 'not-an-email' })
        .expect(400);
    });
  });

  describe('reset-password', () => {
    const jane = { email: 'jane@example.com', password: 'password1' };
    const newPassword = 'newPass123';

    beforeEach(async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ ...jane, name: 'Jane' })
        .expect(201);
    });

    async function getResetToken(): Promise<string> {
      await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ email: jane.email })
        .expect(200);

      const tokenRow = await prisma.passwordResetToken.findFirst();
      expect(tokenRow).not.toBeNull();

      // We need the raw token, not the hash. Since we can't intercept the log,
      // we'll create the token directly for testing purposes.
      // Instead, let's use the service's approach: generate and look up by hash.
      // For e2e, we need to extract from the stored hash → raw token mapping.
      // The simplest approach: create a known token directly.
      const { randomBytes } = await import('node:crypto');
      const rawToken = randomBytes(32).toString('base64url');
      const tokenHash = createHash('sha256').update(rawToken).digest('hex');

      const user = await prisma.user.findUniqueOrThrow({
        where: { email: jane.email },
      });

      await prisma.passwordResetToken.deleteMany();
      await prisma.passwordResetToken.create({
        data: {
          id: tokenHash,
          userId: user.id,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      });

      return rawToken;
    }

    it('resets the password with a valid token', async () => {
      const rawToken = await getResetToken();

      const response = await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({ token: rawToken, password: newPassword })
        .expect(200);

      expect(response.body.message).toBe(
        'Your password has been reset. You can now sign in.',
      );

      // Token is deleted after use
      expect(await prisma.passwordResetToken.count()).toBe(0);

      // Sessions are revoked
      expect(await prisma.session.count()).toBe(0);

      // Can sign in with new password
      await request(app.getHttpServer())
        .post('/auth/sign-in')
        .send({ email: jane.email, password: newPassword })
        .expect(200);

      // Cannot sign in with old password
      await request(app.getHttpServer())
        .post('/auth/sign-in')
        .send({ email: jane.email, password: jane.password })
        .expect(401);
    });

    it('rejects an expired token', async () => {
      const { randomBytes } = await import('node:crypto');
      const rawToken = randomBytes(32).toString('base64url');
      const tokenHash = createHash('sha256').update(rawToken).digest('hex');

      const user = await prisma.user.findUniqueOrThrow({
        where: { email: jane.email },
      });

      await prisma.passwordResetToken.create({
        data: {
          id: tokenHash,
          userId: user.id,
          expiresAt: new Date(Date.now() - 1000), // expired
        },
      });

      const response = await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({ token: rawToken, password: newPassword })
        .expect(400);

      expect(response.body.message).toBe(
        'Reset link has expired or is invalid.',
      );
    });

    it('rejects an already-used token', async () => {
      const rawToken = await getResetToken();

      // Use the token
      await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({ token: rawToken, password: newPassword })
        .expect(200);

      // Try to use the same token again
      const response = await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({ token: rawToken, password: 'anotherPass1' })
        .expect(400);

      expect(response.body.message).toBe(
        'Reset link has expired or is invalid.',
      );
    });

    it('rejects an invalid token', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({ token: 'totally-invalid-token', password: newPassword })
        .expect(400);

      expect(response.body.message).toBe(
        'Reset link has expired or is invalid.',
      );
    });

    it('rejects a missing token with 400', async () => {
      await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({ password: newPassword })
        .expect(400);
    });

    it('revokes existing sessions on password reset', async () => {
      // Sign in to create a session
      const signInRes = await request(app.getHttpServer())
        .post('/auth/sign-in')
        .send(jane)
        .expect(200);

      const cookie = (
        signInRes.headers['set-cookie'] as unknown as string[]
      )[0].split(';')[0];

      expect(await prisma.session.count()).toBe(1);

      // Reset password
      const rawToken = await getResetToken();
      await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({ token: rawToken, password: newPassword })
        .expect(200);

      // Old session is gone
      expect(await prisma.session.count()).toBe(0);

      // Old session cookie no longer works
      await request(app.getHttpServer())
        .get('/me')
        .set('Cookie', cookie)
        .expect(401);
    });
  });
});
