import { Controller, Get, Put, Body, Param, UseGuards, Request } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get('me')
  async getMyProfile(@Request() req: any) {
    return this.usersService.getProfile(req.user.userId);
  }

  @Put('me')
  async updateMyProfile(@Request() req: any, @Body() body: { fullName?: string; avatarUrl?: string; status?: string }) {
    return this.usersService.updateProfile(req.user.userId, body);
  }

  @Get()
  async getAllUsers() {
    return this.usersService.getAllUsers();
  }

  @Get(':userId')
  async getUserById(@Param('userId') userId: string) {
    return this.usersService.getUserById(userId);
  }
}
