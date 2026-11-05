# Fine Print Decoder

A clean, responsive website that helps people understand potential risks in Terms of Service and Privacy Policies. **Paste Text** stays entirely local. **Website URL** uses an opt-in TypeScript Vercel function to discover public policy pages and extract readable text with Cheerio; risk analysis still runs in the browser.

## Source and deployment

- Source repository: [Kavya-634/fine-print-decoder](https://github.com/Kavya-634/fine-print-decoder).
- Vercel project: `fine-print-decoder` in the `kav-5611` scope, using the repository root as the project root.
- The production Vercel Firewall includes a published rule for `POST /api/fetch-policy`: five requests per IP per 60-second fixed window. This supplements, rather than replaces, the per-instance application limits below.
- Vercel's build command validates unit/server tests and production build/type checks before deployment. Formatting and browser checks remain available locally. No additional GitHub workflow permissions are required. Formatting is not run inside the cloud build because Vercel reserializes its own configuration files before executing the build command.
- Local credentials, environment files, dependencies, generated builds, screenshots/PDFs, and test output are excluded from Git and deployment uploads.

## Run locally

Requires Node 24.12 or later in the Node 24 line, npm, and a Vercel account for the CLI's project-linking step. No application API keys, database, or environment variables are required.

```sh
npm ci
npx vercel login
npm run dev:vercel
```

Open **http://127.0.0.1:3000**. On first use, Vercel may prompt you to choose your scope and create/link a project. Run the command from this folder, not the workspace root. The ignored `.vercel/` directory holds local project metadata. This links a Vercel project but does not deploy the website.

The checked-in [vercel.json](vercel.json) tells Vercel dev to start Vite and serve [api/fetch-policy.ts](api/fetch-policy.ts) at **POST /api/fetch-policy** on the same origin. It also sets a 30-second function ceiling. Keep the Vite `dev` script and `devCommand` separate from `dev:vercel` to avoid recursive Vercel invocations.

For **frontend-only** work, or a static production preview:

```sh
npm run dev:client
# Or:
npm run build
npm run preview
```

Vite alone and `npm run preview` **do not run serverless functions**. Paste mode works there, but URL mode displays a friendly server-unavailable message. Use Vercel dev for end-to-end URL development. Deployment needs the Vercel function as well as the static `dist/` frontend; do not deploy only the static files if you need URL mode. This implementation has not been publicly deployed.

This Designer workstation has a cached Node installation at `$HOME/.cache/designer-node-v24/bin`. If `node` is not on your shell's PATH, prepend that directory before running the commands above.

## Implemented

- **25 documented rules across 12 categories:** data sharing, tracking, ad profiling, auto-renewals, cancellation, arbitration, content licensing, unilateral changes, liability limits, data retention, account termination, and third-party sharing.
- Each rule has a stable ID, category, severity, alternative regex patterns, plain-English title, explanation, and practical tip.
- Findings are grouped by category and sorted by severity, with original excerpts and highlighted matches.
- A 0–100 overall risk gauge with Low, Moderate, or High labels and a visible explanation of the calculation. It is a wording-pattern attention index, never a probability of harm or a guarantee of safety.
- A local **What you're agreeing to** summary of 5–8 distinct, authored implications drawn only from triggered rules. With fewer than five unique matches, show fewer points rather than inventing claims. Each point links to its source.
- Category filter chips plus the existing category dropdown and severity filters labeled **Info / Warning / High**. Filters narrow both findings and document highlights, but never change the overall score, summary, or exports.
- A **Results / Original document** toggle with severity-colored full-clause highlights, exact source spacing, keyboard-focusable clause links, and navigation for every repeated occurrence. Overlapping flags use the highest visible severity.
- Three clearly fictional, one-click decoded samples: **Subscription App**, **Social Network**, and **Free Mobile Game**. The original “Try an example” paste shortcut remains available.
- Clear/reset action, word/character counts, and a 100,000-character limit. Input is never silently truncated.
- A clear warning and disabled export when the input changes after analysis.
- **Copy Summary**, with a selectable-text dialog if clipboard permissions are unavailable, and **Print / Save as PDF** using a dedicated, fully expanded print report. Native browser print can save a PDF; no PDF library is required. Print and text-file reports include all findings regardless of on-screen filters or collapsed sections. Copy Summary includes up to eight implications from the full analysis, score, counts, and methodology.
- Downloadable plain-text reports, including original clauses, rule IDs, score, and summary.
- The explicit disclaimer: **“Not legal advice. This tool flags wording patterns and can miss or misread clauses.”** It appears on-screen and in copied, downloaded, and printed exports.
- A browsable rulebook with the actual matching patterns.
- **Website URL**: enter a site or direct Terms/Privacy URL, fetch and extract up to one page of each type, automatically decode, and inspect final source links. Missing or oversized pages produce explicit incomplete-review warnings, including in copied/printed/downloaded exports. Failed or canceled fetching preserves existing editor text; successful fetching replaces it.
- Responsive desktop, tablet, and phone layouts; semantic tabs with arrow-key/Home/End navigation; native modal focus trapping and Escape dismissal; status announcements; reduced-motion support; severity communicated with text as well as color.

## Privacy and limitations

**Paste mode** and all rule analysis run in the current browser tab, without sending pasted text to a server. **URL mode** explicitly sends only the submitted URL to our same-origin function. That server contacts public websites and returns extracted plain text; the destination sees the server request, not the visitor's cookies/login. Do not submit private, credential-bearing, signed, or token-bearing URLs. Hosting infrastructure may log request metadata and URLs; the application does not deliberately log or persist policy text.

There are no analytics, accounts, document database, cookies, local-storage or session-storage document writes. System fonts and inline graphics avoid third-party browser asset requests. Clear/reload resets the page session; exported files and clipboard text remain wherever you save them. Device software, browser extensions, and hosting logs are outside the app's control. URL-fetching privacy is disclosed before submission, in the FAQ, and in the privacy dialog.

## URL API and safeguards

Request:

```http
POST /api/fetch-policy
Content-Type: application/json

{"url":"https://example.com"}
```

Response: `{ pages: [{ kind: "terms" | "privacy", title, url, text }], warnings: string[] }`. On failure: `{ code, message }` with a suitable HTTP status. Responses use `Cache-Control: no-store` and `nosniff`; stack traces, raw HTML, and internal DNS/network diagnostics are not exposed. No CORS permission is emitted.

### Discovery and extraction

- Fetch the submitted page, inspect anchor labels/paths for Terms and Privacy links, and resolve relative URLs against the fetched URL. HTML `<base>` tags cannot redirect discovery.
- Discovered links must be **same-origin** with the final landing page. The two common fallback paths `/privacy` and `/terms` are tried only when links of that kind are absent. Try one candidate of each kind first and never recursively crawl. Arbitrary external policy-provider links are not auto-discovered; a user can submit the exact public policy URL directly.
- Direct policy-library pages ignore sidebar/global-navigation links to avoid pulling in agreements for unrelated products. Public redirects from requested/discovered links are permitted only after the same safety checks at every hop. HTTPS-to-HTTP downgrade is refused.
- Cheerio removes scripts, styles, embeds, hidden regions, menus, headers, footers, and forms, and prefers `main`, `article`, or a main-role region over the whole body. Paragraphs/headings/list items keep useful line breaks. HTML never executes or renders as HTML in the client.
- Only HTML/XHTML/plain text is supported. JavaScript-only, login-gated, anti-bot, PDF, or image policies may need Paste Text. Sites and legal-page naming vary; extraction is a heuristic and may omit content. A successful fetch does not establish completeness, legality, ownership, or authenticity of an agreement. Users must check source links and all warnings.

### Network protections

- HTTP/HTTPS only, standard ports only, no URL credentials or IP-literal URLs, no local/internal/special-use hostnames, and at most 2,048 URL characters.
- Resolve DNS before **every hop**. Reject the entire answer if any IPv4/IPv6 record is non-public, including loopback, private, link-local/metadata, shared address space, multicast, documentation, and IPv4-mapped/transition IPv6 addresses. IPv6 is conservatively restricted to ordinary global unicast ranges.
- Pin the connection's DNS lookup to the validated address, preserving the original Host header, TLS SNI, and normal certificate validation. This prevents a second DNS lookup from rebinding to a private address. Connections are not pooled across untrusted targets.
- Manual redirects, no browser `fetch` auto-following, and no user headers/cookies/authorization forwarded. Redirect destinations repeat protocol, port, credential, DNS, and address checks. Loops and insecure downgrades fail closed.
- **18 seconds** total; **6 seconds** per network hop including its DNS phase; DNS resolves within **2 seconds**. The browser independently cancels after **25 seconds** and supports Cancel or switching to Paste Text. Server work is aborted when its response connection closes.
- At most **8 outbound requests**, including redirects; at most **3 redirects per page**; at most **4 candidate pages**; no scripts/assets/forms fetched.
- At most **1,000,000 bytes** per page both on the wire and after decompression; **3,000,000 wire bytes** across a job; bounded response headers. Gzip/deflate/Brotli are supported with a decoded-size cap to stop compression bombs. At most **95,000 extracted text characters** across accepted policies, leaving room for source headings within the existing 100,000-character analysis limit. Oversized policies are rejected or skipped with a warning, never silently truncated.
- API accepts only POST JSON with exactly one string `url`, with a **4,096-byte application payload cap**, plus same-origin/Fetch Metadata checks for browser requests. Vercel's own platform limit applies before its JSON parser; application checks are not a streaming pre-parser limit.

### Request limiting and production caveat

An in-memory, bounded limiter allows **5 requests per client per minute**, **30 requests per warm function instance per minute**, and **3 concurrent jobs per instance**. Counters keep hashed client identifiers, expire in one minute, cap at 2,000 entries, and are not persisted. On Vercel production/preview, use only Vercel's overwritten forwarding header; locally use the socket address, never arbitrary `X-Forwarded-For`. Rejected requests count toward the limit, and busy responses return **429 + Retry-After: 60**.

**These counters are deliberately best-effort, per warm instance, not fleet-wide.** Cold starts, multiple instances, and Vercel dev reloads can reset or split them. Origin checks are browser hygiene, not authentication against direct clients. No claim of globally enforceable abuse protection is made without an edge policy.

**Before exposing this endpoint publicly**, add a **Vercel Firewall rate-limit rule** in the project's dashboard targeting `POST /api/fetch-policy` (start at 5 requests per IP per 60 seconds, then tune for shared networks), with block/challenge action and appropriate spend/usage alerts. Use Vercel's platform IP identity and consider a broader endpoint traffic ceiling. Dashboard availability/settings depend on the Vercel plan; if an enforceable edge rule is unavailable, keep URL mode private or add shared enforcement before public launch. This avoids adding a database or API-key dependency to the app while honestly documenting the deployment boundary.

The endpoint is for user-requested public policy reading, not an unrestricted proxy: it returns only bounded, extracted policy text and sends fixed GET requests. Operators remain responsible for site permissions, applicable terms, and responsible request volume.

This is an **English-language heuristic review**, not AI, legal advice, a safety certification, or a complete policy audit. Severity indicates attention, not illegality or enforceability. Rules detect bounded phrases within sentences or newline-delimited clauses; unusual wording, long line wraps, and cross-sentence context can be missed. Nearby explicit denials are filtered, but nuanced exceptions and legal interpretation still require a person. No matches does **not** mean a policy is safe. Content licenses and service-provider sharing may be necessary for legitimate functionality, which the explanations explicitly acknowledge.

When adding a rule, extend both positive and negative fixtures. Render policy text as text, never as HTML.

### How the risk score works

Each clause-level rule hit contributes **High: 12**, **Warning: 6**, or **Info: 2** points. Hits are totaled by rule ID, including repeated identical clauses, with **at most three counted hits per rule**. The total is capped at **100**. Labels are **Low: 0–24**, **Moderate: 25–59**, and **High: 60–100**. A sentence matching two different rules counts once for each rule. Several regex alternatives matching the same rule in one sentence count only once. Repeating one phrase inside a sentence does not create extra clause-level hits.

These editorial thresholds are transparent heuristics, not a calibrated legal or statistical measure. A score of zero says only that no rules matched. The gauge always uses the entire analyzed snapshot, never the current filters. Editing the input leaves an explicitly stale snapshot until it is reanalyzed; exports are disabled in the meantime. Browser Print invoked directly also shows an update warning rather than a stale report.

## Key files

- [src/lib/rules.ts](src/lib/rules.ts): all 25 typed, documented rules.
- [src/lib/analyze.ts](src/lib/analyze.ts): sentence segmentation, matching, limited negation handling, source offsets, deduplication, grouping, and severity counts.
- [src/lib/review.ts](src/lib/review.ts): score weights/thresholds, authored agreement points, original-document segmentation, shared disclaimer, and text summary export.
- [src/lib/sample.ts](src/lib/sample.ts): the three fictional policies.
- [src/App.svelte](src/App.svelte): paste workflow, tabs, results, filters, export, and transparency dialogs.
- [src/styles.css](src/styles.css): responsive interface and accessibility styling.
- [src/review.css](src/review.css): gauge, samples, agreement summary, chips, and source-navigation styling.
- [src/print.css](src/print.css): dedicated print layout, pagination, expanded source excerpts, and hidden interactive UI.
- [src/components/OriginalDocument.svelte](src/components/OriginalDocument.svelte): original snapshot and per-occurrence flag navigation.
- [src/components/RiskGauge.svelte](src/components/RiskGauge.svelte): visual gauge with accessible numeric meter semantics.
- [src/components/PrintReport.svelte](src/components/PrintReport.svelte): complete print-only report, independent of screen filters.
- [src/components/WebsiteInput.svelte](src/components/WebsiteInput.svelte): URL submission, timeout/cancel, privacy disclosure, and Paste Text fallback.
- [api/fetch-policy.ts](api/fetch-policy.ts): TypeScript Vercel handler.
- [server/policy-fetcher.ts](server/policy-fetcher.ts): public-URL/DNS checks, pinned transport, bounded discovery, and Cheerio extraction.
- [server/request-guard.ts](server/request-guard.ts): request schema/origin checks and bounded in-memory abuse guard.
- [vercel.json](vercel.json): Vercel build/dev/function configuration.
- [tests/analyze.test.ts](tests/analyze.test.ts): scanner regression tests.
- [tests/review.test.ts](tests/review.test.ts): scoring boundaries/caps, source segments, samples, summaries, and exports.
- [tests/browser/decoder.spec.ts](tests/browser/decoder.spec.ts): interaction, privacy, responsive layout, injection, and accessibility tests.
- [tests/browser/review.spec.ts](tests/browser/review.spec.ts): new review workflows, source navigation, clipboard success/fallback, print CSS, and responsive accessibility checks.
- [tests/policy-fetcher.test.ts](tests/policy-fetcher.test.ts): SSRF, DNS rebinding, redirect, extraction, compression-bomb, resource-limit, and abuse tests.
- [tests/fetch-policy-api.test.ts](tests/fetch-policy-api.test.ts): handler schema, headers, safe errors, cancellation, and limiter tests.
- [tests/browser/website.spec.ts](tests/browser/website.spec.ts): URL loading, source warnings/exports, failure/fallback, timeout/cancel, and accessible responsive forms.
- [scripts/smoke-vercel.mjs](scripts/smoke-vercel.mjs): opt-in checks against the actual Vercel dev route.

## Validation

```sh
npm run check
npm run test
npm run build
npm run test:e2e
npm run format:check
# Or run the unit/build/browser suite together:
npm run test:all
```

Browser tests use an installed Google Chrome through Playwright and start an isolated Vite server on port 5180. Install Chrome with `npx playwright install chrome` if unavailable. Tests save visual captures under `artifacts/screenshots/`.

Unit tests use mocked DNS/public fixtures and direct local transport fixtures; there is **no production allow-private-network bypass**. Browser URL tests mock the API to stay deterministic and avoid crawling real sites on every test run. Server code has a separate TypeScript check.

With Vercel dev already running, verify the actual route:

```sh
npm run test:api
# Optional: explicitly test a real public page as well.
POLICY_LIVE_URL=https://www.python.org/privacy/ npm run test:api
```

Use a fresh dev process or wait a minute if you have exhausted the best-effort local rate limit. The smoke test does not assume that separate Vercel dev invocations share counters; deterministic guard tests verify rate behavior. A real public policy fetch was exercised during implementation, including a public redirect, plain-text extraction, and an explicit missing-Terms warning. External websites can change or block readers later.

Verified during implementation:

- **159 unit/server tests passed**, including all previous scanner/score/summary/source tests, 77 fetcher/guard tests, and 5 Vercel-handler tests. New coverage exercises URL encodings, public/private IPv4/IPv6, mixed DNS, DNS pinning/rebinding, timeouts, redirect loops/downgrades, discovery, unsupported/oversized/compressed responses, origin/schema checks, safe errors, and request-limit behavior.
- **31 browser tests passed** in Chrome, including all existing paste/review/export flows and 11 URL tests covering opt-in submission without uploading paste text, source provenance/warnings, clipboard/print metadata, server/network/rate/timeout errors, cancellation, fallback, and responsive accessibility. Paste-mode analysis still makes no network requests or document-storage writes.
- Responsive layout checked at **375, 768, and 1440 px** without horizontal overflow.
- Axe WCAG 2 A/AA and 2.1 A/AA checks passed on the initial, URL, findings, original document, and rulebook views, including responsive results/document checks. Automated checks are not a substitute for a full manual accessibility audit.
- Browser-generated PDF output was visually inspected for the score, disclaimer, agreement points, complete findings, and legible pagination.
- Svelte/TypeScript check: **0 errors, 0 warnings**. Production Vite build passed.
- Actual Vercel-dev API smoke checks passed, including a live public privacy-page redirect/extraction. A browser-driven URL-to-results check on that dev server completed with no browser errors.

### Dependency audit note

The added Vercel CLI/build toolchain currently has transitive development-only audit findings, including high-severity advisories. The full audit is **not clean**; do not expose Vercel dev or Vite publicly, process untrusted projects with it, or treat dependency hygiene as complete. Compatible patches were applied, with targeted overrides for `tar` 7.5.22+ and `@fastify/busboy` 3.2.4+ to remove the reported critical archive-parser finding and multipart-parser findings. Other upstream build-tool findings remain; monitor updates rather than blindly forcing major dependency upgrades. Run both `npm audit` and `npm audit --omit=dev` when updating. No production dependency findings were reported for the app's Cheerio/IP-validation dependency tree at implementation time; platform build/runtime code has its own patching responsibilities.

## Deliberately out of scope for this release

PDF/file ingestion, JavaScript/headless-browser rendering, login bypasses, arbitrary multi-site crawling, legal jurisdiction analysis, persistent history, user accounts, safety certification, server-side risk analysis, and LLM processing.
