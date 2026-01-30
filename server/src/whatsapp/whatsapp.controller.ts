import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('whatsapp')
export class WhatsappController {
  constructor(private whatsappService: WhatsappService) {}

  // Instance endpoints
  @Get('instances')
  @UseGuards(JwtAuthGuard)
  async getInstances() {
    return this.whatsappService.getInstances();
  }

  @Get('instances/:instanceId')
  @UseGuards(JwtAuthGuard)
  async getInstance(@Param('instanceId') instanceId: string) {
    return this.whatsappService.getInstance(instanceId);
  }

  @Post('instances')
  @UseGuards(JwtAuthGuard)
  async createInstance(@Body() body: any) {
    return this.whatsappService.createInstance(body);
  }

  @Put('instances/:instanceId')
  @UseGuards(JwtAuthGuard)
  async updateInstance(@Param('instanceId') instanceId: string, @Body() body: any) {
    return this.whatsappService.updateInstance(instanceId, body);
  }

  @Delete('instances/:instanceId')
  @UseGuards(JwtAuthGuard)
  async deleteInstance(@Param('instanceId') instanceId: string) {
    return this.whatsappService.deleteInstance(instanceId);
  }

  @Get('instances/:instanceId/qr')
  @UseGuards(JwtAuthGuard)
  async getInstanceQR(@Param('instanceId') instanceId: string) {
    return this.whatsappService.getInstanceQR(instanceId);
  }

  @Get('instances/:instanceId/status')
  @UseGuards(JwtAuthGuard)
  async getInstanceStatus(@Param('instanceId') instanceId: string) {
    return this.whatsappService.getInstanceStatus(instanceId);
  }

  @Post('instances/:instanceId/logout')
  @UseGuards(JwtAuthGuard)
  async logoutInstance(@Param('instanceId') instanceId: string) {
    return this.whatsappService.logoutInstance(instanceId);
  }

  // Contact endpoints
  @Get('contacts')
  @UseGuards(JwtAuthGuard)
  async getContacts(@Query('instanceId') instanceId?: string) {
    return this.whatsappService.getContacts(instanceId);
  }

  @Get('contacts/:contactId')
  @UseGuards(JwtAuthGuard)
  async getContact(@Param('contactId') contactId: string) {
    return this.whatsappService.getContact(contactId);
  }

  // Message endpoints
  @Post('messages/send')
  @UseGuards(JwtAuthGuard)
  async sendMessage(@Body() body: any, @Request() req: any) {
    return this.whatsappService.sendMessage(body.conversationId, body, req.user);
  }

  // Macros
  @Get('macros')
  @UseGuards(JwtAuthGuard)
  async getMacros(@Query('instanceId') instanceId?: string) {
    return this.whatsappService.getMacros(instanceId);
  }

  @Post('macros')
  @UseGuards(JwtAuthGuard)
  async createMacro(@Body() body: any) {
    return this.whatsappService.createMacro(body);
  }

  @Put('macros/:macroId')
  @UseGuards(JwtAuthGuard)
  async updateMacro(@Param('macroId') macroId: string, @Body() body: any) {
    return this.whatsappService.updateMacro(macroId, body);
  }

  @Delete('macros/:macroId')
  @UseGuards(JwtAuthGuard)
  async deleteMacro(@Param('macroId') macroId: string) {
    return this.whatsappService.deleteMacro(macroId);
  }

  @Post('macros/:macroId/use')
  @UseGuards(JwtAuthGuard)
  async useMacro(@Param('macroId') macroId: string) {
    return this.whatsappService.useMacro(macroId);
  }

  // Connect instance (get QR code / reconnect)
  @Post('instances/:instanceId/connect')
  @UseGuards(JwtAuthGuard)
  async connectInstance(@Param('instanceId') instanceId: string) {
    return this.whatsappService.connectInstance(instanceId);
  }

  // Disconnect instance (keep credentials)
  @Post('instances/:instanceId/disconnect')
  @UseGuards(JwtAuthGuard)
  async disconnectInstance(@Param('instanceId') instanceId: string) {
    return this.whatsappService.disconnectInstance(instanceId);
  }

  // Check if number is on WhatsApp
  @Get('instances/:instanceId/check-number/:phoneNumber')
  @UseGuards(JwtAuthGuard)
  async checkNumber(
    @Param('instanceId') instanceId: string,
    @Param('phoneNumber') phoneNumber: string,
  ) {
    return this.whatsappService.checkNumber(instanceId, phoneNumber);
  }

  // Get profile picture
  @Get('instances/:instanceId/profile-picture/:phoneNumber')
  @UseGuards(JwtAuthGuard)
  async getProfilePicture(
    @Param('instanceId') instanceId: string,
    @Param('phoneNumber') phoneNumber: string,
  ) {
    return this.whatsappService.getProfilePicture(instanceId, phoneNumber);
  }

  // Send reaction
  @Post('messages/:messageId/reaction')
  @UseGuards(JwtAuthGuard)
  async sendReaction(
    @Param('messageId') messageId: string,
    @Body() body: { conversationId: string; emoji: string },
  ) {
    return this.whatsappService.sendReaction(body.conversationId, messageId, body.emoji);
  }

  // Mark messages as read
  @Post('conversations/:conversationId/read')
  @UseGuards(JwtAuthGuard)
  async markAsRead(
    @Param('conversationId') conversationId: string,
    @Body() body?: { messageIds?: string[] },
  ) {
    return this.whatsappService.markAsRead(conversationId, body?.messageIds);
  }

  // Group management
  @Get('instances/:instanceId/groups/:groupJid')
  @UseGuards(JwtAuthGuard)
  async getGroupMetadata(
    @Param('instanceId') instanceId: string,
    @Param('groupJid') groupJid: string,
  ) {
    return this.whatsappService.getGroupMetadata(instanceId, groupJid);
  }

  @Post('instances/:instanceId/groups')
  @UseGuards(JwtAuthGuard)
  async createGroup(
    @Param('instanceId') instanceId: string,
    @Body() body: { name: string; participants: string[] },
  ) {
    return this.whatsappService.createGroup(instanceId, body.name, body.participants);
  }
}
