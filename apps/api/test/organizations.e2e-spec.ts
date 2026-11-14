process.env.DATABASE_URL ??=
  'postgresql://postgres:postgres@localhost:5432/userpulse?schema=public';

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

describe('OrganizationsController (e2e)', () => {
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

  describe('POST /organizations', () => {
    it('creates an organization and assigns the creator as OWNER', async () => {
      const cookie = await registerAndSignIn();

      const response = await request(app.getHttpServer())
        .post('/organizations')
        .set('Cookie', cookie)
        .send({ name: 'Acme Corp' })
        .expect(201);

      expect(response.body).toMatchObject({
        id: expect.any(String),
        name: 'Acme Corp',
        slug: 'acme-corp',
        role: 'OWNER',
        createdAt: expect.any(String),
      });

      const member = await prisma.organizationMember.findFirst({
        where: { organizationId: response.body.id },
      });
      expect(member).toBeTruthy();
      expect(member!.role).toBe('OWNER');
    });

    it('rejects unauthenticated requests with 401', async () => {
      await request(app.getHttpServer())
        .post('/organizations')
        .send({ name: 'Acme Corp' })
        .expect(401);
    });

    it('rejects invalid name with 400', async () => {
      const cookie = await registerAndSignIn();

      await request(app.getHttpServer())
        .post('/organizations')
        .set('Cookie', cookie)
        .send({ name: '' })
        .expect(400);

      await request(app.getHttpServer())
        .post('/organizations')
        .set('Cookie', cookie)
        .send({})
        .expect(400);
    });

    it('handles slug collision by appending a suffix', async () => {
      const cookie = await registerAndSignIn();

      const first = await request(app.getHttpServer())
        .post('/organizations')
        .set('Cookie', cookie)
        .send({ name: 'Test Org' })
        .expect(201);

      const second = await request(app.getHttpServer())
        .post('/organizations')
        .set('Cookie', cookie)
        .send({ name: 'Test Org' })
        .expect(201);

      expect(first.body.slug).toBe('test-org');
      expect(second.body.slug).not.toBe('test-org');
      expect(second.body.slug).toMatch(/^test-org-[a-f0-9]{6}$/);
    });
  });

  describe('GET /organizations', () => {
    it("returns only the authenticated user's organizations", async () => {
      const cookieA = await registerAndSignIn(
        'alice@example.com',
        'password1',
        'Alice',
      );
      const cookieB = await registerAndSignIn(
        'bob@example.com',
        'password1',
        'Bob',
      );

      await request(app.getHttpServer())
        .post('/organizations')
        .set('Cookie', cookieA)
        .send({ name: 'Alice Org' })
        .expect(201);

      await request(app.getHttpServer())
        .post('/organizations')
        .set('Cookie', cookieB)
        .send({ name: 'Bob Org' })
        .expect(201);

      const aliceOrgs = await request(app.getHttpServer())
        .get('/organizations')
        .set('Cookie', cookieA)
        .expect(200);

      expect(aliceOrgs.body).toHaveLength(1);
      expect(aliceOrgs.body[0].name).toBe('Alice Org');
    });

    it('returns empty array for user with no organizations', async () => {
      const cookie = await registerAndSignIn();

      const response = await request(app.getHttpServer())
        .get('/organizations')
        .set('Cookie', cookie)
        .expect(200);

      expect(response.body).toEqual([]);
    });

    it('rejects unauthenticated requests with 401', async () => {
      await request(app.getHttpServer()).get('/organizations').expect(401);
    });
  });

  describe('GET /organizations/:id', () => {
    it('returns the org for a member', async () => {
      const cookie = await registerAndSignIn();

      const created = await request(app.getHttpServer())
        .post('/organizations')
        .set('Cookie', cookie)
        .send({ name: 'My Org' })
        .expect(201);

      const response = await request(app.getHttpServer())
        .get(`/organizations/${created.body.id}`)
        .set('Cookie', cookie)
        .expect(200);

      expect(response.body).toMatchObject({
        id: created.body.id,
        name: 'My Org',
        role: 'OWNER',
      });
    });

    it('returns 404 for a non-member (tenant isolation)', async () => {
      const cookieA = await registerAndSignIn(
        'alice@example.com',
        'password1',
        'Alice',
      );
      const cookieB = await registerAndSignIn(
        'bob@example.com',
        'password1',
        'Bob',
      );

      const aliceOrg = await request(app.getHttpServer())
        .post('/organizations')
        .set('Cookie', cookieA)
        .send({ name: 'Alice Private Org' })
        .expect(201);

      await request(app.getHttpServer())
        .get(`/organizations/${aliceOrg.body.id}`)
        .set('Cookie', cookieB)
        .expect(404);
    });

    it('rejects unauthenticated requests with 401', async () => {
      await request(app.getHttpServer())
        .get('/organizations/some-random-id')
        .expect(401);
    });
  });
});
