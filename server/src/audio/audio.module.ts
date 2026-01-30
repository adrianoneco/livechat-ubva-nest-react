import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AudioController } from './audio.controller';
import { AudioService } from './audio.service';
import { WhatsappMessage } from '../entities';

@Module({
  imports: [TypeOrmModule.forFeature([WhatsappMessage])],
  controllers: [AudioController],
  providers: [AudioService],
})
export class AudioModule {}
