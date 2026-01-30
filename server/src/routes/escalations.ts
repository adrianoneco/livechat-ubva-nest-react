import { Router, Request, Response } from 'express';
import { db } from '../db';
import { escalations, whatsappConversationNotes } from '../db/schema/index';
import { authenticate, requireRole } from '../middleware/auth';
import { eq, and, or, sql } from 'drizzle-orm';

const router = Router();

// Create escalation
router.post('/', authenticate, async (req: Request, res: Response) => {
  try {
    const {
      conversationId,
      reason,
      escalationKeyword,
      escalatedTo,
      escalationType = 'user',
      priority = 'medium',
      notes,
    } = req.body;

    if (!conversationId || !reason) {
      return res.status(400).json({ error: 'conversationId and reason are required' });
    }

    // Get current agent from conversation
    const [conversation] = await db
      .select()
      .from(whatsappConversationNotes)
      .where(eq(whatsappConversationNotes.id, conversationId))
      .limit(1);

    const [escalation] = await db.insert(escalations).values({
      conversationId,
      reason,
      escalationKeyword,
      originalAgentId: (conversation as any)?.assignedTo || null,
      escalatedTo,
      escalationType,
      priority,
      notes,
      status: 'pending',
    }).returning();

    res.json({ success: true, escalation });
  } catch (error) {
    console.error('Error creating escalation:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get escalations
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const { status, priority } = req.query;

    let query = db.select().from(escalations);

    if (status) {
      query = query.where(eq(escalations.status, status as string)) as any;
    }

    if (priority) {
      query = query.where(eq(escalations.priority, priority as string)) as any;
    }

    const allEscalations = await query.orderBy(sql`${escalations.createdAt} DESC`);

    res.json({ escalations: allEscalations });
  } catch (error) {
    console.error('Error fetching escalations:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Prepare escalation (analyze before escalating)
router.post('/prepare', authenticate, async (req: Request, res: Response) => {
  try {
    const { conversationId } = req.body;

    if (!conversationId) {
      return res.status(400).json({ error: 'conversationId is required' });
    }

    // Check if conversation needs escalation based on various factors
    const [conversation] = await db
      .select()
      .from(whatsappConversationNotes)
      .where(eq(whatsappConversationNotes.id, conversationId))
      .limit(1);

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Determine escalation reasons
    const reasons = [];
    
    // Check sentiment
    if ((conversation as any).currentSentiment === 'negative') {
      reasons.push('negative_sentiment');
    }

    // Check response time (placeholder logic)
    const now = new Date();
    const lastMessageTime = new Date((conversation as any).lastMessageAt);
    const minutesSinceLastMessage = (now.getTime() - lastMessageTime.getTime()) / 60000;
    
    if (minutesSinceLastMessage > 30) {
      reasons.push('delayed_response');
    }

    const shouldEscalate = reasons.length > 0;

    res.json({
      success: true,
      shouldEscalate,
      reasons,
      conversation: {
        id: conversation.id,
        sentiment: (conversation as any).currentSentiment,
        minutesSinceLastMessage: Math.floor(minutesSinceLastMessage),
      },
    });
  } catch (error) {
    console.error('Error preparing escalation:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Distribute escalation (assign to available agent)
router.post('/distribute', authenticate, requireRole(['admin', 'supervisor']), async (req: Request, res: Response) => {
  try {
    const { escalationId, assignTo } = req.body;

    if (!escalationId) {
      return res.status(400).json({ error: 'escalationId is required' });
    }

    const [escalation] = await db
      .update(escalations)
      .set({
        escalatedTo: assignTo,
        status: 'assigned',
        updatedAt: new Date(),
      })
      .where(eq(escalations.id, escalationId))
      .returning();

    // Update conversation assignment
    if (escalation.conversationId) {
      await db
        .update(whatsappConversationNotes)
        .set({
          assignedTo: assignTo,
          updatedAt: new Date(),
        } as any)
        .where(eq(whatsappConversationNotes.id, escalation.conversationId));
    }

    res.json({ success: true, escalation });
  } catch (error) {
    console.error('Error distributing escalation:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Resolve escalation
router.post('/:escalationId/resolve', authenticate, async (req: Request, res: Response) => {
  try {
    const { escalationId } = req.params;
    const { notes } = req.body;

    const id = Array.isArray(escalationId) ? escalationId[0] : escalationId;
    if (!id) {
      return res.status(400).json({ error: 'escalationId is required' });
    }

    const updateData: any = {
      status: 'resolved',
      resolvedAt: new Date(),
      resolvedBy: req.user!.userId,
      updatedAt: new Date(),
    };
    if (notes) updateData.notes = notes;

    const [escalation] = await db
      .update(escalations)
      .set(updateData)
      .where(eq(escalations.id, id))
      .returning();

    res.json({ success: true, escalation });
  } catch (error) {
    console.error('Error resolving escalation:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
