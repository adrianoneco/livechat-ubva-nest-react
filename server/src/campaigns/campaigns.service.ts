import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
import { Campaign, CampaignMessage, WhatsappContact } from '../entities';

@Injectable()
export class CampaignsService {
  constructor(
    @InjectRepository(Campaign)
    private campaignRepository: Repository<Campaign>,
    @InjectRepository(CampaignMessage)
    private campaignMessageRepository: Repository<CampaignMessage>,
    @InjectRepository(WhatsappContact)
    private contactRepository: Repository<WhatsappContact>,
  ) {}

  async create(data: any, userId: string) {
    if (!data.name || !data.messageTemplate) {
      throw new BadRequestException('Name and messageTemplate are required');
    }

    const campaign = await this.campaignRepository.save({
      ...data,
      status: data.scheduledAt ? 'scheduled' : 'draft',
      createdBy: userId,
    });

    return { success: true, campaign };
  }

  async findAll() {
    return this.campaignRepository.find({ order: { createdAt: 'DESC' } });
  }

  async findOne(id: string) {
    const campaign = await this.campaignRepository.findOne({ where: { id } });
    if (!campaign) throw new NotFoundException('Campaign not found');

    const messages = await this.campaignMessageRepository.find({ where: { campaignId: id } });
    return { campaign, messages };
  }

  async send(campaignId: string) {
    const campaign = await this.campaignRepository.findOne({ where: { id: campaignId } });
    if (!campaign) throw new NotFoundException('Campaign not found');
    if (campaign.status === 'sending' || campaign.status === 'completed') {
      throw new BadRequestException('Campaign already sent or in progress');
    }

    const targetContacts = await this.contactRepository.find({ where: { isActive: true } });

    const messagesToInsert = targetContacts.map(contact => ({
      campaignId,
      contactId: contact.id,
      phoneNumber: contact.phoneNumber,
      status: 'pending' as const,
    }));

    if (messagesToInsert.length > 0) {
      await this.campaignMessageRepository.save(messagesToInsert);
    }

    await this.campaignRepository.update(campaignId, {
      status: 'sending',
      startedAt: new Date(),
      totalRecipients: targetContacts.length,
    });

    // Start background sending (simplified)
    this.sendCampaignMessages(campaignId).catch(console.error);

    return { success: true, message: 'Campaign sending started', totalRecipients: targetContacts.length };
  }

  private async sendCampaignMessages(campaignId: string) {
    const pendingMessages = await this.campaignMessageRepository.find({
      where: { campaignId, status: 'pending' },
      take: 100,
    });

    let sentCount = 0;
    let failedCount = 0;

    for (const message of pendingMessages) {
      try {
        await this.campaignMessageRepository.update(message.id, {
          status: 'sent',
          sentAt: new Date(),
        });
        sentCount++;
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        await this.campaignMessageRepository.update(message.id, {
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        failedCount++;
      }
    }

    const remaining = await this.campaignMessageRepository.count({
      where: { campaignId, status: 'pending' },
    });

    if (remaining === 0) {
      await this.campaignRepository.update(campaignId, {
        status: 'completed',
        completedAt: new Date(),
      });
    }
  }

  async cancel(campaignId: string) {
    await this.campaignRepository.update(campaignId, { status: 'cancelled' });
    return { success: true };
  }
}
