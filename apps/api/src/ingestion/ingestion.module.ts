import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { IngestionController } from './ingestion.controller.js';
import { IngestionService } from './ingestion.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [IngestionController],
  providers: [IngestionService],
})
export class IngestionModule {}
