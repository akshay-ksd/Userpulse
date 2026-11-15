import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { EventProcessorController } from './event-processor.controller.js';
import { EventProcessorService } from './event-processor.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [EventProcessorController],
  providers: [EventProcessorService],
})
export class EventProcessorModule {}
