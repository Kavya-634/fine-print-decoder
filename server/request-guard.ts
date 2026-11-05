import { createHash } from 'node:crypto';
import type { VercelRequest } from '@vercel/node';
import { PolicyError } from './policy-fetcher';

// No database or API keys. This bounded limiter is PER WARM FUNCTION INSTANCE,
// not a global security boundary. Add Vercel Firewall rate limiting before a
// public/high-traffic launch; see README. Do not trust arbitrary proxy headers.
const WINDOW_MS = 60_000;
const MAX_CLIENT_REQUESTS = 5;
const MAX_INSTANCE_REQUESTS = 30;
const MAX_CONCURRENT = 3;
const MAX_CLIENTS = 2000;

export class RequestGuard {
  private clients = new Map<string, { count: number; reset: number }>();
  private instance = { count: 0, reset: 0 };
  private active = 0;

  enter(client: string, now = Date.now()): () => void {
    for (const [key, value] of this.clients) if (value.reset <= now) this.clients.delete(key);
    if (this.instance.reset <= now) this.instance = { count: 0, reset: now + WINDOW_MS };
    const key = createHash('sha256').update(client).digest('hex');
    const entry = this.clients.get(key) ?? { count: 0, reset: now + WINDOW_MS };
    if (
      entry.count >= MAX_CLIENT_REQUESTS ||
      this.instance.count >= MAX_INSTANCE_REQUESTS ||
      this.active >= MAX_CONCURRENT ||
      (!this.clients.has(key) && this.clients.size >= MAX_CLIENTS)
    ) {
      throw new PolicyError(
        'RATE_LIMITED',
        'Too many website requests right now. Wait a minute, or use Paste Text without waiting.',
        429
      );
    }
    entry.count++;
    this.clients.set(key, entry);
    this.instance.count++;
    this.active++;
    let released = false;
    return () => {
      if (!released) {
        released = true;
        this.active--;
      }
    };
  }
}

export function clientAddress(request: VercelRequest): string {
  // Vercel overwrites x-vercel-forwarded-for. Locally use the actual socket;
  // never use a user-supplied x-forwarded-for to bypass request limits.
  const forwarded = request.headers['x-vercel-forwarded-for'];
  if (
    process.env.VERCEL === '1' &&
    ['production', 'preview'].includes(process.env.VERCEL_ENV ?? '') &&
    typeof forwarded === 'string'
  )
    return forwarded.split(',')[0].trim();
  return request.socket.remoteAddress ?? 'unknown';
}

export function validateRequest(request: VercelRequest): string {
  if (request.method !== 'POST')
    throw new PolicyError('METHOD_NOT_ALLOWED', 'Use the website form to load a policy.', 405);
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] ?? ''))
    throw new PolicyError('UNSUPPORTED_MEDIA', 'Send the website address as JSON.', 415);
  if (request.headers['sec-fetch-site'] === 'cross-site')
    throw new PolicyError('ORIGIN_BLOCKED', 'Please use the Website URL form on this site.', 403);
  const origin = request.headers.origin;
  if (origin) {
    try {
      const parsed = new URL(origin);
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.host !== request.headers.host)
        throw new Error('origin');
    } catch {
      throw new PolicyError('ORIGIN_BLOCKED', 'Please use the Website URL form on this site.', 403);
    }
  }
  if (Number(request.headers['content-length']) > 4096)
    throw new PolicyError(
      'BODY_TOO_LARGE',
      'That request is too large. Send just one website address.',
      413
    );
  let body: unknown = request.body;
  if (typeof body === 'string') {
    if (Buffer.byteLength(body) > 4096)
      throw new PolicyError(
        'BODY_TOO_LARGE',
        'That request is too large. Send just one website address.',
        413
      );
    try {
      body = JSON.parse(body);
    } catch {
      throw new PolicyError(
        'INVALID_REQUEST',
        'That request could not be read. Please try the URL again.',
        400
      );
    }
  }
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    Buffer.byteLength(JSON.stringify(body)) > 4096 ||
    Object.keys(body).length !== 1 ||
    !('url' in body) ||
    typeof body.url !== 'string' ||
    body.url.length > 2048
  ) {
    throw new PolicyError(
      'INVALID_REQUEST',
      'Enter one full website address, such as https://example.com.',
      400
    );
  }
  return body.url;
}
