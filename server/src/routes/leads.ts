import { Router, Request, Response } from 'express';
import { db } from '../db';
import { leads, leadActivities, leadStatusHistory } from '../db/schema/index';
import { authenticate } from '../middleware/auth';
import { eq, desc, sql } from 'drizzle-orm';

const router = Router();

// Create lead
router.post('/', authenticate, async (req: Request, res: Response) => {
  try {
    const {
      contact_id,
      contactId,
      conversation_id,
      conversationId,
      name,
      email,
      phone,
      company,
      source,
      notes,
      value,
      estimated_value,
      estimatedValue,
      expected_close_date,
      expectedCloseDate,
      status,
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    // Accept both snake_case and camelCase field names
    const finalContactId = contact_id || contactId;
    const finalConversationId = conversation_id || conversationId;
    const finalValue = value || estimated_value || estimatedValue || '0';
    const finalExpectedCloseDate = expected_close_date || expectedCloseDate;

    const [lead] = await db.insert(leads).values({
      contact_id: finalContactId,
      conversation_id: finalConversationId,
      name,
      email,
      phone,
      company,
      source: source || 'whatsapp',
      status: status || 'new',
      notes,
      value: finalValue,
      expected_close_date: finalExpectedCloseDate ? new Date(finalExpectedCloseDate) : null,
      assigned_to: req.user!.userId,
    }).returning();

    // Record initial status
    await db.insert(leadStatusHistory).values({
      lead_id: lead.id,
      old_status: null,
      new_status: status || 'new',
      changed_by: req.user!.userId,
    });

    res.json(lead);
  } catch (error: any) {
    console.error('Error creating lead:', error);
    res.status(500).json({ error: 'Internal server error', details: error?.message });
  }
});

// Get leads
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const { status, assignedTo, assigned_to } = req.query;

    let query = db.select().from(leads);

    if (status) {
      query = query.where(eq(leads.status, status as string)) as any;
    }

    // Accept both assignedTo and assigned_to
    const finalAssignedTo = assignedTo || assigned_to;
    if (finalAssignedTo) {
      query = query.where(eq(leads.assigned_to, finalAssignedTo as string)) as any;
    }

    const allLeads = await query.orderBy(desc(leads.created_at));
    
    // Return array directly for consistency with Supabase-like API
    res.json(allLeads);
  } catch (error) {
    console.error('Error fetching leads:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get lead by ID
router.get('/:leadId', authenticate, async (req: Request, res: Response) => {
  try {
    const { leadId } = req.params;

    const [lead] = await db
      .select()
      .from(leads)
      .where(eq(leads.id, leadId))
      .limit(1);

    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    // Get activities
    const activities = await db
      .select()
      .from(leadActivities)
      .where(eq(leadActivities.leadId, leadId))
      .orderBy(desc(leadActivities.createdAt));

    // Get status history
    const history = await db
      .select()
      .from(leadStatusHistory)
      .where(eq(leadStatusHistory.lead_id, leadId))
      .orderBy(desc(leadStatusHistory.created_at));

    res.json({ lead, activities, history });
  } catch (error) {
    console.error('Error fetching lead:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update lead
router.put('/:leadId', authenticate, async (req: Request, res: Response) => {
  try {
    const { leadId } = req.params;
    const updates = req.body;

    // Sanitize and coerce incoming fields to match DB columns and types
    const sanitized: any = {};

    // Allowed fields and basic coercions
    if (typeof updates.name === 'string') sanitized.name = updates.name;
    if (typeof updates.phone === 'string') sanitized.phone = updates.phone;
    if (typeof updates.email === 'string') sanitized.email = updates.email;
    if (typeof updates.company === 'string') sanitized.company = updates.company;
    if (typeof updates.status === 'string') sanitized.status = updates.status;
    if (typeof updates.source === 'string') sanitized.source = updates.source;

    if (updates.value !== undefined) {
      // Accept numbers or strings like "1.234,56" or "1234.56"
      let v = updates.value;
      if (typeof v === 'string') {
        v = v.replace(/[^0-9,.-]/g, '').replace(',', '.');
      }
      const nv = Number(v);
      if (!Number.isFinite(nv)) {
        return res.status(400).json({ error: 'Invalid value for lead.value' });
      }
      sanitized.value = nv;
    }

    if (updates.probability !== undefined) {
      const p = Number(updates.probability);
      sanitized.probability = Number.isFinite(p) ? Math.max(0, Math.min(100, Math.round(p))) : 0;
    }

    if (updates.expectedCloseDate) {
      const d = new Date(updates.expectedCloseDate);
      sanitized.expectedCloseDate = isNaN(d.getTime()) ? null : d;
    }

    if (updates.assignedTo) sanitized.assignedTo = updates.assignedTo;
    if (typeof updates.notes === 'string') sanitized.notes = updates.notes;
    if (Array.isArray(updates.tags)) sanitized.tags = updates.tags;
    if (typeof updates.metadata === 'object' || typeof updates.metadata === 'string') {
      try {
        sanitized.metadata = typeof updates.metadata === 'string' ? JSON.parse(updates.metadata) : updates.metadata;
      } catch {
        sanitized.metadata = {};
      }
    }
    if (typeof updates.pipelineInsight === 'object' || typeof updates.pipelineInsight === 'string') {
      try {
        sanitized.pipelineInsight = typeof updates.pipelineInsight === 'string' ? JSON.parse(updates.pipelineInsight) : updates.pipelineInsight;
      } catch {
        sanitized.pipelineInsight = {};
      }
    }

    // If status is changing, record it
    if (sanitized.status) {
      const [currentLead] = await db
        .select()
        .from(leads)
        .where(eq(leads.id, leadId))
        .limit(1);

      if (currentLead && currentLead.status !== sanitized.status) {
        await db.insert(leadStatusHistory).values({
          lead_id: leadId,
          old_status: currentLead.status,
          new_status: sanitized.status,
          changed_by: req.user!.userId,
          reason: updates.statusChangeNotes,
        });
      }
    }

    const [updated] = await db
      .update(leads)
      .set({
        ...sanitized,
        updated_at: new Date(),
      })
      .where(eq(leads.id, leadId))
      .returning();

    res.json(updated);
  } catch (error) {
    console.error('Error updating lead:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add activity to lead
router.post('/:leadId/activities', authenticate, async (req: Request, res: Response) => {
  try {
    const { leadId } = req.params;
    const { type, description, outcome, scheduledFor } = req.body;

    if (!type || !description) {
      return res.status(400).json({ error: 'Type and description are required' });
    }

    const [activity] = await db.insert(leadActivities).values({
      leadId,
      type,
      description,
      outcome,
      performedBy: req.user!.userId,
      scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
    }).returning();

    res.json({ success: true, activity });
  } catch (error) {
    console.error('Error adding activity:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Qualify lead with AI
router.post('/:leadId/qualify', authenticate, async (req: Request, res: Response) => {
  try {
    const { leadId } = req.params;

    const [lead] = await db
      .select()
      .from(leads)
      .where(eq(leads.id, leadId))
      .limit(1);

    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    if (!GROQ_API_KEY) {
      return res.status(500).json({ error: 'AI service not configured' });
    }

    // Get lead activities for context
    const activities = await db
      .select()
      .from(leadActivities)
      .where(eq(leadActivities.leadId, leadId))
      .orderBy(desc(leadActivities.createdAt))
      .limit(10);

    const prompt = `Analise este lead e forneça uma qualificação BANT (Budget, Authority, Need, Timeline).
Retorne um JSON com:
- budget_score: 0-10
- authority_score: 0-10
- need_score: 0-10
- timeline_score: 0-10
- overall_score: 0-10
- recommendation: "qualified", "nurture", ou "disqualify"
- reasoning: explicação breve

Lead:
- Nome: ${lead.name}
- Empresa: ${lead.company || 'N/A'}
- Valor estimado: ${lead.estimatedValue || 'N/A'}
- Fonte: ${lead.source || 'N/A'}
- Notas: ${lead.notes || 'Nenhuma'}

Atividades recentes:
${activities.map(a => `- ${a.type}: ${a.description}`).join('\n')}`;

    const aiResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
      }),
    });

    if (!aiResponse.ok) {
      return res.status(500).json({ error: 'AI service error' });
    }

    const aiData = await aiResponse.json();
    const qualificationText = aiData.choices[0]?.message?.content || '{}';
    const qualification = JSON.parse(qualificationText.replace(/```json\n?|\n?```/g, ''));

    // Update lead with qualification score
    await db
      .update(leads)
      .set({
        qualificationScore: qualification.overall_score,
        updatedAt: new Date(),
      })
      .where(eq(leads.id, leadId));

    // Add activity
    await db.insert(leadActivities).values({
      leadId,
      type: 'qualification',
      description: `Qualificação AI: ${qualification.recommendation}`,
      outcome: qualification.reasoning,
      performedBy: req.user!.userId,
    });

    res.json({ success: true, qualification });
  } catch (error) {
    console.error('Error qualifying lead:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete lead
router.delete('/:leadId', authenticate, async (req: Request, res: Response) => {
  try {
    const { leadId } = req.params;

    await db
      .delete(leads)
      .where(eq(leads.id, leadId));

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting lead:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
