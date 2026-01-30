import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FunctionsController } from './functions.controller';
import { FunctionsService } from './functions.service';
import { Sector, UserSector, SectorInstance, SectorAllowedGroup, WhatsappInstance, WhatsappConversation, Webhook, WebhookLog, ApiToken, ApiUsageLog } from '../entities';

@Module({
  imports: [TypeOrmModule.forFeature([Sector, UserSector, SectorInstance, SectorAllowedGroup, WhatsappInstance, WhatsappConversation, Webhook, WebhookLog, ApiToken, ApiUsageLog])],
  controllers: [FunctionsController],
  providers: [FunctionsService],
})
export class FunctionsModule {}
