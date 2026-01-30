import { Router } from 'express';
import bcrypt from 'bcrypt';
import { db } from '../db';
import { profiles, userRoles, userPasswords } from '../db/schema/index';
import { generateAccessToken, generateRefreshToken, verifyToken } from '../middleware/auth';
import { eq } from 'drizzle-orm';

const router = Router();

// Register
router.post('/register', async (req, res) => {
  try {
    const { email, password, fullName } = req.body;

    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Check if user exists
    const existingUser = await db.query.profiles.findFirst({
      where: eq(profiles.email, email),
    });

    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    const userId = crypto.randomUUID();

    // Check if it's the first user (should be admin)
    const userCount = await db.select().from(profiles);
    const isFirstUser = userCount.length === 0;

    // Create user - automatically approved
    const [user] = await db.insert(profiles).values({
      id: userId,
      email,
      fullName: fullName || email.split('@')[0],
      isActive: true,
      isApproved: true, // ALWAYS APPROVED AUTOMATICALLY
    }).returning();

    // Store password
    await db.insert(userPasswords).values({
      userId: user.id,
      passwordHash: hashedPassword,
    });

    // Assign role: first user is admin, others are agents
    await db.insert(userRoles).values({
      userId: user.id,
      role: isFirstUser ? 'admin' : 'agent',
    });

    const role = isFirstUser ? 'admin' : 'agent';

    res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        isApproved: user.isApproved,
        role,
      },
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const user: any = await db.query.profiles.findFirst({
      where: eq(profiles.email, email),
      with: {
        roles: true,
        password: true,
      },
    });

    if (!user || !user.password) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password.passwordHash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const role = user.roles?.[0]?.role || 'agent';

    const accessToken = generateAccessToken({
      userId: user.id,
      email: user.email!,
      role,
    });

    const refreshToken = generateRefreshToken({
      userId: user.id,
      email: user.email!,
      role,
    });

    res.json({
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role,
      },
      accessToken,
      refreshToken,
    });
  } catch (error) {
    console.error('Login error:', error);
    const isDev = process.env.NODE_ENV !== 'production';
    res.status(500).json({ error: 'Internal server error', message: isDev ? (error as any)?.message : undefined, stack: isDev ? (error as any)?.stack?.split('\n').slice(0,10) : undefined });
  }
});

// Refresh token
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({ error: 'No refresh token provided' });
    }

    const decoded = verifyToken(refreshToken);
    if (!decoded) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }
    const accessToken = generateAccessToken({
      userId: decoded.userId,
      email: decoded.email,
      role: decoded.role,
    });

    res.json({ accessToken });
  } catch (error) {
    return res.status(401).json({ error: 'Invalid refresh token' });
  }
});

// Get current user
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7);
    const decoded = verifyToken(token);

    if (!decoded) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const user: any = await db.query.profiles.findFirst({
      where: eq(profiles.id, decoded.userId),
      with: {
        roles: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      avatarUrl: user.avatarUrl,
      status: user.status,
      isActive: user.isActive,
      role: user.roles?.[0]?.role || 'agent',
    });
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
});

export default router;
