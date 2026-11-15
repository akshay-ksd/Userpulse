import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Public } from '@nestjs/authentication';
import { ApiKeyGuard, getIngestionContext } from './api-key.guard.js';
import { IngestionService, type BatchResult } from './ingestion.service.js';
import {
  submitEventsSchema,
  type SubmitEventsDto,
} from './submit-events.dto.js';

@Controller('v1/events')
export class IngestionController {
  constructor(private readonly ingestionService: IngestionService) {}

  @Public()
  @UseGuards(ApiKeyGuard)
  @Post()
  @HttpCode(202)
  async submitEvents(
    @Body({ schema: submitEventsSchema }) dto: SubmitEventsDto,
    @Req() request: any,
  ): Promise<BatchResult> {
    const ctx = getIngestionContext(request);
    return this.ingestionService.submitBatch(
      ctx.organizationId,
      ctx.projectId,
      ctx.apiKeyId,
      dto.batch,
    );
  }
}
