import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { LeadsService } from './leads.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('leads')
@UseGuards(JwtAuthGuard)
export class LeadsController {
  constructor(private leadsService: LeadsService) {}

  @Post()
  async create(@Body() body: any, @Request() req: any) {
    return this.leadsService.create(body, req.user.userId);
  }

  @Get()
  async findAll(@Query('status') status?: string, @Query('assignedTo') assignedTo?: string, @Query('assigned_to') assigned_to?: string) {
    return this.leadsService.findAll({ status, assignedTo: assignedTo || assigned_to });
  }

  @Get(':leadId')
  async findOne(@Param('leadId') leadId: string) {
    return this.leadsService.findOne(leadId);
  }

  @Put(':leadId')
  async update(@Param('leadId') leadId: string, @Body() body: any, @Request() req: any) {
    return this.leadsService.update(leadId, body, req.user.userId);
  }

  @Post(':leadId/activities')
  async addActivity(@Param('leadId') leadId: string, @Body() body: any, @Request() req: any) {
    return this.leadsService.addActivity(leadId, body, req.user.userId);
  }

  @Delete(':leadId')
  async delete(@Param('leadId') leadId: string) {
    return this.leadsService.delete(leadId);
  }
}
