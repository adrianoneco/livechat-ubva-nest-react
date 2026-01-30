import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Profile, UserRole } from '../entities';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(Profile)
    private profileRepository: Repository<Profile>,
    @InjectRepository(UserRole)
    private userRoleRepository: Repository<UserRole>,
  ) {}

  async getProfile(userId: string) {
    const profile = await this.profileRepository
      .createQueryBuilder('p')
      .leftJoin('user_roles', 'ur', 'ur.user_id = p.id')
      .addSelect('ur.role', 'role')
      .where('p.id = :userId', { userId })
      .getRawOne();

    if (!profile) {
      throw new NotFoundException('Profile not found');
    }

    return {
      profile: {
        id: profile.p_id,
        fullName: profile.p_full_name,
        email: profile.p_email,
        avatarUrl: profile.p_avatar_url,
        status: profile.p_status,
        isActive: profile.p_is_active,
        isApproved: profile.p_is_approved,
        createdAt: profile.p_created_at,
        role: profile.role,
      }
    };
  }

  async updateProfile(userId: string, data: { fullName?: string; avatarUrl?: string; status?: string }) {
    const updated = await this.profileRepository.save({
      id: userId,
      ...data,
      updatedAt: new Date(),
    });

    return { success: true, profile: updated };
  }

  async getAllUsers() {
    const users = await this.profileRepository
      .createQueryBuilder('p')
      .leftJoin('user_roles', 'ur', 'ur.user_id = p.id')
      .addSelect('ur.role', 'role')
      .where('p.is_active = :isActive', { isActive: true })
      .getRawMany();

    return {
      users: users.map(u => ({
        id: u.p_id,
        fullName: u.p_full_name,
        email: u.p_email,
        avatarUrl: u.p_avatar_url,
        status: u.p_status,
        isActive: u.p_is_active,
        role: u.role,
      }))
    };
  }

  async getUserById(userId: string) {
    const user = await this.profileRepository
      .createQueryBuilder('p')
      .leftJoin('user_roles', 'ur', 'ur.user_id = p.id')
      .addSelect('ur.role', 'role')
      .where('p.id = :userId', { userId })
      .getRawOne();

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      user: {
        id: user.p_id,
        fullName: user.p_full_name,
        email: user.p_email,
        avatarUrl: user.p_avatar_url,
        status: user.p_status,
        isActive: user.p_is_active,
        isApproved: user.p_is_approved,
        createdAt: user.p_created_at,
        role: user.role,
      }
    };
  }
}
