import { Controller, Get, Post, Param, Body, UseGuards, Request } from '@nestjs/common';
import { CampaignsService } from './campaigns.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('campaigns')
@UseGuards(JwtAuthGuard)
export class CampaignsController {
  constructor(private campaignsService: CampaignsService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles('admin', 'supervisor')
  async create(@Body() body: any, @Request() req: any) {
    return this.campaignsService.create(body, req.user.userId);
  }

  @Get()
  async findAll() {
    return this.campaignsService.findAll();
  }

  @Get(':campaignId')
  async findOne(@Param('campaignId') campaignId: string) {
    return this.campaignsService.findOne(campaignId);
  }

  @Post(':campaignId/send')
  @UseGuards(RolesGuard)
  @Roles('admin', 'supervisor')
  async send(@Param('campaignId') campaignId: string) {
    return this.campaignsService.send(campaignId);
  }

  @Post(':campaignId/cancel')
  @UseGuards(RolesGuard)
  @Roles('admin', 'supervisor')
  async cancel(@Param('campaignId') campaignId: string) {
    return this.campaignsService.cancel(campaignId);
  }
}
