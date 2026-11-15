import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';

export interface ApiKeyPayload {
  projectId: string;
  organizationId: string;
  apiKeyId: string;
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
      include: {
        project: { select: { id: true, organizationId: true, status: true } },
      },
    });

    if (!apiKey || apiKey.revokedAt) {
      throw new UnauthorizedException('Invalid or revoked API key.');
    }

    if (apiKey.project.status !== 'ACTIVE') {
      throw new ForbiddenException('Project is not accepting events.');
    }

    request.apiKeyPayload = {
      projectId: apiKey.project.id,
      organizationId: apiKey.project.organizationId,
      apiKeyId: apiKey.id,
    } satisfies ApiKeyPayload;

    return true;
  }
}
