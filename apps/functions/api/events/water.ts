import { appendEventToGitea, type Env as GiteaEnv } from '../../utils/gitea';

interface Env extends GiteaEnv {
  DB: D1Database;
}

interface RequestBody {
  amount_oz?: number;
  source?: string;
  note?: string;
}

const RATE_LIMIT_WINDOW = 60; // 1 minute in seconds
const RATE_LIMIT_MAX_REQUESTS = 10;
const IDEMPOTENCY_WINDOW = 5; // 5 seconds

/**
 * Get client IP from request
 */
function getClientIP(request: Request): string {
  const cfConnectingIP = request.headers.get('CF-Connecting-IP');
  if (cfConnectingIP) {
    return cfConnectingIP;
  }
  
  // Fallback for local dev
  const forwarded = request.headers.get('X-Forwarded-For');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  
  return 'unknown';
}

/**
 * Check if request is from same origin
 */
function isSameOrigin(request: Request, expectedOrigin: string): boolean {
  const origin = request.headers.get('Origin');
  if (!origin) {
    return false;
  }
  
  try {
    const originUrl = new URL(origin);
    const expectedUrl = new URL(expectedOrigin);
    return originUrl.hostname === expectedUrl.hostname;
  } catch {
    return false;
  }
}

/**
 * Generate idempotency key hash
 */
function generateIdempotencyKey(ip: string, amount: number, timestamp: number): string {
  const window = Math.floor(timestamp / IDEMPOTENCY_WINDOW) * IDEMPOTENCY_WINDOW;
  const data = `${ip}:${amount}:${window}`;
  
  // Simple hash function (Cloudflare Workers don't have crypto.subtle in all contexts)
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  return `idempotency:${Math.abs(hash).toString(16)}`;
}

/**
 * Check rate limit
 */
async function checkRateLimit(db: D1Database, ip: string, now: number): Promise<boolean> {
  const windowStart = Math.floor(now / RATE_LIMIT_WINDOW) * RATE_LIMIT_WINDOW;
  
  // Get current count for this IP in this window
  const result = await db
    .prepare('SELECT request_count FROM rate_limits WHERE ip = ? AND window_start = ?')
    .bind(ip, windowStart)
    .first<{ request_count: number }>();

  const currentCount = result?.request_count || 0;

  if (currentCount >= RATE_LIMIT_MAX_REQUESTS) {
    return false; // Rate limited
  }

  // Increment or insert
  if (currentCount === 0) {
    await db
      .prepare('INSERT INTO rate_limits (ip, window_start, request_count) VALUES (?, ?, 1)')
      .bind(ip, windowStart)
      .run();
  } else {
    await db
      .prepare('UPDATE rate_limits SET request_count = request_count + 1 WHERE ip = ? AND window_start = ?')
      .bind(ip, windowStart)
      .run();
  }

  // Clean up old rate limit entries (older than 1 hour)
  await db
    .prepare('DELETE FROM rate_limits WHERE window_start < ?')
    .bind(now - 3600)
    .run();

  return true;
}

/**
 * Check idempotency
 */
async function checkIdempotency(db: D1Database, keyHash: string, now: number): Promise<boolean> {
  // Check if this key exists
  const result = await db
    .prepare('SELECT created_at FROM idempotency_keys WHERE key_hash = ?')
    .bind(keyHash)
    .first<{ created_at: number }>();

  if (result) {
    // Key exists, check if it's within the window
    const age = now - result.created_at;
    if (age < IDEMPOTENCY_WINDOW) {
      return false; // Duplicate request
    }
  }

  // Store the key
  await db
    .prepare('INSERT OR REPLACE INTO idempotency_keys (key_hash, created_at) VALUES (?, ?)')
    .bind(keyHash, now)
    .run();

  // Clean up old idempotency keys (older than 1 hour)
  await db
    .prepare('DELETE FROM idempotency_keys WHERE created_at < ?')
    .bind(now - 3600)
    .run();

  return true;
}

/**
 * Generate UUID v4
 */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function onRequestPost(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;

  // Check same-origin
  const expectedOrigin = new URL(request.url).origin;
  if (!isSameOrigin(request, expectedOrigin)) {
    return new Response(
      JSON.stringify({ error: 'Invalid origin' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Parse request body
  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Validate amount
  const amount = body.amount_oz ?? 64;
  if (typeof amount !== 'number' || amount < 0 || amount > 10000) {
    return new Response(
      JSON.stringify({ error: 'Invalid amount_oz' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Get client IP and check rate limit
  const ip = getClientIP(request);
  const now = Math.floor(Date.now() / 1000);

  if (!(await checkRateLimit(env.DB, ip, now))) {
    return new Response(
      JSON.stringify({ error: 'Rate limit exceeded' }),
      { status: 429, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Check idempotency
  const idempotencyKey = generateIdempotencyKey(ip, amount, now);
  if (!(await checkIdempotency(env.DB, idempotencyKey, now))) {
    return new Response(
      JSON.stringify({ error: 'Duplicate request' }),
      { status: 409, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Create event
  const eventId = generateUUID();
  const userAgent = request.headers.get('User-Agent') || null;
  const source = body.source || null;
  const note = body.note || null;

  // Insert into D1
  try {
    await env.DB.prepare(
      `INSERT INTO events (id, type, amount_oz, created_at, user_agent, source, note)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(eventId, 'water', amount, now, userAgent, source, note)
      .run();

    // Trigger Gitea webhook asynchronously (don't await)
    appendEventToGitea(
      {
        id: eventId,
        type: 'water',
        amount_oz: amount,
        created_at: now,
        user_agent: userAgent,
        source: source,
        note: note,
      },
      env
    ).catch((error) => {
      console.error('Gitea webhook failed (non-blocking):', error);
    });

    return new Response(
      JSON.stringify({
        success: true,
        id: eventId,
        amount_oz: amount,
        created_at: now,
      }),
      {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Database error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

