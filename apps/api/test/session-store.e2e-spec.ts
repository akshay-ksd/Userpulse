process.env.DATABASE_URL ??=
  'postgresql://postgres:postgres@localhost:5432/userpulse?schema=public';

import { AuthenticationStorage } from '@nestjs/authentication';
import { authenticationStoreContract } from '@nestjs/authentication/testing';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { PrismaSessionStore } from '../src/auth/session.store.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const prisma = new PrismaService();

async function emptyStore() {
  await prisma.session.deleteMany();
  return {
    sessions: new PrismaSessionStore(prisma, new AuthenticationStorage()),
  };
}

describe('PrismaSessionStore (contract, real PostgreSQL)', () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.session.deleteMany();
    await prisma.$disconnect();
  });

  for (const testCase of authenticationStoreContract(emptyStore, {
    contracts: ['sessions'],
    concurrent: true,
  })) {
    it(testCase.name, () => testCase.run(), 20_000);
  }
});
