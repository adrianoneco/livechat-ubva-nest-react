import { Controller, Get, Post, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { EscalationsService } from './escalations.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('escalations')
@UseGuards(JwtAuthGuard)
export class EscalationsController {
  constructor(private escalationsService: EscalationsService) {}

  @Post()
  async create(@Body() body: any) {
    return this.escalationsService.create(body);
  }

  @Get()
  async findAll(@Query('status') status?: string, @Query('priority') priority?: string) {
    return this.escalationsService.findAll({ status, priority });
  }

  @Post('distribute')
  @UseGuards(RolesGuard)
  @Roles('admin', 'supervisor')
  async distribute(@Body() body: { escalationId: string; assignTo: string }) {
    return this.escalationsService.distribute(body.escalationId, body.assignTo);
  }

  @Post(':escalationId/resolve')
  async resolve(@Param('escalationId') escalationId: string, @Body() body: { notes?: string }, @Request() req: any) {
    return this.escalationsService.resolve(escalationId, body.notes, req.user.userId);
  }
}
