import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Request, All, Req, Res } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Response } from 'express';

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

  // Webhook endpoint (no auth)
  @All('webhooks/:instanceName')
  async handleWebhook(
    @Param('instanceName') instanceName: string,
    @Body() body: any,
    @Res() res: Response,
  ) {
    try {
      const result = await this.whatsappService.handleWebhook(instanceName, body);
      return res.json(result);
    } catch (error) {
      console.error('[webhook] Error:', error);
      return res.status(200).json({ received: true, error: String(error) });
    }
  }
}
