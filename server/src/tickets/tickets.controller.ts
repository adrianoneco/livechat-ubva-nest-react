import { Controller, Get, Post, Put, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { TicketsService } from './tickets.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('tickets')
@UseGuards(JwtAuthGuard)
export class TicketsController {
  constructor(private ticketsService: TicketsService) {}

  @Get()
  async findAll(
    @Query('status') status?: string,
    @Query('sectorId') sectorId?: string,
    @Query('sector_id') sector_id?: string,
    @Query('conversationId') conversationId?: string,
    @Query('conversation_id') conversation_id?: string,
  ) {
    return this.ticketsService.findAll({
      status,
      sectorId: sectorId || sector_id,
      conversationId: conversationId || conversation_id,
    });
  }

  @Get('sla/config')
  async getSlaConfig(@Query('sectorId') sectorId?: string) {
    return this.ticketsService.getSlaConfig(sectorId);
  }

  @Post('sla/config')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async saveSlaConfig(@Body() body: any) {
    return this.ticketsService.saveSlaConfig(body);
  }

  @Get('sla/violations')
  async getSlaViolations(@Query('ticketId') ticketId?: string, @Query('violationType') violationType?: string) {
    return this.ticketsService.getSlaViolations({ ticketId, violationType });
  }

  @Post('sla/check-violations')
  @UseGuards(RolesGuard)
  @Roles('admin', 'supervisor')
  async checkSlaViolations() {
    return this.ticketsService.checkSlaViolations();
  }

  @Get(':ticketId')
  async findOne(@Param('ticketId') ticketId: string) {
    return this.ticketsService.findOne(ticketId);
  }

  @Post()
  async create(@Body() body: { conversationId?: string; sectorId?: string; conversation_id?: string; sector_id?: string }) {
    return this.ticketsService.create(body.conversationId || body.conversation_id, body.sectorId || body.sector_id);
  }

  @Put(':ticketId')
  async update(@Param('ticketId') ticketId: string, @Body() body: any, @Request() req: any) {
    return this.ticketsService.update(ticketId, body, req.user.userId);
  }
}
