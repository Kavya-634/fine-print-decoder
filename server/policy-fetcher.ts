import { lookup as dnsLookup } from 'node:dns/promises';
import { request as httpRequest, type IncomingMessage, type RequestOptions } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib';
import { Transform, type Readable } from 'node:stream';
import * as cheerio from 'cheerio';
import ipaddr from 'ipaddr.js';

// Small, explicit crawl budget. No scripts, assets, forms, cookies, or login.
export const LIMITS = {
  totalMs: 18_000,
  requestMs: 6_000,
  dnsMs: 2_000,
  requests: 8,
  redirects: 3,
  pageBytes: 1_000_000,
  totalBytes: 3_000_000,
  textCharacters: 100_000,
  candidatePages: 4,
} as const;

export class PolicyError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 422
  ) {
    super(message);
  }
}

const fail = (code: string, message: string, status = 422): never => {
  throw new PolicyError(code, message, status);
};
export const BLOCKED_MESSAGE =
  'For safety, only public website addresses on standard HTTP or HTTPS ports are supported. Please use Paste Text for private or local pages.';

export type PolicyKind = 'terms' | 'privacy';
export interface PolicyPage {
  kind: PolicyKind;
  title: string;
  url: string;
  text: string;
}
export interface PolicyResult {
  pages: PolicyPage[];
  warnings: string[];
}
export interface Address {
  address: string;
  family: number;
}
export type Resolver = (hostname: string) => Promise<Address[]>;
export interface HopResponse {
  status: number;
  headers: IncomingMessage['headers'];
  body: string;
}
export type Transport = (
  url: URL,
  address: Address,
  signal: AbortSignal,
  consume: (bytes: number) => void
) => Promise<HopResponse>;

export function validateUrl(input: string, base?: URL): URL {
  if (
    typeof input !== 'string' ||
    !input.trim() ||
    input.length > 2048 ||
    /[\u0000-\u0020\u007f\\]/u.test(input.trim())
  ) {
    return fail('INVALID_URL', 'Enter a complete website address, such as https://example.com.');
  }
  let url: URL;
  try {
    url = base ? new URL(input.trim(), base) : new URL(input.trim());
  } catch {
    return fail(
      'INVALID_URL',
      'That address doesn’t look right. Try a full URL beginning with https://.'
    );
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.port ||
    isIP(host.replace(/^\[|\]$/g, '')) ||
    !host.includes('.') ||
    host.length > 253 ||
    !/^[a-z0-9.-]+$/.test(host) ||
    host
      .split('.')
      .some(
        (label) => !label || label.length > 63 || label.startsWith('-') || label.endsWith('-')
      ) ||
    /(?:^|\.)(?:localhost|local|internal|intranet|home|lan|test|invalid|example|onion|arpa)$/.test(
      host
    )
  ) {
    return fail('BLOCKED_URL', BLOCKED_MESSAGE, 400);
  }
  url.hostname = host;
  url.hash = '';
  if (url.href.length > 2048)
    return fail(
      'INVALID_URL',
      'That website address is too long. Try a shorter policy link or use Paste Text.'
    );
  return url;
}

export function isPublicAddress(address: string): boolean {
  try {
    const parsed = ipaddr.parse(address);
    if (parsed.range() !== 'unicast') return false;
    if (parsed.kind() === 'ipv4') {
      // Explicitly deny special-use ranges even if a future library calls them
      // unicast; allow no unspecified, local, shared, documentation or multicast.
      return ![
        '0.0.0.0/8',
        '10.0.0.0/8',
        '100.64.0.0/10',
        '127.0.0.0/8',
        '169.254.0.0/16',
        '172.16.0.0/12',
        '192.0.0.0/24',
        '192.0.2.0/24',
        '192.88.99.0/24',
        '192.168.0.0/16',
        '198.18.0.0/15',
        '198.51.100.0/24',
        '203.0.113.0/24',
        '224.0.0.0/3',
      ].some((range) => parsed.match(ipaddr.parseCIDR(range)));
    }
    // Conservative global IPv6 only. No mapped IPv4, NAT64, Teredo, 6to4,
    // multicast, link-local, ULA, benchmarking, or documentation addresses.
    return (
      parsed.match(ipaddr.parseCIDR('2000::/3')) &&
      !['2001::/23', '2001:db8::/32', '2002::/16', '3fff::/20'].some((range) =>
        parsed.match(ipaddr.parseCIDR(range))
      )
    );
  } catch {
    return false;
  }
}

export async function resolvePublic(
  hostname: string,
  signal: AbortSignal,
  resolve: Resolver
): Promise<Address> {
  const records = await bounded(resolve(hostname), LIMITS.dnsMs, signal);
  if (!records.length)
    return fail(
      'DNS_FAILED',
      'We couldn’t find that website. Check the spelling or use Paste Text.'
    );
  // Reject the entire answer if ANY record is unsafe, not merely the chosen one.
  if (
    records.some(
      (record) =>
        ![4, 6].includes(record.family) ||
        isIP(record.address) !== record.family ||
        !isPublicAddress(record.address)
    )
  ) {
    return fail('BLOCKED_URL', BLOCKED_MESSAGE, 400);
  }
  return records.find((record) => record.family === 4) ?? records[0];
}

function bounded<T>(promise: Promise<T>, milliseconds: number, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () =>
      reject(
        new PolicyError(
          'TIMEOUT',
          'That website took too long to respond. Please try again or use Paste Text.',
          504
        )
      );
    const timer = setTimeout(abort, milliseconds);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    promise.then(resolve, reject).finally(() => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
    });
  });
}

// Exposed for tests: DNS is pinned at the socket lookup, while URL hostname,
// Host header, TLS SNI, and certificate validation keep the original name.
export function pinnedLookup(address: Address): NonNullable<RequestOptions['lookup']> {
  return (_hostname, options, callback) => {
    if (options.all) callback(null, [address]);
    else callback(null, address.address, address.family);
  };
}

export const requestHop: Transport = (url, address, signal, consume) =>
  new Promise((resolve, reject) => {
    const nativeRequest = url.protocol === 'https:' ? httpsRequest : httpRequest;
    const request = nativeRequest(
      url,
      {
        method: 'GET',
        agent: false,
        signal,
        lookup: pinnedLookup(address),
        // Only fixed headers. Do not forward Authorization, Cookie, Origin, or input.
        headers: {
          'User-Agent': 'FinePrintDecoder/1.2 (public-policy reader)',
          Accept: 'text/html,application/xhtml+xml,text/plain;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
        },
        maxHeaderSize: 16_384,
      },
      (response) => {
        const status = response.statusCode ?? 0;
        if ([301, 302, 303, 307, 308].includes(status)) {
          response.destroy();
          resolve({ status, headers: response.headers, body: '' });
          return;
        }
        if (status < 200 || status >= 300) {
          response.destroy();
          reject(
            new PolicyError(
              'SITE_UNAVAILABLE',
              status === 403 || status === 429
                ? 'This site blocks automated readers. Open its policy yourself and use Paste Text.'
                : 'The website returned an error. Check the link or use Paste Text.'
            )
          );
          return;
        }
        if (
          !/^(?:text\/html|application\/xhtml\+xml|text\/plain)(?:\s*;|$)/i.test(
            response.headers['content-type'] ?? ''
          )
        ) {
          response.destroy();
          reject(
            new PolicyError(
              'UNSUPPORTED_CONTENT',
              'We can read HTML and plain text, but not PDFs or downloads. Copy the policy into Paste Text.'
            )
          );
          return;
        }
        if (Number(response.headers['content-length']) > LIMITS.pageBytes) {
          response.destroy();
          reject(
            new PolicyError(
              'PAGE_TOO_LARGE',
              'This page is too large to load safely. Copy the policy into Paste Text in smaller sections.'
            )
          );
          return;
        }
        let wireBytes = 0;
        let decodedBytes = 0;
        const chunks: Buffer[] = [];
        let decoder: Readable = response;
        const encoding = response.headers['content-encoding']?.toLowerCase().trim();
        let failed = false;
        const cleanup = (error: Error) => {
          if (failed) return;
          failed = true;
          // Preserve the first diagnostic before destroy() emits a nested aborted
          // event; otherwise a size-limit error can look like a network failure.
          reject(error);
          request.destroy();
          response.destroy();
          decoder.destroy();
        };
        const wireLimit = new Transform({
          transform(chunk: Buffer, _encoding, callback) {
            try {
              wireBytes += chunk.length;
              if (wireBytes > LIMITS.pageBytes)
                throw new PolicyError(
                  'PAGE_TOO_LARGE',
                  'This page is too large to load safely. Please use Paste Text.'
                );
              consume(chunk.length);
              callback(null, chunk);
            } catch (error) {
              callback(error as Error);
            }
          },
        });
        wireLimit.on('error', cleanup);
        response.on('error', cleanup);
        response.on('aborted', () =>
          cleanup(
            new PolicyError(
              'SITE_UNAVAILABLE',
              'The website closed the connection early. Please try again or use Paste Text.'
            )
          )
        );
        const limited = response.pipe(wireLimit);
        if (!encoding || encoding === 'identity') decoder = limited;
        else if (encoding === 'gzip') decoder = limited.pipe(createGunzip());
        else if (encoding === 'deflate') decoder = limited.pipe(createInflate());
        else if (encoding === 'br') decoder = limited.pipe(createBrotliDecompress());
        else {
          cleanup(
            new PolicyError(
              'UNSUPPORTED_CONTENT',
              'This website uses an unsupported response format. Please use Paste Text.'
            )
          );
          return;
        }
        decoder.on('error', cleanup);
        decoder.on('data', (chunk: Buffer) => {
          decodedBytes += chunk.length;
          if (decodedBytes > LIMITS.pageBytes) {
            cleanup(
              new PolicyError(
                'PAGE_TOO_LARGE',
                'This page expands beyond the safe size limit. Please use Paste Text.'
              )
            );
            return;
          }
          chunks.push(Buffer.from(chunk));
        });
        decoder.on('end', () => {
          const charset =
            /charset\s*=\s*["']?([^\s;"']+)/i.exec(response.headers['content-type'] ?? '')?.[1] ??
            'utf-8';
          try {
            resolve({
              status,
              headers: response.headers,
              body: new TextDecoder(charset).decode(Buffer.concat(chunks)),
            });
          } catch {
            reject(
              new PolicyError(
                'UNSUPPORTED_CONTENT',
                'We couldn’t decode the text on this page. Please use Paste Text.'
              )
            );
          }
        });
      }
    );
    request.setTimeout(LIMITS.requestMs, () =>
      request.destroy(
        new PolicyError(
          'TIMEOUT',
          'That website took too long to respond. Try again or use Paste Text.',
          504
        )
      )
    );
    request.on('error', reject);
    request.end();
  });

interface Budget {
  requests: number;
  bytes: number;
}
async function loadPage(
  initial: URL,
  signal: AbortSignal,
  budget: Budget,
  resolve: Resolver,
  transport: Transport
) {
  let url = initial;
  const visited = new Set<string>();
  for (let hop = 0; hop <= LIMITS.redirects; hop++) {
    if (visited.has(url.href))
      return fail(
        'REDIRECT_LOOP',
        'This website keeps redirecting. Please open its policy and use Paste Text.'
      );
    visited.add(url.href);
    if (++budget.requests > LIMITS.requests)
      return fail(
        'REQUEST_LIMIT',
        'We reached the safe page-loading limit. Try a direct policy link or use Paste Text.'
      );
    const signalForHop = AbortSignal.any([signal, AbortSignal.timeout(LIMITS.requestMs)]);
    const address = await resolvePublic(url.hostname, signalForHop, resolve);
    const result = await bounded(
      transport(url, address, signalForHop, (bytes) => {
        budget.bytes += bytes;
        if (budget.bytes > LIMITS.totalBytes)
          return fail(
            'PAGE_TOO_LARGE',
            'These pages exceed the safe download limit. Please use Paste Text.'
          );
      }),
      LIMITS.requestMs,
      signalForHop
    );
    if (![301, 302, 303, 307, 308].includes(result.status)) return { ...result, url };
    if (!result.headers.location)
      return fail(
        'BAD_REDIRECT',
        'This website sent an incomplete redirect. Please use Paste Text.'
      );
    const next = validateUrl(result.headers.location, url);
    if (url.protocol === 'https:' && next.protocol !== 'https:')
      return fail(
        'BLOCKED_REDIRECT',
        'This website redirects to an insecure address. Please use Paste Text instead.'
      );
    url = next;
  }
  return fail(
    'REDIRECT_LIMIT',
    'This website redirects too many times. Try a direct policy link or use Paste Text.'
  );
}

const labels: Record<PolicyKind, RegExp> = {
  privacy: /\bprivacy(?:\s+(?:policy|notice|statement))?\b/i,
  terms: /\bterms(?:\s+(?:of\s+(?:service|use)|and\s+conditions))?\b|\buser agreement\b/i,
};
function kindOf(value: string): PolicyKind | undefined {
  return labels.privacy.test(value) ? 'privacy' : labels.terms.test(value) ? 'terms' : undefined;
}

export function extractPage(html: string, url: URL, contentType = 'text/html') {
  if (/^text\/plain\b/i.test(contentType)) {
    return {
      text: html.trim(),
      title: url.hostname,
      kind: kindOf(url.pathname.replace(/[-_/]+/g, ' ')),
      links: [] as { kind: PolicyKind; url: URL }[],
    };
  }
  const $ = cheerio.load(html);
  const title = $('title').first().text().replace(/\s+/g, ' ').trim().slice(0, 180) || url.hostname;
  const heading = $('h1').first().text().trim();
  if (
    /\b(?:sign in|log in|login|access denied|just a moment|verify you are human|checking your browser)\b/i.test(
      `${title} ${heading}`
    )
  ) {
    return fail(
      'SITE_BLOCKED',
      'This page requires a login or blocks automated readers. Open the policy yourself and use Paste Text.'
    );
  }
  // Title/H1/path identify direct policy URLs; footer/link mentions alone don't.
  const kind = kindOf(`${url.pathname.replace(/[-_/]+/g, ' ')} ${heading} ${title}`);
  const links: { kind: PolicyKind; url: URL }[] = [];
  $('a[href]').each((_index, element) => {
    if (links.length >= 30) return;
    // On direct policy pages, skip global/sidebar navigation: a central policy
    // library may list agreements for many unrelated products in that menu.
    // Footer and in-document policy references remain eligible.
    if (kind && $(element).closest('nav,header,[role="navigation"],[role="banner"]').length) return;
    const href = $(element).attr('href') ?? '';
    const label = `${$(element).text()} ${$(element).attr('aria-label') ?? ''} ${href.replace(/[-_/]+/g, ' ')}`;
    const linkKind = kindOf(label);
    if (!linkKind) return;
    try {
      const link = validateUrl(href, url);
      // Do not turn discovery into an arbitrary cross-site crawler. Redirects
      // from explicit/found links are separately validated on every hop.
      if (
        link.origin === url.origin &&
        link.href !== url.href &&
        !links.some((other) => other.url.href === link.href)
      )
        links.push({ kind: linkKind, url: link });
    } catch {
      /* Ignore unsafe or irrelevant discovery links. */
    }
  });
  $(
    'script,style,noscript,iframe,object,embed,svg,canvas,template,nav,header,footer,form,button,[hidden],[aria-hidden="true"],[role="navigation"],[role="banner"],[role="contentinfo"]'
  ).remove();
  const main = $('main,[role="main"],article').first();
  const root = main.length ? main : $('body');
  root.find('br').replaceWith('\n');
  root.find('p,div,section,article,h1,h2,h3,h4,h5,h6,li,tr,blockquote').each((_index, element) => {
    $(element).prepend('\n').append('\n');
  });
  const text = root
    .text()
    .replace(/\r/g, '')
    .replace(/[\t\f\v \u00a0]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { text, title, kind, links };
}

export async function fetchPolicies(
  input: string,
  options: { resolve?: Resolver; transport?: Transport; signal?: AbortSignal } = {}
): Promise<PolicyResult> {
  const initial = validateUrl(input);
  const signal = AbortSignal.any([
    options.signal ?? new AbortController().signal,
    AbortSignal.timeout(LIMITS.totalMs),
  ]);
  const resolve: Resolver =
    options.resolve ?? ((host) => dnsLookup(host, { all: true, verbatim: true }));
  const transport = options.transport ?? requestHop;
  const budget: Budget = { requests: 0, bytes: 0 };
  try {
    const landing = await loadPage(initial, signal, budget, resolve, transport);
    const extracted = extractPage(landing.body, landing.url, landing.headers['content-type']);
    const pages: PolicyPage[] = [];
    const warnings: string[] = [];
    let characters = 0;
    const addPage = (page: ReturnType<typeof extractPage>, url: URL, kind?: PolicyKind) => {
      if (!kind || pages.some((existing) => existing.kind === kind || existing.url === url.href))
        return;
      if (page.text.length < 160) {
        warnings.push(
          'A discovered page had too little readable policy text. It may need JavaScript or a login; try Paste Text.'
        );
        return;
      }
      if (characters + page.text.length > LIMITS.textCharacters - 5000) {
        warnings.push(
          'A policy exceeded the analysis size limit and was not included. Use Paste Text in sections to review it.'
        );
        return;
      }
      pages.push({ kind, title: page.title, url: url.href, text: page.text });
      characters += page.text.length;
    };
    addPage(extracted, landing.url, extracted.kind);
    const candidates = [...extracted.links];
    // If the landing page has no useful footer links, try two common same-origin
    // paths. This is not recursive crawling and never loads external assets.
    for (const [kind, path] of [
      ['privacy', '/privacy'],
      ['terms', '/terms'],
    ] as const) {
      if (!candidates.some((item) => item.kind === kind))
        candidates.push({ kind, url: new URL(path, landing.url.origin) });
    }
    // Try one candidate of each kind first; a menu with many privacy links
    // must not crowd Terms out of the four-candidate crawl budget.
    const firstKinds = new Set<PolicyKind>();
    const prioritized = candidates.filter((candidate) => {
      if (firstKinds.has(candidate.kind)) return false;
      firstKinds.add(candidate.kind);
      return true;
    });
    prioritized.push(...candidates.filter((candidate) => !prioritized.includes(candidate)));
    let lastError: PolicyError | undefined;
    for (const candidate of prioritized.slice(0, LIMITS.candidatePages)) {
      if (pages.some((page) => page.kind === candidate.kind)) continue;
      if (signal.aborted || budget.requests >= LIMITS.requests) break;
      try {
        const loaded = await loadPage(candidate.url, signal, budget, resolve, transport);
        const page = extractPage(loaded.body, loaded.url, loaded.headers['content-type']);
        // A guessed route that redirects to the homepage is not a policy.
        if (
          loaded.url.href === landing.url.href ||
          (loaded.url.href !== candidate.url.href && !page.kind) ||
          (!page.kind && !extracted.links.some((item) => item.url.href === candidate.url.href))
        )
          continue;
        addPage(page, loaded.url, page.kind ?? candidate.kind);
      } catch (error) {
        lastError =
          error instanceof PolicyError
            ? error
            : new PolicyError(
                'SITE_UNAVAILABLE',
                'One discovered policy could not be loaded. Open it directly and use Paste Text.'
              );
        if (['BLOCKED_URL', 'BLOCKED_REDIRECT'].includes(lastError.code))
          warnings.push('An unsafe policy link or redirect was blocked and not loaded.');
      }
      if (pages.length === 2) break;
    }
    if (!pages.length) {
      if (signal.aborted)
        return fail(
          'TIMEOUT',
          'The website took too long to load. Try a direct policy link or use Paste Text.',
          504
        );
      if (lastError?.code === 'BLOCKED_URL' || lastError?.code === 'BLOCKED_REDIRECT')
        throw lastError;
      return fail(
        'NO_POLICY',
        'We couldn’t find readable Terms or Privacy text. Try a direct policy URL, or copy the policy into Paste Text. Some sites need JavaScript, a login, or block automated readers.'
      );
    }
    for (const kind of ['terms', 'privacy'] as const)
      if (!pages.some((page) => page.kind === kind))
        warnings.push(
          `${kind === 'terms' ? 'Terms of Service' : 'Privacy Policy'} was not found or could not be read. This review is incomplete; paste the missing policy separately.`
        );
    if (signal.aborted)
      warnings.push('The time limit was reached. Only successfully loaded policies are included.');
    return { pages, warnings: [...new Set(warnings)] };
  } catch (error) {
    if (error instanceof PolicyError) throw error;
    if (signal.aborted)
      return fail(
        'TIMEOUT',
        'That website took too long to load. Please try again or use Paste Text.',
        504
      );
    return fail(
      'FETCH_FAILED',
      'We couldn’t reach that website securely. Check the address, try a direct policy link, or use Paste Text.',
      502
    );
  }
}
