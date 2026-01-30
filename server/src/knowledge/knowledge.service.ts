import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike, And } from 'typeorm';
import { KnowledgeBase, KnowledgeOptimizationLog } from '../entities';

@Injectable()
export class KnowledgeService {
  constructor(
    @InjectRepository(KnowledgeBase)
    private knowledgeRepository: Repository<KnowledgeBase>,
    @InjectRepository(KnowledgeOptimizationLog)
    private logRepository: Repository<KnowledgeOptimizationLog>,
  ) {}

  async findAll(filters: { sectorId?: string; category?: string; search?: string }) {
    const qb = this.knowledgeRepository.createQueryBuilder('k').where('k.is_active = true');
    if (filters.sectorId) qb.andWhere('k.sector_id = :sectorId', { sectorId: filters.sectorId });
    if (filters.category) qb.andWhere('k.category = :category', { category: filters.category });
    if (filters.search) qb.andWhere('(k.question ILIKE :search OR k.answer ILIKE :search)', { search: `%${filters.search}%` });
    const entries = await qb.orderBy('k.priority', 'DESC').addOrderBy('k.use_count', 'DESC').getMany();
    return { entries };
  }

  async create(data: any, userId: string) {
    if (!data.category || !data.question || !data.answer) {
      throw new BadRequestException('Category, question, and answer are required');
    }

    const entry = await this.knowledgeRepository.save({
      ...data,
      createdBy: userId,
    });

    return { success: true, entry };
  }

  async update(entryId: string, data: any) {
    const entry = await this.knowledgeRepository.save({ id: entryId, ...data, updatedAt: new Date() });
    return { success: true, entry };
  }

  async delete(entryId: string) {
    await this.knowledgeRepository.update(entryId, { isActive: false });
    return { success: true };
  }

  async trackUsage(entryId: string) {
    await this.knowledgeRepository.increment({ id: entryId }, 'useCount', 1);
    await this.knowledgeRepository.update(entryId, { lastUsedAt: new Date() });
    return { success: true };
  }
}
