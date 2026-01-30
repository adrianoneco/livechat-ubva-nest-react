import { Router, Request, Response } from 'express';
import { db } from '../db';
import { meetings } from '../db/schema';
import { authenticate } from '../middleware/auth';
import { eq, and, gte, lte, sql } from 'drizzle-orm';

const router = Router();

// Create meeting
router.post('/schedule', authenticate, async (req: Request, res: Response) => {
  try {
    const {
      leadId,
      contactId,
      conversationId,
      title,
      description,
      scheduledAt,
      duration = 60,
      location,
      meetingUrl,
      attendees,
    } = req.body;

    if (!title || !scheduledAt) {
      return res.status(400).json({ error: 'Title and scheduledAt are required' });
    }

    const [meeting] = await db.insert(meetings).values({
      leadId,
      contactId,
      conversationId,
      title,
      description,
      scheduledAt: new Date(scheduledAt),
      duration,
      location,
      meetingUrl,
      attendees,
      status: 'scheduled',
      createdBy: req.user!.userId,
    }).returning();

    res.json({ success: true, meeting });
  } catch (error) {
    console.error('Error scheduling meeting:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get meetings
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const { status, from, to } = req.query;

    let query = db.select().from(meetings);

    if (status) {
      query = query.where(eq(meetings.status, status as string)) as any;
    }

    if (from) {
      query = query.where(gte(meetings.scheduledAt, new Date(from as string))) as any;
    }

    if (to) {
      query = query.where(lte(meetings.scheduledAt, new Date(to as string))) as any;
    }

    const allMeetings = await query.orderBy(meetings.scheduledAt);

    res.json({ meetings: allMeetings });
  } catch (error) {
    console.error('Error fetching meetings:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update meeting
router.put('/:meetingId', authenticate, async (req: Request, res: Response) => {
  try {
    const { meetingId } = req.params;
    const updates = req.body;

    if (updates.scheduledAt) {
      updates.scheduledAt = new Date(updates.scheduledAt);
    }

    const [meeting] = await db
      .update(meetings)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(meetings.id, meetingId))
      .returning();

    res.json({ success: true, meeting });
  } catch (error) {
    console.error('Error updating meeting:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Process meeting reminders (called by cron)
router.post('/reminders/process', authenticate, async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const reminderTime = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour ahead

    // Find meetings that need reminders
    const upcomingMeetings = await db
      .select()
      .from(meetings)
      .where(
        and(
          eq(meetings.status, 'scheduled'),
          eq(meetings.reminderSent, false),
          gte(meetings.scheduledAt, now),
          lte(meetings.scheduledAt, reminderTime)
        )
      );

    for (const meeting of upcomingMeetings) {
      // Send reminder (implementation would send via email/WhatsApp)
      console.log(`Sending reminder for meeting: ${meeting.title}`);

      // Mark reminder as sent
      await db
        .update(meetings)
        .set({
          reminderSent: true,
          reminderSentAt: new Date(),
        })
        .where(eq(meetings.id, meeting.id));
    }

    res.json({
      success: true,
      remindersSent: upcomingMeetings.length,
    });
  } catch (error) {
    console.error('Error processing reminders:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Cancel meeting
router.post('/:meetingId/cancel', authenticate, async (req: Request, res: Response) => {
  try {
    const { meetingId } = req.params;

    await db
      .update(meetings)
      .set({
        status: 'cancelled',
        updatedAt: new Date(),
      })
      .where(eq(meetings.id, meetingId));

    res.json({ success: true });
  } catch (error) {
    console.error('Error cancelling meeting:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
