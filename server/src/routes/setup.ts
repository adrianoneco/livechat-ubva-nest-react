import { Router, Request, Response } from 'express';
import { db } from '../db';
import { projectConfig } from '../db/schema';
import { authenticate, requireRole } from '../middleware/auth';
import { eq } from 'drizzle-orm';

const router = Router();

// Setup project config
router.post('/config', authenticate, requireRole(['admin']), async (req: Request, res: Response) => {
  try {
    const { config } = req.body;

    if (!config || typeof config !== 'object') {
      return res.status(400).json({ error: 'Config object is required' });
    }

    const configEntries = Object.entries(config);
    const results = [];

    for (const [key, value] of configEntries) {
      // Check if config exists
      const [existing] = await db
        .select()
        .from(projectConfig)
        .where(eq(projectConfig.key, key))
        .limit(1);

      if (existing) {
        // Update
        const [updated] = await db
          .update(projectConfig)
          .set({ 
            value: JSON.stringify(value),
            updatedAt: new Date(),
          })
          .where(eq(projectConfig.key, key))
          .returning();
        results.push(updated);
      } else {
        // Insert
        const [inserted] = await db
          .insert(projectConfig)
          .values({
            key,
            value: JSON.stringify(value),
          })
          .returning();
        results.push(inserted);
      }
    }

    res.json({ 
      success: true, 
      config: results,
      message: 'Configuration saved successfully',
    });
  } catch (error) {
    console.error('Error setting up config:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get project config
router.get('/config', authenticate, async (req: Request, res: Response) => {
  try {
    const configs = await db
      .select()
      .from(projectConfig);

    const configObject: Record<string, any> = {};
    for (const config of configs) {
      try {
        configObject[config.key] = JSON.parse(config.value);
      } catch (e) {
        configObject[config.key] = config.value;
      }
    }

    res.json({ config: configObject });
  } catch (error) {
    console.error('Error fetching config:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Setup infrastructure (initial setup wizard)
router.post('/infrastructure', authenticate, requireRole(['admin']), async (req: Request, res: Response) => {
  try {
    const {
      companyName,
      supportEmail,
      defaultTimezone = 'America/Sao_Paulo',
      workingHoursStart = '09:00',
      workingHoursEnd = '18:00',
      workingDays = [1, 2, 3, 4, 5], // Monday to Friday
    } = req.body;

    // Save initial configuration
    const configs = {
      company_name: companyName,
      support_email: supportEmail,
      default_timezone: defaultTimezone,
      working_hours_start: workingHoursStart,
      working_hours_end: workingHoursEnd,
      working_days: workingDays,
      setup_completed: true,
      setup_completed_at: new Date().toISOString(),
    };

    for (const [key, value] of Object.entries(configs)) {
      await db.insert(projectConfig).values({
        key,
        value: JSON.stringify(value),
      }).onConflictDoUpdate({
        target: projectConfig.key,
        set: { 
          value: JSON.stringify(value),
          updatedAt: new Date(),
        },
      });
    }

    res.json({ 
      success: true, 
      message: 'Infrastructure setup completed',
      config: configs,
    });
  } catch (error) {
    console.error('Error setting up infrastructure:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Check setup status
router.get('/status', authenticate, async (req: Request, res: Response) => {
  try {
    const [setupCompleted] = await db
      .select()
      .from(projectConfig)
      .where(eq(projectConfig.key, 'setup_completed'))
      .limit(1);

    const isSetupCompleted = setupCompleted?.value === 'true';

    res.json({
      setupCompleted: isSetupCompleted,
      setupCompletedAt: setupCompleted?.updatedAt || null,
    });
  } catch (error) {
    console.error('Error checking setup status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
