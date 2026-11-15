import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Public } from '@nestjs/authentication';
import { ApiKeyGuard, type ApiKeyPayload } from './api-key.guard.js';
import {
  IngestionService,
  type SubmitBatchResult,
} from './ingestion.service.js';
import { submitBatchSchema, type SubmitBatchDto } from './ingestion.dto.js';

@Controller('v1/events')
export class IngestionController {
  constructor(private readonly ingestionService: IngestionService) {}

  @Public()
  @UseGuards(ApiKeyGuard)
  @Post()
  @HttpCode(202)
  async submitBatch(
    @Body({ schema: submitBatchSchema }) dto: SubmitBatchDto,
    @Req() req: { apiKeyPayload: ApiKeyPayload },
  ): Promise<{ accepted: boolean } & SubmitBatchResult> {
    const { projectId, organizationId, apiKeyId } = req.apiKeyPayload;

    const result = await this.ingestionService.submitBatch(
      projectId,
      organizationId,
      apiKeyId,
      dto.batch,
    );

    return { accepted: true, ...result };
  }
}
