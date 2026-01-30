import { Controller, Get, Post, Put, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { MeetingsService } from './meetings.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('meetings')
@UseGuards(JwtAuthGuard)
export class MeetingsController {
  constructor(private meetingsService: MeetingsService) {}

  @Post('schedule')
  async schedule(@Body() body: any, @Request() req: any) {
    return this.meetingsService.schedule(body, req.user.userId);
  }

  @Get()
  async findAll(@Query('status') status?: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.meetingsService.findAll({ status, from, to });
  }

  @Put(':meetingId')
  async update(@Param('meetingId') meetingId: string, @Body() body: any) {
    return this.meetingsService.update(meetingId, body);
  }

  @Post(':meetingId/cancel')
  async cancel(@Param('meetingId') meetingId: string) {
    return this.meetingsService.cancel(meetingId);
  }
}
