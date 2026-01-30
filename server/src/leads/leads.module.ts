import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';
import { Lead, LeadActivity, LeadStatusHistory } from '../entities';

@Module({
  imports: [TypeOrmModule.forFeature([Lead, LeadActivity, LeadStatusHistory])],
  controllers: [LeadsController],
  providers: [LeadsService],
})
export class LeadsModule {}
