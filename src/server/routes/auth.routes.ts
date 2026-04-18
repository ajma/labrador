import { FastifyInstance } from 'fastify';
import bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import { registerSchema, loginSchema } from '../../shared/schemas.js';
import { getDatabase } from '../db/index.js';
import { users, settings } from '../db/schema.js';
import { authenticate } from '../middleware/auth.middleware.js';

const BCRYPT_COST = 12;
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 days in seconds

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  };
}

export async function authRoutes(app: FastifyInstance) {
  // POST /register - Create first admin user
  app.post('/register', async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid input', details: parsed.error.flatten() });
    }

    const db = getDatabase();
    const { username, password } = parsed.data;

    // Check if any user already exists
    const existingUsers = await db.select().from(users);
    if (existingUsers.length > 0) {
      return reply.code(403).send({ error: 'Registration is disabled. A user already exists.' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

    // Insert user
    const [user] = await db.insert(users).values({
      username,
      passwordHash,
    }).returning();

    // Create settings row for user
    await db.insert(settings).values({
      userId: user.id,
    });

    // Generate JWT and set cookie
    const token = app.jwt.sign({ id: user.id, username: user.username });
    reply.setCookie('token', token, cookieOptions());

    return reply.code(201).send({
      id: user.id,
      username: user.username,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
  });

  // POST /login - Authenticate
  app.post('/login', async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid input', details: parsed.error.flatten() });
    }

    const db = getDatabase();
    const { username, password } = parsed.data;

    // Find user by username
    const [user] = await db.select().from(users).where(eq(users.username, username));
    if (!user) {
      return reply.code(401).send({ error: 'Invalid username or password' });
    }

    // Compare password
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return reply.code(401).send({ error: 'Invalid username or password' });
    }

    // Generate JWT and set cookie
    const token = app.jwt.sign({ id: user.id, username: user.username });
    reply.setCookie('token', token, cookieOptions());

    return {
      id: user.id,
      username: user.username,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  });

  // POST /logout - Clear auth cookie
  app.post('/logout', async (_request, reply) => {
    reply.clearCookie('token', { path: '/' });
    return { success: true };
  });

  // GET /me - Get current user (protected)
  app.get('/me', { preHandler: [authenticate] }, async (request) => {
    return request.user;
  });

  // GET /status - Auth status check (unauthenticated)
  app.get('/status', async (request) => {
    const db = getDatabase();

    // Check if any user exists
    const existingUsers = await db.select().from(users);
    const needsOnboarding = existingUsers.length === 0;

    // Try to verify JWT from cookie (don't fail if invalid)
    let authenticated = false;
    try {
      await request.jwtVerify({ onlyCookie: true });
      authenticated = true;
    } catch {
      // Not authenticated, that's fine
    }

    return { needsOnboarding, authenticated };
  });
}
