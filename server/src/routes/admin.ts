import { Router, Request, Response } from 'express';
import { db } from '../db';
import { profiles, userRoles, userPasswords } from '../db/schema/index';
import { authenticate, requireRole } from '../middleware/auth';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcrypt';

const router = Router();

// Reset user password (admin only)
router.post('/reset-password/:userId', authenticate, requireRole(['admin']), async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Check if user exists
    const [user] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, 10);

    // Update password
    await db
      .update(userPasswords)
      .set({ passwordHash })
      .where(eq(userPasswords.userId, userId));

    res.json({ 
      success: true, 
      message: 'Password reset successfully',
    });
  } catch (error) {
    console.error('Error resetting password:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Approve user (admin only)
router.post('/approve-user/:userId', authenticate, requireRole(['admin']), async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const [user] = await db
      .update(profiles)
      .set({ 
        isApproved: true,
        updatedAt: new Date(),
      })
      .where(eq(profiles.id, userId))
      .returning();

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ success: true, user });
  } catch (error) {
    console.error('Error approving user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Deactivate user (admin only)
router.post('/deactivate-user/:userId', authenticate, requireRole(['admin']), async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const [user] = await db
      .update(profiles)
      .set({ 
        isActive: false,
        updatedAt: new Date(),
      })
      .where(eq(profiles.id, userId))
      .returning();

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ success: true, user });
  } catch (error) {
    console.error('Error deactivating user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Change user role (admin only)
router.post('/change-role/:userId', authenticate, requireRole(['admin']), async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;

    if (!['admin', 'supervisor', 'agent'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    // Update role
    await db
      .update(userRoles)
      .set({ role })
      .where(eq(userRoles.userId, userId));

    res.json({ success: true, role });
  } catch (error) {
    console.error('Error changing role:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all users (admin/supervisor)
router.get('/users', authenticate, requireRole(['admin', 'supervisor']), async (req: Request, res: Response) => {
  try {
    const users = await db
      .select({
        id: profiles.id,
        fullName: profiles.fullName,
        email: profiles.email,
        avatarUrl: profiles.avatarUrl,
        status: profiles.status,
        isActive: profiles.isActive,
        isApproved: profiles.isApproved,
        createdAt: profiles.createdAt,
        role: userRoles.role,
      })
      .from(profiles)
      .leftJoin(userRoles, eq(profiles.id, userRoles.userId));

    res.json({ users });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
