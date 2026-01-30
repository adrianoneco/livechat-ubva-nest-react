import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsappService } from './whatsapp.service';
import { WhatsappController } from './whatsapp.controller';
import { BaileysService } from './baileys.service';
import {
  WhatsappInstance,
  WhatsappInstanceSecret,
  WhatsappContact,
  WhatsappConversation,
  WhatsappMessage,
  WhatsappMacro,
} from '../entities';
import { WebsocketModule } from '../websocket/websocket.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WhatsappInstance,
      WhatsappInstanceSecret,
      WhatsappContact,
      WhatsappConversation,
      WhatsappMessage,
      WhatsappMacro,
    ]),
    forwardRef(() => WebsocketModule),
  ],
  providers: [WhatsappService, BaileysService],
  controllers: [WhatsappController],
  exports: [WhatsappService, BaileysService],
})
export class WhatsappModule {}
