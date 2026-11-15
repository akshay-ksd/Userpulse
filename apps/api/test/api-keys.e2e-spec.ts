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

describe('ApiKeysController (e2e)', () => {
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

  function apiKeysUrl(orgId: string, projectId: string) {
    return `/organizations/${orgId}/projects/${projectId}/api-keys`;
  }

  describe('POST /organizations/:orgId/projects/:projectId/api-keys', () => {
    it('creates a credential and returns the full key (201)', async () => {
      const cookie = await registerAndSignIn();
      const orgId = await createOrg(cookie);
      const projectId = await createProject(cookie, orgId);

      const res = await request(app.getHttpServer())
        .post(apiKeysUrl(orgId, projectId))
        .set('Cookie', cookie)
        .send({ name: 'Production' })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.name).toBe('Production');
      expect(res.body.key).toBeDefined();
      expect(res.body.key.length).toBeGreaterThan(8);
      expect(res.body.keyPrefix).toBe(res.body.key.slice(0, 8));
      expect(res.body.createdAt).toBeDefined();
    });

    it('stores a SHA-256 hash of the key', async () => {
      const cookie = await registerAndSignIn();
      const orgId = await createOrg(cookie);
      const projectId = await createProject(cookie, orgId);

      const res = await request(app.getHttpServer())
        .post(apiKeysUrl(orgId, projectId))
        .set('Cookie', cookie)
        .send({ name: 'Hash Check' })
        .expect(201);

      const record = await prisma.projectApiKey.findUnique({
        where: { id: res.body.id },
      });

      const expectedHash = createHash('sha256')
        .update(res.body.key)
        .digest('hex');
      expect(record!.keyHash).toBe(expectedHash);
    });

    it('rejects unauthenticated (401)', async () => {
      await request(app.getHttpServer())
        .post(apiKeysUrl('org-1', 'proj-1'))
        .send({ name: 'Test' })
        .expect(401);
    });

    it('rejects non-member (404)', async () => {
      const cookie1 = await registerAndSignIn('user1@example.com');
      const cookie2 = await registerAndSignIn('user2@example.com');
      const orgId = await createOrg(cookie1);
      const projectId = await createProject(cookie1, orgId);

      await request(app.getHttpServer())
        .post(apiKeysUrl(orgId, projectId))
        .set('Cookie', cookie2)
        .send({ name: 'Test' })
        .expect(404);
    });

    it('rejects invalid name (400)', async () => {
      const cookie = await registerAndSignIn();
      const orgId = await createOrg(cookie);
      const projectId = await createProject(cookie, orgId);

      await request(app.getHttpServer())
        .post(apiKeysUrl(orgId, projectId))
        .set('Cookie', cookie)
        .send({ name: '' })
        .expect(400);
    });

    it('rejects non-existent project (404)', async () => {
      const cookie = await registerAndSignIn();
      const orgId = await createOrg(cookie);

      await request(app.getHttpServer())
        .post(apiKeysUrl(orgId, '00000000-0000-0000-0000-000000000000'))
        .set('Cookie', cookie)
        .send({ name: 'Test' })
        .expect(404);
    });
  });

  describe('GET /organizations/:orgId/projects/:projectId/api-keys', () => {
    it('lists credentials without the full key (200)', async () => {
      const cookie = await registerAndSignIn();
      const orgId = await createOrg(cookie);
      const projectId = await createProject(cookie, orgId);

      await request(app.getHttpServer())
        .post(apiKeysUrl(orgId, projectId))
        .set('Cookie', cookie)
        .send({ name: 'Prod' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(apiKeysUrl(orgId, projectId))
        .set('Cookie', cookie)
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe('Prod');
      expect(res.body[0].keyPrefix).toBeDefined();
      expect(res.body[0].key).toBeUndefined();
      expect(res.body[0].keyHash).toBeUndefined();
    });

    it('returns empty array for project with no credentials', async () => {
      const cookie = await registerAndSignIn();
      const orgId = await createOrg(cookie);
      const projectId = await createProject(cookie, orgId);

      const res = await request(app.getHttpServer())
        .get(apiKeysUrl(orgId, projectId))
        .set('Cookie', cookie)
        .expect(200);

      expect(res.body).toEqual([]);
    });

    it('rejects non-member (404)', async () => {
      const cookie1 = await registerAndSignIn('user1@example.com');
      const cookie2 = await registerAndSignIn('user2@example.com');
      const orgId = await createOrg(cookie1);
      const projectId = await createProject(cookie1, orgId);

      await request(app.getHttpServer())
        .get(apiKeysUrl(orgId, projectId))
        .set('Cookie', cookie2)
        .expect(404);
    });

    it('rejects unauthenticated (401)', async () => {
      await request(app.getHttpServer())
        .get(apiKeysUrl('org-1', 'proj-1'))
        .expect(401);
    });
  });

  describe('DELETE /organizations/:orgId/projects/:projectId/api-keys/:keyId', () => {
    it('revokes a credential (204)', async () => {
      const cookie = await registerAndSignIn();
      const orgId = await createOrg(cookie);
      const projectId = await createProject(cookie, orgId);

      const createRes = await request(app.getHttpServer())
        .post(apiKeysUrl(orgId, projectId))
        .set('Cookie', cookie)
        .send({ name: 'ToRevoke' })
        .expect(201);

      await request(app.getHttpServer())
        .delete(`${apiKeysUrl(orgId, projectId)}/${createRes.body.id}`)
        .set('Cookie', cookie)
        .expect(204);

      const record = await prisma.projectApiKey.findUnique({
        where: { id: createRes.body.id },
      });
      expect(record!.revokedAt).not.toBeNull();
      expect(record!.revokedBy).toBeDefined();
    });

    it('revoked credential no longer appears in list', async () => {
      const cookie = await registerAndSignIn();
      const orgId = await createOrg(cookie);
      const projectId = await createProject(cookie, orgId);

      const createRes = await request(app.getHttpServer())
        .post(apiKeysUrl(orgId, projectId))
        .set('Cookie', cookie)
        .send({ name: 'WillBeRevoked' })
        .expect(201);

      await request(app.getHttpServer())
        .delete(`${apiKeysUrl(orgId, projectId)}/${createRes.body.id}`)
        .set('Cookie', cookie)
        .expect(204);

      const listRes = await request(app.getHttpServer())
        .get(apiKeysUrl(orgId, projectId))
        .set('Cookie', cookie)
        .expect(200);

      expect(listRes.body).toEqual([]);
    });

    it('rejects unauthenticated (401)', async () => {
      await request(app.getHttpServer())
        .delete(`${apiKeysUrl('org-1', 'proj-1')}/key-1`)
        .expect(401);
    });

    it('rejects non-member (404)', async () => {
      const cookie1 = await registerAndSignIn('user1@example.com');
      const cookie2 = await registerAndSignIn('user2@example.com');
      const orgId = await createOrg(cookie1);
      const projectId = await createProject(cookie1, orgId);

      const createRes = await request(app.getHttpServer())
        .post(apiKeysUrl(orgId, projectId))
        .set('Cookie', cookie1)
        .send({ name: 'Test' })
        .expect(201);

      await request(app.getHttpServer())
        .delete(`${apiKeysUrl(orgId, projectId)}/${createRes.body.id}`)
        .set('Cookie', cookie2)
        .expect(404);
    });

    it('returns 404 for non-existent key', async () => {
      const cookie = await registerAndSignIn();
      const orgId = await createOrg(cookie);
      const projectId = await createProject(cookie, orgId);

      await request(app.getHttpServer())
        .delete(
          `${apiKeysUrl(orgId, projectId)}/00000000-0000-0000-0000-000000000000`,
        )
        .set('Cookie', cookie)
        .expect(404);
    });
  });

  describe('POST /organizations/:orgId/projects/:projectId/api-keys/:keyId/rotate', () => {
    it('rotates a credential: old revoked, new returned (201)', async () => {
      const cookie = await registerAndSignIn();
      const orgId = await createOrg(cookie);
      const projectId = await createProject(cookie, orgId);

      const createRes = await request(app.getHttpServer())
        .post(apiKeysUrl(orgId, projectId))
        .set('Cookie', cookie)
        .send({ name: 'OldKey' })
        .expect(201);

      const rotateRes = await request(app.getHttpServer())
        .post(`${apiKeysUrl(orgId, projectId)}/${createRes.body.id}/rotate`)
        .set('Cookie', cookie)
        .send({ name: 'NewKey' })
        .expect(201);

      expect(rotateRes.body.id).toBeDefined();
      expect(rotateRes.body.id).not.toBe(createRes.body.id);
      expect(rotateRes.body.key).toBeDefined();
      expect(rotateRes.body.name).toBe('NewKey');

      const oldRecord = await prisma.projectApiKey.findUnique({
        where: { id: createRes.body.id },
      });
      expect(oldRecord!.revokedAt).not.toBeNull();
      expect(oldRecord!.revokedBy).toBeDefined();
    });

    it('new key appears in list, old does not', async () => {
      const cookie = await registerAndSignIn();
      const orgId = await createOrg(cookie);
      const projectId = await createProject(cookie, orgId);

      const createRes = await request(app.getHttpServer())
        .post(apiKeysUrl(orgId, projectId))
        .set('Cookie', cookie)
        .send({ name: 'OldKey' })
        .expect(201);

      const rotateRes = await request(app.getHttpServer())
        .post(`${apiKeysUrl(orgId, projectId)}/${createRes.body.id}/rotate`)
        .set('Cookie', cookie)
        .send({ name: 'NewKey' })
        .expect(201);

      const listRes = await request(app.getHttpServer())
        .get(apiKeysUrl(orgId, projectId))
        .set('Cookie', cookie)
        .expect(200);

      expect(listRes.body).toHaveLength(1);
      expect(listRes.body[0].id).toBe(rotateRes.body.id);
      expect(listRes.body[0].name).toBe('NewKey');
    });

    it('rejects unauthenticated (401)', async () => {
      await request(app.getHttpServer())
        .post(`${apiKeysUrl('org-1', 'proj-1')}/key-1/rotate`)
        .send({ name: 'Test' })
        .expect(401);
    });

    it('rejects non-member (404)', async () => {
      const cookie1 = await registerAndSignIn('user1@example.com');
      const cookie2 = await registerAndSignIn('user2@example.com');
      const orgId = await createOrg(cookie1);
      const projectId = await createProject(cookie1, orgId);

      const createRes = await request(app.getHttpServer())
        .post(apiKeysUrl(orgId, projectId))
        .set('Cookie', cookie1)
        .send({ name: 'Test' })
        .expect(201);

      await request(app.getHttpServer())
        .post(`${apiKeysUrl(orgId, projectId)}/${createRes.body.id}/rotate`)
        .set('Cookie', cookie2)
        .send({ name: 'Hack' })
        .expect(404);
    });

    it('returns 404 for non-existent key', async () => {
      const cookie = await registerAndSignIn();
      const orgId = await createOrg(cookie);
      const projectId = await createProject(cookie, orgId);

      await request(app.getHttpServer())
        .post(
          `${apiKeysUrl(orgId, projectId)}/00000000-0000-0000-0000-000000000000/rotate`,
        )
        .set('Cookie', cookie)
        .send({ name: 'Test' })
        .expect(404);
    });
  });

  describe('tenant isolation', () => {
    it("user cannot create credential for another user's project", async () => {
      const cookie1 = await registerAndSignIn('alice@example.com');
      const cookie2 = await registerAndSignIn('bob@example.com');
      const orgId = await createOrg(cookie1);
      const projectId = await createProject(cookie1, orgId);

      await request(app.getHttpServer())
        .post(apiKeysUrl(orgId, projectId))
        .set('Cookie', cookie2)
        .send({ name: 'Hack' })
        .expect(404);
    });

    it("user cannot revoke another user's credential", async () => {
      const cookie1 = await registerAndSignIn('alice@example.com');
      const cookie2 = await registerAndSignIn('bob@example.com');
      const orgId = await createOrg(cookie1);
      const projectId = await createProject(cookie1, orgId);

      const createRes = await request(app.getHttpServer())
        .post(apiKeysUrl(orgId, projectId))
        .set('Cookie', cookie1)
        .send({ name: 'Secret' })
        .expect(201);

      await request(app.getHttpServer())
        .delete(`${apiKeysUrl(orgId, projectId)}/${createRes.body.id}`)
        .set('Cookie', cookie2)
        .expect(404);
    });

    it("user cannot rotate another user's credential", async () => {
      const cookie1 = await registerAndSignIn('alice@example.com');
      const cookie2 = await registerAndSignIn('bob@example.com');
      const orgId = await createOrg(cookie1);
      const projectId = await createProject(cookie1, orgId);

      const createRes = await request(app.getHttpServer())
        .post(apiKeysUrl(orgId, projectId))
        .set('Cookie', cookie1)
        .send({ name: 'Secret' })
        .expect(201);

      await request(app.getHttpServer())
        .post(`${apiKeysUrl(orgId, projectId)}/${createRes.body.id}/rotate`)
        .set('Cookie', cookie2)
        .send({ name: 'Hijacked' })
        .expect(404);
    });
  });
});
