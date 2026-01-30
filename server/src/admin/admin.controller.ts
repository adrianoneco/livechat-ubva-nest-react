import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminController {
  constructor(private adminService: AdminService) {}

  @Post('reset-password/:userId')
  @Roles('admin')
  async resetPassword(@Param('userId') userId: string, @Body() body: { newPassword: string }) {
    return this.adminService.resetPassword(userId, body.newPassword);
  }

  @Post('approve-user/:userId')
  @Roles('admin')
  async approveUser(@Param('userId') userId: string) {
    return this.adminService.approveUser(userId);
  }

  @Post('deactivate-user/:userId')
  @Roles('admin')
  async deactivateUser(@Param('userId') userId: string) {
    return this.adminService.deactivateUser(userId);
  }

  @Post('change-role/:userId')
  @Roles('admin')
  async changeRole(@Param('userId') userId: string, @Body() body: { role: string }) {
    return this.adminService.changeRole(userId, body.role);
  }

  @Get('users')
  @Roles('admin', 'supervisor')
  async getAllUsers() {
    return this.adminService.getAllUsers();
  }
}
