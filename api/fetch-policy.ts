// Opt-in URL fetching only. Paste mode never calls this endpoint.
// All network I/O passes URL/DNS validation and a DNS-pinned transport.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { fetchPolicies, PolicyError } from '../server/policy-fetcher';
import { clientAddress, RequestGuard, validateRequest } from '../server/request-guard';

const guard = new RequestGuard();

export default async function handler(request: VercelRequest, response: VercelResponse) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  response.setHeader('Allow', 'POST');
  let release: (() => void) | undefined;
  const controller = new AbortController();
  const disconnected = () => {
    if (!response.writableEnded) controller.abort();
  };
  response.on('close', disconnected);
  try {
    release = guard.enter(clientAddress(request));
    const url = validateRequest(request);
    const result = await fetchPolicies(url, { signal: controller.signal });
    if (!response.destroyed) response.status(200).json(result);
  } catch (error) {
    const failure =
      error instanceof PolicyError
        ? error
        : new PolicyError(
            'FETCH_FAILED',
            'We couldn’t load that website. Please try again or use Paste Text.',
            502
          );
    if (!response.destroyed) {
      if (failure.status === 429) response.setHeader('Retry-After', '60');
      // No internal addresses, stack traces, DNS errors, URLs, or raw HTML.
      response.status(failure.status).json({ code: failure.code, message: failure.message });
    }
  } finally {
    release?.();
    response.off('close', disconnected);
  }
}
