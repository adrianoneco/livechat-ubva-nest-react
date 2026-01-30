import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual, LessThanOrEqual, And } from 'typeorm';
import { Meeting } from '../entities';

@Injectable()
export class MeetingsService {
  constructor(
    @InjectRepository(Meeting)
    private meetingRepository: Repository<Meeting>,
  ) {}

  async schedule(data: any, userId: string) {
    if (!data.title || !data.scheduledAt) {
      throw new BadRequestException('Title and scheduledAt are required');
    }

    const meeting = await this.meetingRepository.save({
      ...data,
      scheduledAt: new Date(data.scheduledAt),
      status: 'scheduled',
      createdBy: userId,
    });

    return { success: true, meeting };
  }

  async findAll(filters: { status?: string; from?: string; to?: string }) {
    const qb = this.meetingRepository.createQueryBuilder('m');
    if (filters.status) qb.andWhere('m.status = :status', { status: filters.status });
    if (filters.from) qb.andWhere('m.scheduled_at >= :from', { from: new Date(filters.from) });
    if (filters.to) qb.andWhere('m.scheduled_at <= :to', { to: new Date(filters.to) });
    const meetings = await qb.orderBy('m.scheduled_at', 'ASC').getMany();
    return { meetings };
  }

  async update(meetingId: string, data: any) {
    if (data.scheduledAt) data.scheduledAt = new Date(data.scheduledAt);
    const meeting = await this.meetingRepository.save({ id: meetingId, ...data, updatedAt: new Date() });
    return { success: true, meeting };
  }

  async cancel(meetingId: string) {
    await this.meetingRepository.update(meetingId, { status: 'cancelled', updatedAt: new Date() });
    return { success: true };
  }
}
