import { Router, Request, Response } from 'express';
import { db } from '../db';
import { campaigns, campaignMessages, whatsappContacts } from '../db/schema/index';
import { authenticate, requireRole } from '../middleware/auth';
import { eq, and, inArray, sql } from 'drizzle-orm';

const router = Router();

// Create campaign
router.post('/', authenticate, requireRole(['admin', 'supervisor']), async (req: Request, res: Response) => {
  try {
    const {
      name,
      description,
      messageTemplate,
      mediaUrl,
      mediaType,
      targetAudience,
      scheduledAt,
      instanceId,
    } = req.body;

    if (!name || !messageTemplate) {
      return res.status(400).json({ error: 'Name and messageTemplate are required' });
    }

    const [campaign] = await db.insert(campaigns).values({
      name,
      description,
      messageTemplate,
      mediaUrl,
      mediaType,
      targetAudience,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      status: scheduledAt ? 'scheduled' : 'draft',
      instanceId,
      createdBy: req.user!.userId,
    }).returning();

    res.json({ success: true, campaign });
  } catch (error) {
    console.error('Error creating campaign:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get campaigns
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const allCampaigns = await db
      .select()
      .from(campaigns)
      .orderBy(sql`${campaigns.createdAt} DESC`);

    // Return array directly to match client expectations
    res.json(allCampaigns);
  } catch (error) {
    console.error('Error fetching campaigns:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get campaign by ID
router.get('/:campaignId', authenticate, async (req: Request, res: Response) => {
  try {
    const campaignId = req.params.campaignId as string;

    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    // Get campaign messages
    const messages = await db
      .select()
      .from(campaignMessages)
      .where(eq(campaignMessages.campaignId, campaignId));

    res.json({ campaign, messages });
  } catch (error) {
    console.error('Error fetching campaign:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Send campaign messages
router.post('/:campaignId/send', authenticate, requireRole(['admin', 'supervisor']), async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params as { campaignId: string };

    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    if (campaign.status === 'sending' || campaign.status === 'completed') {
      return res.status(400).json({ error: 'Campaign already sent or in progress' });
    }

    // Get target contacts
    let targetContacts = [];
    if (campaign.targetAudience) {
      // Apply filters from targetAudience
      // For now, get all active contacts
      targetContacts = await db
        .select()
        .from(whatsappContacts)
        .where(eq(whatsappContacts.isActive, true));
    } else {
      targetContacts = await db
        .select()
        .from(whatsappContacts)
        .where(eq(whatsappContacts.isActive, true));
    }

    // Create campaign messages
    const messagesToInsert = targetContacts.map(contact => ({
      campaignId,
      contactId: contact.id,
      phoneNumber: contact.phoneNumber,
      status: 'pending' as const,
    }));

    if (messagesToInsert.length > 0) {
      await db.insert(campaignMessages).values(messagesToInsert);
    }

    // Update campaign status
    await db
      .update(campaigns)
      .set({
        status: 'sending',
        startedAt: new Date(),
        totalRecipients: targetContacts.length,
        updatedAt: new Date(),
      })
      .where(eq(campaigns.id, campaignId));

    // Start sending process (in background)
    // This would typically be handled by a queue/worker
    sendCampaignMessages(campaignId).catch(err => 
      console.error('Error in background campaign send:', err)
    );

    res.json({ 
      success: true, 
      message: 'Campaign sending started',
      totalRecipients: targetContacts.length,
    });
  } catch (error) {
    console.error('Error sending campaign:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Process scheduled campaigns (called by cron/scheduler)
router.post('/process-scheduled', authenticate, async (req: Request, res: Response) => {
  try {
    // Find scheduled campaigns that should be sent now
    const now = new Date();
    const scheduledCampaigns = await db
      .select()
      .from(campaigns)
      .where(
        and(
          eq(campaigns.status, 'scheduled'),
          sql`${campaigns.scheduledAt} <= ${now}`
        )
      );

    for (const campaign of scheduledCampaigns) {
      // Trigger sending for each campaign
      try {
        // Get target contacts
        const targetContacts = await db
          .select()
          .from(whatsappContacts)
          .where(eq(whatsappContacts.isActive, true));

        const messagesToInsert = targetContacts.map(contact => ({
          campaignId: campaign.id,
          contactId: contact.id,
          phoneNumber: contact.phoneNumber,
          status: 'pending' as const,
        }));

        if (messagesToInsert.length > 0) {
          await db.insert(campaignMessages).values(messagesToInsert);
        }

        await db
          .update(campaigns)
          .set({
            status: 'sending',
            startedAt: new Date(),
            totalRecipients: targetContacts.length,
            updatedAt: new Date(),
          })
          .where(eq(campaigns.id, campaign.id));

        sendCampaignMessages(campaign.id).catch(err => 
          console.error('Error sending campaign:', err)
        );
      } catch (error) {
        console.error(`Error processing campaign ${campaign.id}:`, error);
      }
    }

    res.json({ 
      success: true, 
      processed: scheduledCampaigns.length,
    });
  } catch (error) {
    console.error('Error processing scheduled campaigns:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Cancel campaign
router.post('/:campaignId/cancel', authenticate, requireRole(['admin', 'supervisor']), async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;

    await db
      .update(campaigns)
      .set({
        status: 'cancelled',
        updatedAt: new Date(),
      })
      .where(eq(campaigns.id, campaignId));

    res.json({ success: true });
  } catch (error) {
    console.error('Error cancelling campaign:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper function to send campaign messages
async function sendCampaignMessages(campaignId: string) {
  try {
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);

    if (!campaign) return;

    // Get pending messages
    const pendingMessages = await db
      .select()
      .from(campaignMessages)
      .where(
        and(
          eq(campaignMessages.campaignId, campaignId),
          eq(campaignMessages.status, 'pending')
        )
      )
      .limit(100); // Process in batches

    let sentCount = 0;
    let failedCount = 0;

    for (const message of pendingMessages) {
      try {
        // Here you would actually send via Evolution API
        // For now, just mark as sent
        await db
          .update(campaignMessages)
          .set({
            status: 'sent',
            sentAt: new Date(),
          })
          .where(eq(campaignMessages.id, message.id));

        sentCount++;

        // Rate limiting: wait 1 second between messages
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`Error sending to ${message.phoneNumber}:`, error);
        await db
          .update(campaignMessages)
          .set({
            status: 'failed',
            error: error instanceof Error ? error.message : 'Unknown error',
          })
          .where(eq(campaignMessages.id, message.id));
        failedCount++;
      }
    }

    // Update campaign stats
    await db
      .update(campaigns)
      .set({
        sentCount: sql`${campaigns.sentCount} + ${sentCount}`,
        failedCount: sql`${campaigns.failedCount} + ${failedCount}`,
        updatedAt: new Date(),
      })
      .where(eq(campaigns.id, campaignId));

    // Check if all messages sent
    const remaining = await db
      .select()
      .from(campaignMessages)
      .where(
        and(
          eq(campaignMessages.campaignId, campaignId),
          eq(campaignMessages.status, 'pending')
        )
      );

    if (remaining.length === 0) {
      await db
        .update(campaigns)
        .set({
          status: 'completed',
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(campaigns.id, campaignId));
    }
  } catch (error) {
    console.error('Error in sendCampaignMessages:', error);
  }
}

export default router;
