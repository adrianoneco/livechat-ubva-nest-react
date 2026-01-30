import { Controller, Post, Get, Body, UseGuards, Request, HttpException, HttpStatus, BadRequestException, Inject } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AuthService)
    private readonly authService: AuthService
  ) {
    console.log('🎯 [AuthController] Constructor called, authService:', !!this.authService);
  }

  @Post('register')
  async register(@Body() body: { email: string; password: string; fullName?: string }) {
    try {
      console.log('📝 [AuthController] Register request received:', { email: body.email, fullName: body.fullName });
      
      if (!body.email || !body.password) {
        throw new BadRequestException('Email and password are required');
      }

      const result = await this.authService.register(body.email, body.password, body.fullName);
      console.log('✅ [AuthController] Register successful:', result.user.email);
      return result;
    } catch (error: any) {
      console.error('❌ [AuthController] Register failed:', error);
      
      if (error instanceof BadRequestException) {
        throw error;
      }
      
      throw new HttpException(
        error?.message || 'Registration failed',
        error?.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Post('login')
  async login(@Body() body: { email: string; password: string }) {
    try {
      console.log('📝 [AuthController] Login request received:', { email: body.email });
      const result = await this.authService.login(body.email, body.password);
      console.log('✅ [AuthController] Login successful:', body.email);
      return result;
    } catch (error: any) {
      console.error('❌ [AuthController] Login failed:', error);
      throw error;
    }
  }

  @Post('refresh')
  async refresh(@Body() body: { refreshToken: string }) {
    return this.authService.refresh(body.refreshToken);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMe(@Request() req: any) {
    return this.authService.getMe(req.user.userId);
  }
}
