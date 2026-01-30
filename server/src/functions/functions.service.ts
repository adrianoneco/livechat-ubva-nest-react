import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import * as crypto from 'crypto';
import { Sector, UserSector, SectorInstance, SectorAllowedGroup, WhatsappInstance, WhatsappConversation, Webhook, WebhookLog, ApiToken, ApiUsageLog } from '../entities';

@Injectable()
export class FunctionsService {
  constructor(
    @InjectRepository(Sector)
    private sectorRepository: Repository<Sector>,
    @InjectRepository(UserSector)
    private userSectorRepository: Repository<UserSector>,
    @InjectRepository(SectorInstance)
    private sectorInstanceRepository: Repository<SectorInstance>,
    @InjectRepository(SectorAllowedGroup)
    private sectorAllowedGroupRepository: Repository<SectorAllowedGroup>,
    @InjectRepository(WhatsappInstance)
    private instanceRepository: Repository<WhatsappInstance>,
    @InjectRepository(WhatsappConversation)
    private conversationRepository: Repository<WhatsappConversation>,
    @InjectRepository(Webhook)
    private webhookRepository: Repository<Webhook>,
    @InjectRepository(WebhookLog)
    private webhookLogRepository: Repository<WebhookLog>,
    @InjectRepository(ApiToken)
    private apiTokenRepository: Repository<ApiToken>,
    @InjectRepository(ApiUsageLog)
    private apiUsageLogRepository: Repository<ApiUsageLog>,
    private dataSource: DataSource,
  ) {}

  // Sectors
  async getSectors() {
    return this.sectorRepository.find({ order: { createdAt: 'ASC' } });
  }

  async getSector(sectorId: string) {
    const sector = await this.sectorRepository.findOne({ where: { id: sectorId } });
    if (!sector) throw new NotFoundException('Sector not found');
    return sector;
  }

  async createSector(data: any) {
    const sector = await this.sectorRepository.save(data);
    return { success: true, sector };
  }

  async updateSector(sectorId: string, data: any) {
    await this.sectorRepository.update(sectorId, { ...data, updatedAt: new Date() });
    const sector = await this.sectorRepository.findOne({ where: { id: sectorId } });
    return { success: true, sector };
  }

  async deleteSector(sectorId: string) {
    await this.sectorRepository.delete(sectorId);
    return { success: true };
  }

  async getSectorUsers(sectorId: string) {
    const userSectors = await this.userSectorRepository.find({ where: { sectorId } });
    return { userSectors };
  }

  async assignUserToSector(userId: string, sectorId: string, isPrimary: boolean = false) {
    const existing = await this.userSectorRepository.findOne({ where: { userId, sectorId } });
    if (existing) return { success: true, userSector: existing };
    const userSector = await this.userSectorRepository.save({ userId, sectorId, isPrimary });
    return { success: true, userSector };
  }

  async removeUserFromSector(userId: string, sectorId: string) {
    await this.userSectorRepository.delete({ userId, sectorId });
    return { success: true };
  }

  // Webhooks
  async getWebhooks(userId?: string) {
    const qb = this.webhookRepository.createQueryBuilder('w');
    if (userId) qb.andWhere('w.user_id = :userId', { userId });
    return qb.orderBy('w.created_at', 'DESC').getMany();
  }

  async createWebhook(data: any, userId: string) {
    if (!data.name || !data.url) throw new BadRequestException('Name and URL are required');
    const webhook = await this.webhookRepository.save({ ...data, userId });
    return { success: true, webhook };
  }

  async updateWebhook(webhookId: string, data: any) {
    await this.webhookRepository.update(webhookId, { ...data, updatedAt: new Date() });
    return { success: true };
  }

  async deleteWebhook(webhookId: string) {
    await this.webhookRepository.delete(webhookId);
    return { success: true };
  }

  async testWebhook(webhookId: string) {
    const webhook = await this.webhookRepository.findOne({ where: { id: webhookId } });
    if (!webhook) throw new NotFoundException('Webhook not found');

    const payload = { event: 'test', timestamp: new Date().toISOString(), data: { test: true } };
    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return { success: response.ok, status: response.status };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async getWebhookLogs(webhookId: string) {
    return this.webhookLogRepository.find({
      where: { webhookId },
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  // API Tokens
  async getApiTokens(userId: string) {
    return this.apiTokenRepository.find({ where: { userId, isActive: true }, order: { createdAt: 'DESC' } });
  }

  async createApiToken(data: any, userId: string) {
    const token = crypto.randomBytes(32).toString('hex');
    const prefix = token.substring(0, 8);
    const apiToken = await this.apiTokenRepository.save({
      userId,
      name: data.name || 'API Token',
      token,
      prefix,
      permissions: data.permissions || [],
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
    });
    return { success: true, token: apiToken, rawToken: token };
  }

  async deleteApiToken(tokenId: string) {
    await this.apiTokenRepository.update(tokenId, { isActive: false });
    return { success: true };
  }
}
