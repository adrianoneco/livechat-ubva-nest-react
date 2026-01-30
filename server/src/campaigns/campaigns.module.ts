import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';
import { Campaign, CampaignMessage, WhatsappContact } from '../entities';

@Module({
  imports: [TypeOrmModule.forFeature([Campaign, CampaignMessage, WhatsappContact])],
  controllers: [CampaignsController],
  providers: [CampaignsService],
})
export class CampaignsModule {}
