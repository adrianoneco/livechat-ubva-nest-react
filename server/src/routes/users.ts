import { Router, Request, Response } from 'express';
import { db } from '../db';
import { profiles, userRoles } from '../db/schema';
import { authenticate, AuthRequest } from '../middleware/auth';
import { eq } from 'drizzle-orm';

const router = Router();

// Get current user profile
router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const [profile] = await db
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
      .leftJoin(userRoles, eq(profiles.id, userRoles.userId))
      .where(eq(profiles.id, req.user!.userId))
      .limit(1);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    res.json({ profile });
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update user profile
router.put('/me', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { fullName, avatarUrl, status } = req.body;

    const [updated] = await db
      .update(profiles)
      .set({
        fullName,
        avatarUrl,
        status,
        updatedAt: new Date(),
      })
      .where(eq(profiles.id, req.user!.userId))
      .returning();

    res.json({ success: true, profile: updated });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all users (requires authentication)
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const users = await db
      .select({
        id: profiles.id,
        fullName: profiles.fullName,
        email: profiles.email,
        avatarUrl: profiles.avatarUrl,
        status: profiles.status,
        isActive: profiles.isActive,
        role: userRoles.role,
      })
      .from(profiles)
      .leftJoin(userRoles, eq(profiles.id, userRoles.userId))
      .where(eq(profiles.isActive, true));

    res.json({ users });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user by ID
router.get('/:userId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;

    const [user] = await db
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
      .leftJoin(userRoles, eq(profiles.id, userRoles.userId))
      .where(eq(profiles.id, userId))
      .limit(1);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
