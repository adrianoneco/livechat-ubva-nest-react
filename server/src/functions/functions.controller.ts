import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { FunctionsService } from './functions.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('functions')
@UseGuards(JwtAuthGuard)
export class FunctionsController {
  constructor(private functionsService: FunctionsService) {}

  // Sectors
  @Get('sectors')
  async getSectors() {
    return this.functionsService.getSectors();
  }

  @Get('sectors/:sectorId')
  async getSector(@Param('sectorId') sectorId: string) {
    return this.functionsService.getSector(sectorId);
  }

  @Post('sectors')
  @UseGuards(RolesGuard)
  @Roles('admin', 'supervisor')
  async createSector(@Body() body: any) {
    return this.functionsService.createSector(body);
  }

  @Put('sectors/:sectorId')
  @UseGuards(RolesGuard)
  @Roles('admin', 'supervisor')
  async updateSector(@Param('sectorId') sectorId: string, @Body() body: any) {
    return this.functionsService.updateSector(sectorId, body);
  }

  @Delete('sectors/:sectorId')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async deleteSector(@Param('sectorId') sectorId: string) {
    return this.functionsService.deleteSector(sectorId);
  }

  @Get('sectors/:sectorId/users')
  async getSectorUsers(@Param('sectorId') sectorId: string) {
    return this.functionsService.getSectorUsers(sectorId);
  }

  @Post('sectors/:sectorId/users')
  @UseGuards(RolesGuard)
  @Roles('admin', 'supervisor')
  async assignUserToSector(@Param('sectorId') sectorId: string, @Body() body: { userId: string; isPrimary?: boolean }) {
    return this.functionsService.assignUserToSector(body.userId, sectorId, body.isPrimary);
  }

  @Delete('sectors/:sectorId/users/:userId')
  @UseGuards(RolesGuard)
  @Roles('admin', 'supervisor')
  async removeUserFromSector(@Param('sectorId') sectorId: string, @Param('userId') userId: string) {
    return this.functionsService.removeUserFromSector(userId, sectorId);
  }

  // Webhooks
  @Get('webhooks')
  async getWebhooks(@Request() req: any) {
    return this.functionsService.getWebhooks(req.user.role === 'admin' ? undefined : req.user.userId);
  }

  @Post('webhooks')
  async createWebhook(@Body() body: any, @Request() req: any) {
    return this.functionsService.createWebhook(body, req.user.userId);
  }

  @Put('webhooks/:webhookId')
  async updateWebhook(@Param('webhookId') webhookId: string, @Body() body: any) {
    return this.functionsService.updateWebhook(webhookId, body);
  }

  @Delete('webhooks/:webhookId')
  async deleteWebhook(@Param('webhookId') webhookId: string) {
    return this.functionsService.deleteWebhook(webhookId);
  }

  @Post('webhooks/:webhookId/test')
  async testWebhook(@Param('webhookId') webhookId: string) {
    return this.functionsService.testWebhook(webhookId);
  }

  @Get('webhooks/:webhookId/logs')
  async getWebhookLogs(@Param('webhookId') webhookId: string) {
    return this.functionsService.getWebhookLogs(webhookId);
  }

  // API Tokens
  @Get('api-tokens')
  async getApiTokens(@Request() req: any) {
    return this.functionsService.getApiTokens(req.user.userId);
  }

  @Post('api-tokens')
  async createApiToken(@Body() body: any, @Request() req: any) {
    return this.functionsService.createApiToken(body, req.user.userId);
  }

  @Delete('api-tokens/:tokenId')
  async deleteApiToken(@Param('tokenId') tokenId: string) {
    return this.functionsService.deleteApiToken(tokenId);
  }
}
