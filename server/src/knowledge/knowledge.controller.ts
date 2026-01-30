import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { KnowledgeService } from './knowledge.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('knowledge')
@UseGuards(JwtAuthGuard)
export class KnowledgeController {
  constructor(private knowledgeService: KnowledgeService) {}

  @Get()
  async findAll(@Query('sectorId') sectorId?: string, @Query('category') category?: string, @Query('search') search?: string) {
    return this.knowledgeService.findAll({ sectorId, category, search });
  }

  @Post('manage')
  @UseGuards(RolesGuard)
  @Roles('admin', 'supervisor')
  async create(@Body() body: any, @Request() req: any) {
    return this.knowledgeService.create(body, req.user.userId);
  }

  @Put('manage/:entryId')
  @UseGuards(RolesGuard)
  @Roles('admin', 'supervisor')
  async update(@Param('entryId') entryId: string, @Body() body: any) {
    return this.knowledgeService.update(entryId, body);
  }

  @Delete('manage/:entryId')
  @UseGuards(RolesGuard)
  @Roles('admin', 'supervisor')
  async delete(@Param('entryId') entryId: string) {
    return this.knowledgeService.delete(entryId);
  }

  @Post(':entryId/use')
  async trackUsage(@Param('entryId') entryId: string) {
    return this.knowledgeService.trackUsage(entryId);
  }
}
