import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Lead, LeadActivity, LeadStatusHistory } from '../entities';

@Injectable()
export class LeadsService {
  constructor(
    @InjectRepository(Lead)
    private leadRepository: Repository<Lead>,
    @InjectRepository(LeadActivity)
    private activityRepository: Repository<LeadActivity>,
    @InjectRepository(LeadStatusHistory)
    private historyRepository: Repository<LeadStatusHistory>,
  ) {}

  async create(data: any, userId: string) {
    if (!data.name) throw new BadRequestException('Name is required');

    const finalContactId = data.contact_id || data.contactId;
    const finalConversationId = data.conversation_id || data.conversationId;
    const finalValue = data.value || data.estimated_value || data.estimatedValue || '0';
    const finalExpectedCloseDate = data.expected_close_date || data.expectedCloseDate;

    const lead = await this.leadRepository.save({
      contactId: finalContactId,
      conversationId: finalConversationId,
      name: data.name,
      email: data.email,
      phone: data.phone,
      company: data.company,
      source: data.source || 'whatsapp',
      status: data.status || 'new',
      notes: data.notes,
      value: finalValue,
      expectedCloseDate: finalExpectedCloseDate ? new Date(finalExpectedCloseDate) : null,
      assignedTo: userId,
    });

    await this.historyRepository.save({
      leadId: lead.id,
      oldStatus: null,
      newStatus: data.status || 'new',
      changedBy: userId,
    });

    return lead;
  }

  async findAll(filters: { status?: string; assignedTo?: string }) {
    const qb = this.leadRepository.createQueryBuilder('l');
    if (filters.status) qb.andWhere('l.status = :status', { status: filters.status });
    if (filters.assignedTo) qb.andWhere('l.assigned_to = :assignedTo', { assignedTo: filters.assignedTo });
    return qb.orderBy('l.created_at', 'DESC').getMany();
  }

  async findOne(leadId: string) {
    const lead = await this.leadRepository.findOne({ where: { id: leadId } });
    if (!lead) throw new NotFoundException('Lead not found');
    const activities = await this.activityRepository.find({ where: { leadId }, order: { createdAt: 'DESC' } });
    const history = await this.historyRepository.find({ where: { leadId }, order: { createdAt: 'DESC' } });
    return { lead, activities, history };
  }

  async update(leadId: string, data: any, userId: string) {
    const currentLead = await this.leadRepository.findOne({ where: { id: leadId } });
    if (!currentLead) throw new NotFoundException('Lead not found');

    if (data.status && currentLead.status !== data.status) {
      await this.historyRepository.save({
        leadId,
        oldStatus: currentLead.status,
        newStatus: data.status,
        changedBy: userId,
        reason: data.statusChangeNotes,
      });
    }

    const updated = await this.leadRepository.save({
      id: leadId,
      ...data,
      updatedAt: new Date(),
    });

    return updated;
  }

  async addActivity(leadId: string, data: any, userId: string) {
    if (!data.type || !data.description) throw new BadRequestException('Type and description are required');

    const activity = await this.activityRepository.save({
      leadId,
      type: data.type,
      description: data.description,
      outcome: data.outcome,
      performedBy: userId,
      scheduledFor: data.scheduledFor ? new Date(data.scheduledFor) : null,
    });

    return { success: true, activity };
  }

  async delete(leadId: string) {
    await this.leadRepository.delete(leadId);
    return { success: true };
  }
}
