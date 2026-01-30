import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { WhatsappMessage, WhatsappContact, WhatsappConversationNote } from '../entities';

@Module({
  imports: [TypeOrmModule.forFeature([WhatsappMessage, WhatsappContact, WhatsappConversationNote])],
  controllers: [AiController],
  providers: [AiService],
})
export class AiModule {}
