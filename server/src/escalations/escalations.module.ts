import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EscalationsController } from './escalations.controller';
import { EscalationsService } from './escalations.service';
import { Escalation, WhatsappConversationNote } from '../entities';

@Module({
  imports: [TypeOrmModule.forFeature([Escalation, WhatsappConversationNote])],
  controllers: [EscalationsController],
  providers: [EscalationsService],
})
export class EscalationsModule {}
