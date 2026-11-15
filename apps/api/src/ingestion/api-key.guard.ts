import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';

export interface IngestionContext {
  projectId: string;
  organizationId: string;
  apiKeyId: string;
}

const INGESTION_CONTEXT_KEY = 'ingestionContext';

export function getIngestionContext(request: any): IngestionContext {
  return request[INGESTION_CONTEXT_KEY];
}

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader: string | undefined = request.headers?.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException(
        'Missing or invalid Authorization header.',
      );
    }

    const rawKey = authHeader.slice(7);
    if (!rawKey) {
      throw new UnauthorizedException('Missing API key.');
    }

    const keyHash = createHash('sha256').update(rawKey).digest('hex');

    const apiKey = await this.prisma.projectApiKey.findUnique({
      where: { keyHash },
      include: { project: true },
    });

    if (!apiKey) {
      throw new UnauthorizedException('Invalid API key.');
    }

    if (apiKey.revokedAt) {
      throw new ForbiddenException('API key has been revoked.');
    }

    if (apiKey.project.status !== 'ACTIVE') {
      throw new ForbiddenException('Project is not active.');
    }

    request[INGESTION_CONTEXT_KEY] = {
      projectId: apiKey.projectId,
      organizationId: apiKey.project.organizationId,
      apiKeyId: apiKey.id,
    } satisfies IngestionContext;

    return true;
  }
}
