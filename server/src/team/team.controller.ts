import { Controller, Get, Post, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { TeamService } from './team.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('team')
export class TeamController {
  constructor(private teamService: TeamService) {}

  @Post('invite')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'supervisor')
  async invite(@Body() body: { email: string; role?: string; sectorId?: string }, @Request() req: any) {
    return this.teamService.invite(body.email, body.role || 'agent', body.sectorId, req.user.userId);
  }

  @Get('invites')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'supervisor')
  async getInvites() {
    return this.teamService.getInvites();
  }

  @Post('accept-invite/:token')
  async acceptInvite(@Param('token') token: string, @Body() body: { fullName: string; password: string }) {
    return this.teamService.acceptInvite(token, body.fullName, body.password);
  }

  @Delete('invites/:inviteId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'supervisor')
  async revokeInvite(@Param('inviteId') inviteId: string) {
    return this.teamService.revokeInvite(inviteId);
  }
}
