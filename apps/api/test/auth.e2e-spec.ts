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
});
