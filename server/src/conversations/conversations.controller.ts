import { Controller, Get, Put, Post, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { ConversationsService } from './conversations.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('conversations')
@UseGuards(JwtAuthGuard)
export class ConversationsController {
  constructor(private conversationsService: ConversationsService) {}

  @Get()
  async getConversations(
    @Query('status') status?: string,
    @Query('assignedTo') assignedTo?: string,
    @Query('search') search?: string,
  ) {
    return this.conversationsService.getConversations({ status, assignedTo, search });
  }

  @Get(':conversationId')
  async getConversationById(@Param('conversationId') conversationId: string) {
    return this.conversationsService.getConversationById(conversationId);
  }

  @Put(':conversationId')
  async updateConversation(
    @Param('conversationId') conversationId: string,
    @Body() updates: any,
  ) {
    return this.conversationsService.updateConversation(conversationId, updates);
  }

  @Post(':conversationId/read')
  async markAsRead(@Param('conversationId') conversationId: string) {
    return this.conversationsService.markAsRead(conversationId);
  }

  @Post(':conversationId/assign')
  async assignConversation(
    @Param('conversationId') conversationId: string,
    @Body() body: { assignedTo: string },
  ) {
    return this.conversationsService.assignConversation(conversationId, body.assignedTo);
  }

  @Post(':conversationId/mode')
  async changeMode(
    @Param('conversationId') conversationId: string,
    @Body() body: { mode: string },
  ) {
    return this.conversationsService.changeMode(conversationId, body.mode);
  }
}
