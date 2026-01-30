import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';
import { Ticket, SlaConfig, SlaViolation } from '../entities';
import { WhatsappModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Ticket, SlaConfig, SlaViolation]),
    forwardRef(() => WhatsappModule),
  ],
  controllers: [TicketsController],
  providers: [TicketsService],
})
export class TicketsModule {}
