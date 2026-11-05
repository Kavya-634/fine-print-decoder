import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import { gzipSync } from 'node:zlib';
import {
  extractPage,
  fetchPolicies,
  isPublicAddress,
  LIMITS,
  pinnedLookup,
  requestHop,
  resolvePublic,
  validateUrl,
  type Resolver,
  type Transport,
} from '../server/policy-fetcher';
import { RequestGuard, validateRequest } from '../server/request-guard';
import type { VercelRequest } from '@vercel/node';

const publicDns: Resolver = async () => [{ address: '93.184.216.34', family: 4 }];
const text =
  'We may share your personal information with advertising partners. Your subscription will automatically renew each month. All payments are non-refundable. You waive your right to participate in a class action.';
const policy = (title: string) =>
  `<html><title>${title}</title><main><h1>${title}</h1><p>${text}</p></main></html>`;
const ok = (body: string) => ({
  status: 200,
  headers: { 'content-type': 'text/html; charset=utf-8' },
  body,
});
const fixture = () => {
  const calls: string[] = [];
  const transport: Transport = async (url, _address, _signal, consume) => {
    calls.push(url.href);
    const body =
      url.pathname === '/legal/privacy'
        ? policy('Privacy Policy')
        : url.pathname === '/legal/terms'
          ? policy('Terms of Service')
          : '<main><h1>Welcome</h1><p>Our product.</p></main><footer><a href="/legal/privacy">Privacy Policy</a><a href="/legal/terms">Terms of Service</a></footer>';
    consume(Buffer.byteLength(body));
    return ok(body);
  };
  return { calls, transport };
};

describe('URL and DNS restrictions', () => {
  it.each([
    'http://localhost',
    'https://127.0.0.1/',
    'https://2130706433',
    'https://0x7f000001',
    'https://0177.0.0.1',
    'https://[::1]',
    'https://[::ffff:127.0.0.1]',
    'http://169.254.169.254/latest/meta-data',
    'ftp://example.com',
    'file:///etc/passwd',
    'gopher://example.com',
    'https://user:password@example.com',
    'https://example.com:8080',
    'https://example.com:22',
    'https://foo.local',
    'https://metadata.google.internal',
    'https://site.test',
    'https://x.onion',
    'https://example.com\\@127.0.0.1',
    'https://example.com\nX: foo',
  ])('blocks unsafe target %s', (url) => {
    expect(() => validateUrl(url)).toThrow();
  });
  it('normalizes a public hostname and removes fragments without changing query data', () => {
    expect(validateUrl('https://EXAMPLE.com.:443/privacy?a=1#part').href).toBe(
      'https://example.com/privacy?a=1'
    );
  });
  it.each([
    '0.0.0.0',
    '10.0.0.1',
    '100.64.0.1',
    '127.0.0.1',
    '169.254.169.254',
    '172.16.0.1',
    '192.168.1.1',
    '192.0.0.8',
    '192.0.2.1',
    '198.18.0.1',
    '198.51.100.1',
    '203.0.113.1',
    '224.0.0.1',
    '240.0.0.1',
    '255.255.255.255',
    '::',
    '::1',
    '::ffff:8.8.8.8',
    '64:ff9b::a00:1',
    'fc00::1',
    'fe80::1',
    'ff02::1',
    '2001::1',
    '2001:db8::1',
    '2002:7f00:1::1',
    '3fff::1',
  ])('blocks special-use address %s', (address) => expect(isPublicAddress(address)).toBe(false));
  it.each(['8.8.8.8', '1.1.1.1', '93.184.216.34', '2606:4700:4700::1111', '2001:4860:4860::8888'])(
    'allows public address %s',
    (address) => expect(isPublicAddress(address)).toBe(true)
  );
  it('rejects mixed public/private DNS answers before any connection', async () => {
    const transport = vi.fn<Transport>();
    await expect(
      fetchPolicies('https://example.com', {
        resolve: async () => [
          { address: '8.8.8.8', family: 4 },
          { address: '10.0.0.1', family: 4 },
        ],
        transport,
      })
    ).rejects.toMatchObject({ code: 'BLOCKED_URL' });
    expect(transport).not.toHaveBeenCalled();
  });
  it('rejects empty DNS and family mismatch', async () => {
    await expect(
      resolvePublic('example.com', new AbortController().signal, async () => [])
    ).rejects.toMatchObject({ code: 'DNS_FAILED' });
    await expect(
      resolvePublic('example.com', new AbortController().signal, async () => [
        { address: '8.8.8.8', family: 6 },
      ])
    ).rejects.toMatchObject({ code: 'BLOCKED_URL' });
  });
  it('pins both Node lookup callback forms to the validated address', () => {
    const lookup = pinnedLookup({ address: '8.8.8.8', family: 4 });
    const callback = vi.fn();
    lookup('example.com', { all: true }, callback);
    expect(callback).toHaveBeenCalledWith(null, [{ address: '8.8.8.8', family: 4 }]);
    lookup('example.com', {}, callback);
    expect(callback).toHaveBeenCalledWith(null, '8.8.8.8', 4);
  });
  it('stops DNS resolution at its deadline', async () => {
    vi.useFakeTimers();
    try {
      const pending = resolvePublic(
        'example.com',
        new AbortController().signal,
        () => new Promise(() => {})
      );
      const rejection = expect(pending).rejects.toMatchObject({ code: 'TIMEOUT' });
      await vi.advanceTimersByTimeAsync(LIMITS.dnsMs + 1);
      await rejection;
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('discovery, extraction and redirect safety', () => {
  it('tries both policy kinds before duplicate privacy links use up the budget', async () => {
    const calls: string[] = [];
    const result = await fetchPolicies('https://example.com', {
      resolve: publicDns,
      transport: async (url) => {
        calls.push(url.pathname);
        if (url.pathname === '/')
          return ok(
            '<title>Home</title>' +
              Array.from(
                { length: 5 },
                (_, i) => `<a href="/privacy-${i}">Privacy Policy</a>`
              ).join('') +
              '<a href="/legal/terms">Terms of Service</a>'
          );
        return ok(policy(url.pathname.includes('terms') ? 'Terms of Service' : 'Privacy Policy'));
      },
    });
    expect(result.pages).toHaveLength(2);
    expect(calls).toEqual(['/', '/privacy-0', '/legal/terms']);
  });
  it('refuses login/anti-bot pages even at a policy-looking URL', () => {
    expect(() =>
      extractPage(
        '<title>Sign in</title><main><h1>Sign in</h1>' + text + '</main>',
        new URL('https://example.com/privacy')
      )
    ).toThrow(/login/);
  });
  it('does not mix other products from a policy-library sidebar into a direct policy', () => {
    const html =
      '<title>Product A Privacy Policy</title><nav><a href="/product-b/terms">Terms of Service</a></nav><main><h1>Privacy Policy</h1><p>Our product policy</p></main>';
    expect(extractPage(html, new URL('https://example.com/product-a/privacy')).links).toEqual([]);
  });
  it('discovers both policies and keeps only readable text', async () => {
    const { calls, transport } = fixture();
    const result = await fetchPolicies('https://example.com', { resolve: publicDns, transport });
    expect(result.pages.map((page) => page.kind)).toEqual(['privacy', 'terms']);
    expect(result.warnings).toEqual([]);
    expect(calls).toHaveLength(3);
    expect(result.pages[0].text).toContain(text);
    expect(result.pages[0].text).not.toContain('<p>');
  });
  it('ignores malicious external links, ignores base tags, and strips executable/hidden clutter', () => {
    const html = `<base href="http://169.254.169.254"><script>steal()</script><style>bad</style><nav>Menu</nav><footer>Footer<a href="http://localhost/terms">Terms</a></footer><a href="https://evil.com/privacy">Privacy</a><a href="/legal/privacy">Privacy Policy</a><main><h1>Privacy Policy</h1><p>Hello &amp; welcome.</p><div hidden>secret</div><div aria-hidden="true">hidden</div><p>Next clause.</p></main>`;
    const page = extractPage(html, new URL('https://example.com'));
    expect(page.links.map((link) => link.url.href)).toEqual(['https://example.com/legal/privacy']);
    expect(page.text).toBe('Privacy Policy\n\nHello & welcome.\n\nNext clause.');
  });
  it.each([
    'http://169.254.169.254/latest/meta-data',
    'https://127.0.0.1',
    'https://private.example.com',
  ])('validates every redirect to %s', async (location) => {
    const transport = vi
      .fn<Transport>()
      .mockResolvedValue({ status: 302, headers: { location }, body: '' });
    const resolve: Resolver = async (host) => [
      { address: host.startsWith('private') ? '10.0.0.1' : '8.8.8.8', family: 4 },
    ];
    await expect(
      fetchPolicies('https://example.com', { resolve, transport })
    ).rejects.toMatchObject({ code: expect.stringMatching(/^BLOCKED/) });
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('re-resolves and blocks DNS rebinding even on a same-host redirect', async () => {
    let count = 0;
    const resolve: Resolver = async () => [
      { address: ++count === 1 ? '8.8.8.8' : '127.0.0.1', family: 4 },
    ];
    const transport = vi
      .fn<Transport>()
      .mockResolvedValue({ status: 302, headers: { location: '/privacy' }, body: '' });
    await expect(
      fetchPolicies('https://example.com', { resolve, transport })
    ).rejects.toMatchObject({ code: 'BLOCKED_URL' });
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('supports safe public redirects but not TLS downgrade', async () => {
    const transport: Transport = async (url) =>
      url.hostname === 'example.com'
        ? { status: 302, headers: { location: 'https://www.example.com/privacy' }, body: '' }
        : ok(policy('Privacy Policy'));
    const result = await fetchPolicies('https://example.com', { resolve: publicDns, transport });
    expect(result.pages[0].url).toBe('https://www.example.com/privacy');
    await expect(
      fetchPolicies('https://example.com', {
        resolve: publicDns,
        transport: async () => ({
          status: 302,
          headers: { location: 'http://example.com/privacy' },
          body: '',
        }),
      })
    ).rejects.toMatchObject({ code: 'BLOCKED_REDIRECT' });
  });
  it('stops loops and excessive redirects', async () => {
    await expect(
      fetchPolicies('https://example.com', {
        resolve: publicDns,
        transport: async () => ({ status: 302, headers: { location: '/' }, body: '' }),
      })
    ).rejects.toMatchObject({ code: 'REDIRECT_LOOP' });
    let hops = 0;
    await expect(
      fetchPolicies('https://example.com', {
        resolve: publicDns,
        transport: async () => ({ status: 302, headers: { location: `/hop-${++hops}` }, body: '' }),
      })
    ).rejects.toMatchObject({ code: 'REDIRECT_LIMIT' });
    expect(hops).toBe(4);
  });
  it('reports partial results and never mislabels a guessed homepage as a policy', async () => {
    const result = await fetchPolicies('https://example.com/privacy', {
      resolve: publicDns,
      transport: async (url) =>
        ok(
          url.pathname === '/privacy'
            ? policy('Privacy Policy')
            : '<main>Welcome to our home page!</main>'
        ),
    });
    expect(result.pages).toHaveLength(1);
    expect(result.warnings.join(' ')).toContain('Terms of Service was not found');
  });
  it('does not return full homepage content as a successful policy', async () => {
    await expect(
      fetchPolicies('https://example.com', {
        resolve: publicDns,
        transport: async () => ok('<title>Home</title><main>Welcome!</main>'),
      })
    ).rejects.toMatchObject({ code: 'NO_POLICY' });
  });
  it('enforces byte/request budgets and supports cancellation', async () => {
    await expect(
      fetchPolicies('https://example.com', {
        resolve: publicDns,
        transport: async (_url, _ip, _signal, consume) => {
          consume(LIMITS.totalBytes + 1);
          return ok('x');
        },
      })
    ).rejects.toMatchObject({ code: 'PAGE_TOO_LARGE' });
    const controller = new AbortController();
    controller.abort();
    await expect(
      fetchPolicies('https://example.com', {
        signal: controller.signal,
        resolve: publicDns,
        transport: vi.fn<Transport>(),
      })
    ).rejects.toMatchObject({ code: 'TIMEOUT' });
  });
  it('never silently truncates oversized extracted policy text', async () => {
    await expect(
      fetchPolicies('https://example.com/privacy', {
        resolve: publicDns,
        transport: async () =>
          ok(
            '<title>Privacy Policy</title><main><h1>Privacy Policy</h1><p>' +
              'x'.repeat(100_001) +
              '</p></main>'
          ),
      })
    ).rejects.toMatchObject({ code: 'NO_POLICY' });
  });
});

describe('native bounded HTTP transport (local fixtures, no production safety bypass)', () => {
  let server: Server | undefined;
  afterEach(async () => {
    if (server) {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = undefined;
    }
  });
  async function start(handler: Parameters<typeof createServer>[0]) {
    server = createServer(handler);
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as { port: number }).port;
    // Transport is unit-tested directly; fetchPolicies still refuses this IP and port.
    return new URL(`http://public.example.com:${port}/privacy`);
  }
  const address = { address: '127.0.0.1', family: 4 };
  it('pins the TCP connection and sends no credentials or cookies', async () => {
    let headers: unknown;
    const url = await start((request, response) => {
      headers = request.headers;
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.end(policy('Privacy Policy'));
    });
    const result = await requestHop(url, address, AbortSignal.timeout(2000), () => {});
    expect(result.body).toContain('Privacy Policy');
    expect(headers).toMatchObject({ host: url.host });
    expect(headers).not.toHaveProperty('cookie');
    expect(headers).not.toHaveProperty('authorization');
  });
  it('decodes gzip but rejects compressed bombs beyond the decoded cap', async () => {
    const url = await start((_request, response) => {
      response.writeHead(200, { 'Content-Type': 'text/html', 'Content-Encoding': 'gzip' });
      response.end(gzipSync('x'.repeat(LIMITS.pageBytes + 1)));
    });
    await expect(
      requestHop(url, address, AbortSignal.timeout(2000), () => {})
    ).rejects.toMatchObject({ code: 'PAGE_TOO_LARGE' });
  });
  it('rejects unsupported content and oversized Content-Length', async () => {
    let mode = 'pdf';
    const url = await start((_request, response) => {
      response.writeHead(
        200,
        mode === 'pdf'
          ? { 'Content-Type': 'application/pdf' }
          : { 'Content-Type': 'text/html', 'Content-Length': String(LIMITS.pageBytes + 1) }
      );
      response.end('x');
    });
    await expect(
      requestHop(url, address, AbortSignal.timeout(2000), () => {})
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_CONTENT' });
    mode = 'big';
    await expect(
      requestHop(url, address, AbortSignal.timeout(2000), () => {})
    ).rejects.toMatchObject({ code: 'PAGE_TOO_LARGE' });
  });
  it('manual redirects return no body and streaming chunks obey size limits', async () => {
    let redirect = true;
    const url = await start((_request, response) => {
      if (redirect) {
        response.writeHead(302, { Location: '/next' });
        response.end('not returned');
      } else {
        response.writeHead(200, { 'Content-Type': 'text/html' });
        response.end('x'.repeat(LIMITS.pageBytes + 1));
      }
    });
    expect(await requestHop(url, address, AbortSignal.timeout(2000), () => {})).toMatchObject({
      status: 302,
      body: '',
    });
    redirect = false;
    await expect(
      requestHop(url, address, AbortSignal.timeout(2000), () => {})
    ).rejects.toMatchObject({ code: 'PAGE_TOO_LARGE' });
  });
});

describe('API validation and bounded abuse limits', () => {
  const request = (patch: object = {}) =>
    ({
      method: 'POST',
      headers: {
        host: 'localhost:3000',
        origin: 'http://localhost:3000',
        'content-type': 'application/json',
      },
      body: { url: 'https://example.com' },
      ...patch,
    }) as VercelRequest;
  it('accepts exactly one JSON URL and rejects methods, origin and media mismatches', () => {
    expect(validateRequest(request())).toBe('https://example.com');
    expect(() => validateRequest(request({ method: 'GET' }))).toThrow();
    expect(() => validateRequest(request({ body: { url: 'x', cookies: 'secret' } }))).toThrow();
    expect(() => validateRequest(request({ headers: { 'content-type': 'text/plain' } }))).toThrow();
    expect(() =>
      validateRequest(
        request({
          headers: {
            'content-type': 'application/json',
            origin: 'https://attacker.com',
            host: 'localhost:3000',
          },
        })
      )
    ).toThrow();
    expect(() => validateRequest(request({ body: 'bad json' }))).toThrow();
  });
  it('limits clients and global in-flight requests and recovers after release/window expiry', () => {
    const guard = new RequestGuard();
    for (let i = 0; i < 5; i++) guard.enter('client', 1000)();
    expect(() => guard.enter('client', 1001)).toThrow(/Too many/);
    guard.enter('client', 61_001)();
    const release = ['a', 'b', 'c'].map((key) => guard.enter(key, 61_002));
    expect(() => guard.enter('d', 61_003)).toThrow(/Too many/);
    release.forEach((done) => {
      done();
      done();
    });
    guard.enter('d', 61_004)();
  });
});
