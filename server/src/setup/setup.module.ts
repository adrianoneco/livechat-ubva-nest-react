import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SetupController } from './setup.controller';
import { SetupService } from './setup.service';
import { ProjectConfig } from '../entities';

@Module({
  imports: [TypeOrmModule.forFeature([ProjectConfig])],
  controllers: [SetupController],
  providers: [SetupService],
})
export class SetupModule {}
