import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WhatsappMessage } from '../entities';
import FormData from 'form-data';

@Injectable()
export class AudioService {
  constructor(
    @InjectRepository(WhatsappMessage)
    private messageRepository: Repository<WhatsappMessage>,
  ) {}

  async transcribe(messageId: string) {
    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    if (!GROQ_API_KEY) throw new BadRequestException('Transcrição não configurada: GROQ_API_KEY não encontrada');
    if (!messageId) throw new BadRequestException('Message ID is required');

    const message = await this.messageRepository.findOne({ where: { id: messageId } });
    if (!message) throw new NotFoundException('Message not found');

    const metadata = message.metadata as any || {};
    if (metadata.audioTranscription || metadata.transcriptionStatus === 'processing') {
      return { success: true, transcription: metadata.audioTranscription };
    }

    if (!message.mediaUrl) throw new BadRequestException('No audio URL');

    await this.messageRepository.update(messageId, {
      metadata: { ...metadata, transcriptionStatus: 'processing' },
    });

    try {
      let audioUrl = message.mediaUrl;
      const audioResponse = await fetch(audioUrl);
      if (!audioResponse.ok) {
        await this.messageRepository.update(messageId, { metadata: { ...metadata, transcriptionStatus: 'failed' } });
        throw new BadRequestException(`Failed to download audio: ${audioResponse.status}`);
      }

      const audioBuffer = await audioResponse.arrayBuffer();
      const mimeType = message.mediaMimetype || 'audio/m4a';

      const formData = new FormData();
      formData.append('file', Buffer.from(audioBuffer), { filename: 'audio.m4a', contentType: mimeType });
      formData.append('model', 'whisper-large-v3');

      const groqResp = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          ...formData.getHeaders(),
        },
        body: formData.getBuffer() as any,
      });

      if (!groqResp.ok) {
        const errText = await groqResp.text();
        await this.messageRepository.update(messageId, { metadata: { ...metadata, transcriptionStatus: 'failed' } });
        throw new BadRequestException('Transcription failed: ' + errText);
      }

      const parsed = await groqResp.json() as { text?: string; transcription?: string };
      const transcription = parsed?.text || parsed?.transcription || '';

      await this.messageRepository.update(messageId, {
        metadata: { ...metadata, audioTranscription: transcription, transcriptionStatus: 'completed' },
      });

      return { success: true, transcription };
    } catch (error: any) {
      await this.messageRepository.update(messageId, { metadata: { ...metadata, transcriptionStatus: 'failed' } });
      throw error;
    }
  }
}
