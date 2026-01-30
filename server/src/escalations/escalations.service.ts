import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Escalation } from '../entities';

@Injectable()
export class EscalationsService {
  constructor(
    @InjectRepository(Escalation)
    private escalationRepository: Repository<Escalation>,
  ) {}

  async create(data: any) {
    if (!data.conversationId || !data.reason) {
      throw new BadRequestException('conversationId and reason are required');
    }

    const escalation = await this.escalationRepository.save({
      conversationId: data.conversationId,
      reason: data.reason,
      escalationKeyword: data.escalationKeyword,
      originalAgentId: data.originalAgentId,
      escalatedTo: data.escalatedTo,
      escalationType: data.escalationType || 'user',
      priority: data.priority || 'medium',
      notes: data.notes,
      status: 'pending',
    });

    return { success: true, escalation };
  }

  async findAll(filters: { status?: string; priority?: string }) {
    const qb = this.escalationRepository.createQueryBuilder('e');
    if (filters.status) qb.andWhere('e.status = :status', { status: filters.status });
    if (filters.priority) qb.andWhere('e.priority = :priority', { priority: filters.priority });
    const escalations = await qb.orderBy('e.created_at', 'DESC').getMany();
    return { escalations };
  }

  async distribute(escalationId: string, assignTo: string) {
    const escalation = await this.escalationRepository.save({
      id: escalationId,
      escalatedTo: assignTo,
      status: 'assigned',
      updatedAt: new Date(),
    });
    return { success: true, escalation };
  }

  async resolve(escalationId: string, notes: string, userId: string) {
    const escalation = await this.escalationRepository.save({
      id: escalationId,
      status: 'resolved',
      resolvedAt: new Date(),
      resolvedBy: userId,
      notes: notes,
      updatedAt: new Date(),
    });
    return { success: true, escalation };
  }
}
