import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const fetchPolicies = vi.hoisted(() => vi.fn());
vi.mock('../server/policy-fetcher', async (original) => ({
  ...(await original<typeof import('../server/policy-fetcher')>()),
  fetchPolicies,
}));

async function endpoint() {
  return (await import('../api/fetch-policy')).default;
}
function response() {
  const target = new EventEmitter() as EventEmitter & {
    destroyed: boolean;
    writableEnded: boolean;
    setHeader: ReturnType<typeof vi.fn>;
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  };
  target.destroyed = false;
  target.writableEnded = false;
  target.setHeader = vi.fn();
  target.status = vi.fn(() => target);
  target.json = vi.fn(() => target);
  return target;
}
function request(patch: object = {}) {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    socket: { remoteAddress: '127.0.0.1' },
    body: { url: 'https://example.com' },
    ...patch,
  } as VercelRequest;
}

describe('Vercel request handler', () => {
  beforeEach(() => {
    vi.resetModules();
    fetchPolicies.mockReset();
  });
  it('returns the extraction with no-store/nosniff and cleans up event listeners', async () => {
    const result = {
      pages: [
        { kind: 'privacy', title: 'Privacy', url: 'https://example.com/privacy', text: 'sample' },
      ],
      warnings: [],
    };
    fetchPolicies.mockResolvedValue(result);
    const res = response();
    await (
      await endpoint()
    )(request(), res as unknown as VercelResponse);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(result);
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(res.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
    expect(res.listenerCount('close')).toBe(0);
  });
  it('fails closed on malformed requests and never calls the fetcher', async () => {
    for (const patch of [
      { method: 'GET' },
      { body: { url: 'x', extra: 'y' } },
      { body: { url: 100 } },
      { body: 'x'.repeat(4097) },
      { headers: { 'content-type': 'application/json', 'sec-fetch-site': 'cross-site' } },
    ]) {
      const res = response();
      await (
        await endpoint()
      )(request(patch), res as unknown as VercelResponse);
      expect(res.status).toHaveBeenCalledWith(expect.any(Number));
      expect(res.status.mock.calls[0][0]).toBeGreaterThanOrEqual(400);
    }
    expect(fetchPolicies).not.toHaveBeenCalled();
  });
  it('does not leak raw internal errors', async () => {
    fetchPolicies.mockRejectedValue(new Error('SECRET internal IP 10.0.0.1'));
    const res = response();
    await (
      await endpoint()
    )(request(), res as unknown as VercelResponse);
    expect(res.status).toHaveBeenCalledWith(502);
    expect(JSON.stringify(res.json.mock.calls)).not.toContain('SECRET');
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('Paste Text') })
    );
  });
  it('limits repeated requests without trusting spoofed forwarding headers', async () => {
    fetchPolicies.mockResolvedValue({ pages: [], warnings: [] });
    const handler = await endpoint();
    for (let i = 0; i < 5; i++)
      await handler(
        request({
          headers: { 'content-type': 'application/json', 'x-forwarded-for': `8.8.8.${i}` },
        }),
        response() as unknown as VercelResponse
      );
    const res = response();
    await handler(request(), res as unknown as VercelResponse);
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.setHeader).toHaveBeenCalledWith('Retry-After', '60');
    expect(fetchPolicies).toHaveBeenCalledTimes(5);
  });
  it('aborts outbound work when the response connection closes', async () => {
    const res = response();
    fetchPolicies.mockImplementation(async (_url, { signal }) => {
      res.emit('close');
      expect(signal.aborted).toBe(true);
      return { pages: [], warnings: [] };
    });
    await (
      await endpoint()
    )(request(), res as unknown as VercelResponse);
    expect(res.listenerCount('close')).toBe(0);
  });
});
