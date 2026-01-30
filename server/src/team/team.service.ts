import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { TeamInvite, Profile, UserRole, UserPassword } from '../entities';

@Injectable()
export class TeamService {
  constructor(
    @InjectRepository(TeamInvite)
    private inviteRepository: Repository<TeamInvite>,
    @InjectRepository(Profile)
    private profileRepository: Repository<Profile>,
    @InjectRepository(UserRole)
    private roleRepository: Repository<UserRole>,
    @InjectRepository(UserPassword)
    private passwordRepository: Repository<UserPassword>,
    private jwtService: JwtService,
  ) {}

  async invite(email: string, role: string, sectorId: string, invitedBy: string) {
    if (!email) throw new BadRequestException('Email is required');
    if (!['admin', 'supervisor', 'agent'].includes(role)) throw new BadRequestException('Invalid role');

    const existing = await this.profileRepository.findOne({ where: { email } });
    if (existing) throw new BadRequestException('User already exists');

    const inviteToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const invite = await this.inviteRepository.save({
      email,
      role,
      sectorId,
      inviteToken,
      expiresAt,
      invitedBy,
      status: 'pending',
    });

    const inviteLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/accept-invite/${inviteToken}`;
    return { success: true, invite, inviteLink, message: 'Invite created successfully' };
  }

  async getInvites() {
    const invites = await this.inviteRepository.find({ where: { status: 'pending' } });
    return { invites };
  }

  async acceptInvite(token: string, fullName: string, password: string) {
    if (!fullName || !password) throw new BadRequestException('Full name and password are required');

    const invite = await this.inviteRepository.findOne({ where: { inviteToken: token, status: 'pending' } });
    if (!invite) throw new NotFoundException('Invite not found or already used');

    if (new Date() > new Date(invite.expiresAt)) {
      await this.inviteRepository.update(invite.id, { status: 'expired' });
      throw new BadRequestException('Invite has expired');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const userId = uuidv4();

    const profile = await this.profileRepository.save({
      id: userId,
      fullName,
      email: invite.email,
      isApproved: true,
      isActive: true,
    });

    await this.passwordRepository.save({ userId: profile.id, passwordHash });
    await this.roleRepository.save({ userId: profile.id, role: invite.role as any });
    await this.inviteRepository.update(invite.id, { status: 'accepted', acceptedAt: new Date() });

    const accessToken = this.jwtService.sign({
      userId: profile.id,
      email: profile.email,
      role: invite.role,
    });

    return {
      success: true,
      user: { id: profile.id, email: profile.email, fullName: profile.fullName, role: invite.role },
      accessToken,
    };
  }

  async revokeInvite(inviteId: string) {
    await this.inviteRepository.update(inviteId, { status: 'expired' });
    return { success: true };
  }
}
