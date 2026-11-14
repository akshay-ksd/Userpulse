export type * from '@prisma/client';
export { Prisma, PrismaClient } from '@prisma/client';

import { PrismaClient } from '@prisma/client';

export function createPrismaClient(): InstanceType<typeof PrismaClient> {
  return new PrismaClient();
}
