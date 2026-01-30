import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { SetupService } from './setup.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('setup')
@UseGuards(JwtAuthGuard)
export class SetupController {
  constructor(private setupService: SetupService) {}

  @Post('config')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async saveConfig(@Body() body: { config: Record<string, any> }) {
    return this.setupService.saveConfig(body.config);
  }

  @Get('config')
  async getConfig() {
    return this.setupService.getConfig();
  }

  @Get('status')
  async getStatus() {
    return this.setupService.getStatus();
  }
}
