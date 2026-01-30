import { Injectable, BadRequestException, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { Ticket, SlaConfig, SlaViolation } from '../entities';
import { WhatsappService } from '../whatsapp/whatsapp.service';

@Injectable()
export class TicketsService {
  constructor(
    @InjectRepository(Ticket)
    private ticketRepository: Repository<Ticket>,
    @InjectRepository(SlaConfig)
    private slaConfigRepository: Repository<SlaConfig>,
    @InjectRepository(SlaViolation)
    private slaViolationRepository: Repository<SlaViolation>,
    private dataSource: DataSource,
    @Inject(forwardRef(() => WhatsappService))
    private whatsappService: WhatsappService,
  ) {}

  async findAll(filters: { status?: string; sectorId?: string; conversationId?: string }) {
    const qb = this.ticketRepository.createQueryBuilder('t');
    if (filters.status) qb.andWhere('t.status = :status', { status: filters.status });
    if (filters.sectorId) qb.andWhere('t.sector_id = :sectorId', { sectorId: filters.sectorId });
    if (filters.conversationId) qb.andWhere('t.conversation_id = :conversationId', { conversationId: filters.conversationId });
    return qb.orderBy('t.created_at', 'DESC').getMany();
  }

  async findOne(ticketId: string) {
    const ticket = await this.ticketRepository.findOne({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    return ticket;
  }

  async create(conversationId: string, sectorId: string) {
    if (!conversationId || !sectorId) throw new BadRequestException('conversationId and sectorId are required');
    const ticket = await this.ticketRepository.save({ conversationId, sectorId, status: 'aberto' });
    return ticket;
  }

  async update(ticketId: string, updates: any, userId: string) {
    if (!ticketId || ticketId === 'undefined') throw new BadRequestException('Valid ticketId is required');

    if (updates.status === 'finalizado' && !updates.closedAt) {
      updates.closedAt = new Date();
      updates.closedBy = userId;
    }

    const ticket = await this.ticketRepository.save({ id: ticketId, ...updates });
    return ticket;
  }

  async getSlaConfig(sectorId?: string) {
    if (sectorId) {
      const config = await this.slaConfigRepository.findOne({ where: { sectorId } });
      return { config };
    }
    const configs = await this.slaConfigRepository.find();
    return { configs };
  }

  async saveSlaConfig(data: any) {
    const existing = await this.slaConfigRepository.findOne({ where: { sectorId: data.sectorId } });
    if (existing) {
      const config = await this.slaConfigRepository.save({ id: existing.id, ...data, updatedAt: new Date() });
      return { success: true, config };
    }
    const config = await this.slaConfigRepository.save(data);
    return { success: true, config };
  }

  async getSlaViolations(filters: { ticketId?: string; violationType?: string }) {
    const qb = this.slaViolationRepository.createQueryBuilder('v');
    if (filters.ticketId) qb.andWhere('v.ticket_id = :ticketId', { ticketId: filters.ticketId });
    if (filters.violationType) qb.andWhere('v.violation_type = :violationType', { violationType: filters.violationType });
    const violations = await qb.orderBy('v.created_at', 'DESC').getMany();
    return { violations };
  }

  async checkSlaViolations() {
    const slaConfigs = await this.slaConfigRepository.find({ where: { isActive: true } });
    if (slaConfigs.length === 0) return { success: true, message: 'No SLA configs to check' };

    const slaMap = new Map<string, any>();
    for (const config of slaConfigs) {
      if (config.sectorId) slaMap.set(config.sectorId, config);
    }

    const openTickets = await this.ticketRepository.find({
      where: { status: In(['aberto', 'em_atendimento']) },
    });

    const now = new Date();
    const violations: any[] = [];

    for (const ticket of openTickets) {
      const ticketSlaConfig = slaMap.get(ticket.sectorId);
      if (!ticketSlaConfig) continue;

      const ticketCreatedAt = new Date(ticket.createdAt);

      if (ticket.status === 'aberto' && ticketSlaConfig.firstResponseTimeMinutes) {
        const expectedFirstResponseAt = new Date(ticketCreatedAt.getTime() + ticketSlaConfig.firstResponseTimeMinutes * 60 * 1000);
        if (now > expectedFirstResponseAt) {
          const existing = await this.slaViolationRepository.findOne({
            where: { ticketId: ticket.id, violationType: 'first_response' },
          });
          if (!existing) {
            violations.push({ ticketId: ticket.id, violationType: 'first_response', slaConfigId: ticketSlaConfig.id });
          }
        }
      }

      if (ticketSlaConfig.resolutionTimeMinutes) {
        const expectedResolutionAt = new Date(ticketCreatedAt.getTime() + ticketSlaConfig.resolutionTimeMinutes * 60 * 1000);
        if (now > expectedResolutionAt) {
          const existing = await this.slaViolationRepository.findOne({
            where: { ticketId: ticket.id, violationType: 'resolution' },
          });
          if (!existing) {
            violations.push({ ticketId: ticket.id, violationType: 'resolution', slaConfigId: ticketSlaConfig.id });
          }
        }
      }
    }

    for (const v of violations) {
      await this.slaViolationRepository.save(v);
    }

    return { success: true, ticketsChecked: openTickets.length, violationsFound: violations.length };
  }
}
