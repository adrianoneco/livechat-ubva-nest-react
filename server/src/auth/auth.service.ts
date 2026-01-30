import { Injectable, BadRequestException, UnauthorizedException, Inject } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { Profile, UserPassword, UserRole } from '../entities';

const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-change-this';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(Profile)
    private readonly profileRepository: Repository<Profile>,
    @InjectRepository(UserPassword)
    private readonly userPasswordRepository: Repository<UserPassword>,
    @InjectRepository(UserRole)
    private readonly userRoleRepository: Repository<UserRole>,
    @Inject(JwtService)
    private readonly jwtService: JwtService,
  ) {
    console.log('✅ [AuthService] Service initialized');
  }

  async register(email: string, password: string, fullName?: string) {
    console.log('🔧 [AuthService] Starting registration for:', email);

    if (!email || !password) {
      throw new BadRequestException('Email and password are required');
    }

    if (password.length < 6) {
      throw new BadRequestException('Password must be at least 6 characters');
    }

    try {
      // Check if user exists
      const existingUser = await this.profileRepository.findOne({ where: { email } });
      if (existingUser) {
        throw new BadRequestException('User already exists');
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);
      const userId = uuidv4();

      // Check if first user (should be admin)
      const userCount = await this.profileRepository.count();
      const isFirstUser = userCount === 0;

      console.log('👤 [AuthService] Creating user, isFirstUser:', isFirstUser);

      // Create user
      const user = await this.profileRepository.save({
        id: userId,
        email,
        fullName: fullName || email.split('@')[0],
        isActive: true,
        isApproved: true,
      });

      console.log('🔐 [AuthService] Saving password...');

      // Store password
      await this.userPasswordRepository.save({
        userId: user.id,
        passwordHash: hashedPassword,
      });

      console.log('👔 [AuthService] Assigning role...');

      // Assign role
      const role = isFirstUser ? 'admin' : 'agent';
      await this.userRoleRepository.save({
        userId: user.id,
        role: role as 'admin' | 'supervisor' | 'agent',
      });

      console.log('✅ [AuthService] Registration completed successfully');

      return {
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          isApproved: user.isApproved,
          role,
        },
      };
    } catch (error: any) {
      console.error('❌ [AuthService] Registration error:', error.message);
      console.error('Stack:', error.stack);
      throw error;
    }
  }

  async login(email: string, password: string) {
    try {
      console.log('🔐 [AuthService] Login attempt for:', email);

      const user = await this.profileRepository.findOne({
        where: { email },
        relations: ['password', 'roles'],
      });

      if (!user || !user.password) {
        throw new UnauthorizedException('Invalid credentials');
      }

      const validPassword = await bcrypt.compare(password, user.password.passwordHash);
      if (!validPassword) {
        throw new UnauthorizedException('Invalid credentials');
      }

      const role = user.roles?.[0]?.role || 'agent';
      const payload = {
        userId: user.id,
        email: user.email,
        role,
      };

      const accessToken = this.jwtService.sign(payload);
      const refreshToken = this.jwtService.sign(payload, {
        secret: JWT_REFRESH_SECRET,
        expiresIn: JWT_REFRESH_EXPIRES_IN,
      });

      console.log('✅ [AuthService] Login successful for:', email);

      return {
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          role,
        },
        accessToken,
        refreshToken,
      };
    } catch (error: any) {
      console.error('❌ [AuthService] Login error:', error.message);
      throw error;
    }
  }

  async refresh(refreshToken: string) {
    if (!refreshToken) {
      throw new UnauthorizedException('No refresh token provided');
    }

    try {
      const decoded = this.jwtService.verify(refreshToken, { secret: JWT_REFRESH_SECRET });
      const accessToken = this.jwtService.sign({
        userId: decoded.userId,
        email: decoded.email,
        role: decoded.role,
      });
      return { accessToken };
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async getMe(userId: string) {
    const user = await this.profileRepository.findOne({
      where: { id: userId },
      relations: ['roles'],
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      avatarUrl: user.avatarUrl,
      status: user.status,
      isActive: user.isActive,
      role: user.roles?.[0]?.role || 'agent',
    };
  }
}
