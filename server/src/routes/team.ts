import { Router, Request, Response } from 'express';
import { db } from '../db';
import { teamInvites, profiles, userRoles } from '../db/schema';
import { authenticate, requireRole, generateAccessToken } from '../middleware/auth';
import { eq, and } from 'drizzle-orm';
import crypto from 'crypto';

const router = Router();

// Invite team member
router.post('/invite', authenticate, requireRole(['admin', 'supervisor']), async (req: Request, res: Response) => {
  try {
    const { email, role = 'agent', sectorId } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    if (!['admin', 'supervisor', 'agent'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    // Check if user already exists
    const [existing] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.email, email))
      .limit(1);

    if (existing) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Generate invite token
    const inviteToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    const [invite] = await db.insert(teamInvites).values({
      email,
      role,
      sectorId,
      inviteToken,
      expiresAt,
      invitedBy: req.user!.userId,
      status: 'pending',
    }).returning();

    // In production, send email with invite link
    const inviteLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/accept-invite/${inviteToken}`;

    res.json({
      success: true,
      invite,
      inviteLink,
      message: 'Invite created successfully',
    });
  } catch (error) {
    console.error('Error inviting team member:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get pending invites
router.get('/invites', authenticate, requireRole(['admin', 'supervisor']), async (req: Request, res: Response) => {
  try {
    const invites = await db
      .select()
      .from(teamInvites)
      .where(eq(teamInvites.status, 'pending'));

    res.json({ invites });
  } catch (error) {
    console.error('Error fetching invites:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Accept invite (public endpoint)
router.post('/accept-invite/:token', async (req: Request, res: Response) => {
  try {
    const { token } = req.params as { token: string };
    const { fullName, password } = req.body;

    if (!fullName || !password) {
      return res.status(400).json({ error: 'Full name and password are required' });
    }

    // Find invite
    const [invite] = await db
      .select()
      .from(teamInvites)
      .where(
        and(
          eq(teamInvites.inviteToken, token),
          eq(teamInvites.status, 'pending')
        )
      )
      .limit(1);

    if (!invite) {
      return res.status(404).json({ error: 'Invite not found or already used' });
    }

    // Check expiration
    if (new Date() > new Date(invite.expiresAt)) {
      await db
        .update(teamInvites)
        .set({ status: 'expired' })
        .where(eq(teamInvites.id, invite.id));

      return res.status(400).json({ error: 'Invite has expired' });
    }

    // Create user account (reuse registration logic)
    const bcrypt = require('bcrypt');
    const { v4: uuidv4 } = require('uuid');
    const passwordHash = await bcrypt.hash(password, 10);
    const userId = uuidv4();

    // Create profile
    const [profile] = await db.insert(profiles).values({
      id: userId,
      fullName,
      email: invite.email,
      isApproved: true, // Auto-approve invited users
      isActive: true,
    }).returning();

    // Create password
    await db.insert(require('../db/schema/index').userPasswords).values({
      userId: profile.id,
      passwordHash,
    });

    // Create role
    await db.insert(userRoles).values({
      userId: profile.id,
      role: invite.role as 'admin' | 'supervisor' | 'agent',
    });

    // Mark invite as accepted
    await db
      .update(teamInvites)
      .set({
        status: 'accepted',
        acceptedAt: new Date(),
      })
      .where(eq(teamInvites.id, invite.id));

    // Generate tokens
    const accessToken = generateAccessToken({
      userId: profile.id,
      email: profile.email!,
      role: invite.role as 'admin' | 'supervisor' | 'agent',
    });

    res.json({
      success: true,
      user: {
        id: profile.id,
        email: profile.email,
        fullName: profile.fullName,
        role: invite.role,
      },
      accessToken,
    });
  } catch (error) {
    console.error('Error accepting invite:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Revoke invite
router.delete('/invites/:inviteId', authenticate, requireRole(['admin', 'supervisor']), async (req: Request, res: Response) => {
  try {
    const { inviteId } = req.params;

    await db
      .update(teamInvites)
      .set({ status: 'expired' })
      .where(eq(teamInvites.id, inviteId));

    res.json({ success: true });
  } catch (error) {
    console.error('Error revoking invite:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
