import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { FunnelsController } from './funnels.controller.js';
import { FunnelsService } from './funnels.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [FunnelsController],
  providers: [FunnelsService],
  exports: [FunnelsService],
})
export class FunnelsModule {}
