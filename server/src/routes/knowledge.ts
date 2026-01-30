import { Router, Request, Response } from 'express';
import { db } from '../db';
import { knowledgeBase, knowledgeOptimizationLog } from '../db/schema';
import { authenticate, requireRole } from '../middleware/auth';
import { eq, and, sql, or, ilike } from 'drizzle-orm';

const router = Router();

// Get knowledge base entries
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const { sectorId, category, search } = req.query;

    const conditions = [eq(knowledgeBase.isActive, true)];

    if (sectorId) {
      conditions.push(eq(knowledgeBase.sectorId, sectorId as string));
    }

    if (category) {
      conditions.push(eq(knowledgeBase.category, category as string));
    }

    let query = db.select().from(knowledgeBase).where(and(...conditions));

    if (search) {
      const searchTerm = `%${search}%`;
      query = query.where(
        or(
          ilike(knowledgeBase.question, searchTerm),
          ilike(knowledgeBase.answer, searchTerm)
        )
      ) as any;
    }

    const entries = await query.orderBy(sql`${knowledgeBase.priority} DESC, ${knowledgeBase.useCount} DESC`);

    res.json({ entries });
  } catch (error) {
    console.error('Error fetching knowledge base:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create knowledge base entry
router.post('/manage', authenticate, requireRole(['admin', 'supervisor']), async (req: Request, res: Response) => {
  try {
    const {
      sectorId,
      category,
      question,
      answer,
      keywords,
      priority = 0,
    } = req.body;

    if (!category || !question || !answer) {
      return res.status(400).json({ error: 'Category, question, and answer are required' });
    }

    const [entry] = await db.insert(knowledgeBase).values({
      sectorId,
      category,
      question,
      answer,
      keywords,
      priority,
      createdBy: req.user!.userId,
    }).returning();

    res.json({ success: true, entry });
  } catch (error) {
    console.error('Error creating knowledge entry:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update knowledge base entry
router.put('/manage/:entryId', authenticate, requireRole(['admin', 'supervisor']), async (req: Request, res: Response) => {
  try {
    const { entryId } = req.params;
    const updates = req.body;

    const [entry] = await db
      .update(knowledgeBase)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(knowledgeBase.id, entryId))
      .returning();

    res.json({ success: true, entry });
  } catch (error) {
    console.error('Error updating knowledge entry:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete knowledge base entry
router.delete('/manage/:entryId', authenticate, requireRole(['admin', 'supervisor']), async (req: Request, res: Response) => {
  try {
    const { entryId } = req.params;

    await db
      .update(knowledgeBase)
      .set({ isActive: false })
      .where(eq(knowledgeBase.id, entryId));

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting knowledge entry:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Optimize knowledge base (consolidate, update)
router.post('/optimize', authenticate, requireRole(['admin']), async (req: Request, res: Response) => {
  try {
    // Find duplicate or similar entries
    const entries = await db
      .select()
      .from(knowledgeBase)
      .where(eq(knowledgeBase.isActive, true));

    const optimizations = [];

    // Group by category
    const categories = new Map();
    for (const entry of entries) {
      if (!categories.has(entry.category)) {
        categories.set(entry.category, []);
      }
      categories.get(entry.category).push(entry);
    }

    // Find entries with low usage
    const lowUsageEntries = entries.filter(e => 
      e.useCount === 0 && 
      new Date().getTime() - new Date(e.createdAt).getTime() > 30 * 24 * 60 * 60 * 1000
    );

    if (lowUsageEntries.length > 0) {
      optimizations.push({
        type: 'low_usage',
        count: lowUsageEntries.length,
        suggestion: 'Consider reviewing or removing entries with no usage in 30+ days',
      });
    }

    // Log optimization
    await db.insert(knowledgeOptimizationLog).values({
      optimizationType: 'analysis',
      itemsAffected: optimizations.length,
      changes: { optimizations },
      performedBy: 'system',
    });

    res.json({
      success: true,
      totalEntries: entries.length,
      categories: categories.size,
      optimizations,
    });
  } catch (error) {
    console.error('Error optimizing knowledge:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Track usage
router.post('/:entryId/use', authenticate, async (req: Request, res: Response) => {
  try {
    const { entryId } = req.params;

    await db
      .update(knowledgeBase)
      .set({
        useCount: sql`${knowledgeBase.useCount} + 1`,
        lastUsedAt: new Date(),
      })
      .where(eq(knowledgeBase.id, entryId));

    res.json({ success: true });
  } catch (error) {
    console.error('Error tracking usage:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
