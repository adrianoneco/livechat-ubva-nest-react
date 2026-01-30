import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { Profile, UserPassword, UserRole } from '../entities';

@Module({
  imports: [TypeOrmModule.forFeature([Profile, UserPassword, UserRole])],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
