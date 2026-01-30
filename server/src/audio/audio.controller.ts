import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { AudioService } from './audio.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('audio')
@UseGuards(JwtAuthGuard)
export class AudioController {
  constructor(private audioService: AudioService) {}

  @Post('transcribe')
  async transcribe(@Body() body: { messageId: string }) {
    return this.audioService.transcribe(body.messageId);
  }
}
