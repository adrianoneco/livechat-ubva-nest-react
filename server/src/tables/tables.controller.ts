import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { TablesService } from './tables.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('tables')
@UseGuards(JwtAuthGuard)
export class TablesController {
  constructor(private tablesService: TablesService) {}

  @Get(':table')
  async query(
    @Param('table') table: string,
    @Query() query: any,
  ) {
    const { limit, offset, orderBy, order, ...filters } = query;
    return this.tablesService.query(table, filters, { limit: parseInt(limit), offset: parseInt(offset), orderBy, order });
  }

  @Post(':table')
  async insert(@Param('table') table: string, @Body() body: any) {
    return this.tablesService.insert(table, body);
  }

  @Put(':table/:id')
  async update(@Param('table') table: string, @Param('id') id: string, @Body() body: any) {
    return this.tablesService.update(table, id, body);
  }

  @Delete(':table/:id')
  async delete(@Param('table') table: string, @Param('id') id: string) {
    return this.tablesService.delete(table, id);
  }
}
