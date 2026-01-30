import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Profile, UserPassword, UserRole } from '../entities';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(Profile)
    private profileRepository: Repository<Profile>,
    @InjectRepository(UserPassword)
    private passwordRepository: Repository<UserPassword>,
    @InjectRepository(UserRole)
    private roleRepository: Repository<UserRole>,
  ) {}

  async resetPassword(userId: string, newPassword: string) {
    if (!newPassword || newPassword.length < 6) {
      throw new BadRequestException('Password must be at least 6 characters');
    }
    const user = await this.profileRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.passwordRepository.update({ userId }, { passwordHash });
    return { success: true, message: 'Password reset successfully' };
  }

  async approveUser(userId: string) {
    const user = await this.profileRepository.save({ id: userId, isApproved: true, updatedAt: new Date() });
    return { success: true, user };
  }

  async deactivateUser(userId: string) {
    const user = await this.profileRepository.save({ id: userId, isActive: false, updatedAt: new Date() });
    return { success: true, user };
  }

  async changeRole(userId: string, role: string) {
    if (!['admin', 'supervisor', 'agent'].includes(role)) {
      throw new BadRequestException('Invalid role');
    }
    await this.roleRepository.update({ userId }, { role: role as any });
    return { success: true, role };
  }

  async getAllUsers() {
    const users = await this.profileRepository
      .createQueryBuilder('p')
      .leftJoin('user_roles', 'ur', 'ur.user_id = p.id')
      .addSelect('ur.role', 'role')
      .getRawMany();

    return {
      users: users.map(u => ({
        id: u.p_id,
        fullName: u.p_full_name,
        email: u.p_email,
        avatarUrl: u.p_avatar_url,
        status: u.p_status,
        isActive: u.p_is_active,
        isApproved: u.p_is_approved,
        createdAt: u.p_created_at,
        role: u.role,
      }))
    };
  }
}
