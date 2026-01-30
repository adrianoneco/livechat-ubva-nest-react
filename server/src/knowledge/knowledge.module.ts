import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KnowledgeController } from './knowledge.controller';
import { KnowledgeService } from './knowledge.service';
import { KnowledgeBase, KnowledgeOptimizationLog } from '../entities';

@Module({
  imports: [TypeOrmModule.forFeature([KnowledgeBase, KnowledgeOptimizationLog])],
  controllers: [KnowledgeController],
  providers: [KnowledgeService],
})
export class KnowledgeModule {}
