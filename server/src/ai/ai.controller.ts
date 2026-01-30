import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { AiService } from './ai.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('ai')
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(private aiService: AiService) {}

  @Post('respond')
  async respond(@Body() body: { conversationId: string; messageId?: string }) {
    return this.aiService.respond(body.conversationId, body.messageId);
  }

  @Post('compose-message')
  async composeMessage(@Body() body: { conversationId?: string; intent: string; context?: string }) {
    return this.aiService.composeMessage(body.intent, body.context);
  }

  @Post('suggest-replies')
  async suggestReplies(@Body() body: { conversationId: string }) {
    return this.aiService.suggestReplies(body.conversationId);
  }

  @Post('learn')
  async learn(@Body() body: { conversationId: string; feedback?: any; rating?: number }) {
    return this.aiService.learn(body.conversationId, body.feedback, body.rating);
  }
}
