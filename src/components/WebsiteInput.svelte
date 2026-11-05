<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import Icon from './Icon.svelte';
  import type { PolicyResult } from '../../server/policy-fetcher';

  let {
    active,
    onloaded,
    onbusy,
    onpaste,
  }: {
    active: boolean;
    onloaded: (result: PolicyResult) => Promise<void>;
    onbusy: (value: boolean) => void;
    onpaste: () => void;
  } = $props();
  let url = $state('');
  let loading = $state(false);
  let message = $state('');
  let controller: AbortController | undefined;
  let timedOut = false;
  let errorHeading = $state<HTMLParagraphElement>();

  function cancel(showMessage = true) {
    controller?.abort();
    if (showMessage) message = 'Website loading canceled. Your previous text is unchanged.';
  }
  $effect(() => {
    if (!active) cancel(false);
  });
  onDestroy(() => controller?.abort());

  async function load() {
    if (loading) return;
    message = '';
    let normalized: URL;
    try {
      normalized = new URL(/^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`);
      if (
        !['http:', 'https:'].includes(normalized.protocol) ||
        normalized.username ||
        normalized.password ||
        !normalized.hostname.includes('.')
      )
        throw new Error('URL');
    } catch {
      message = 'Enter a public website address, such as https://example.com.';
      return;
    }
    loading = true;
    onbusy(true);
    timedOut = false;
    const current = new AbortController();
    controller = current;
    const timer = setTimeout(() => {
      timedOut = true;
      current.abort();
    }, 25_000);
    try {
      const response = await fetch('/api/fetch-policy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: normalized.href }),
        signal: current.signal,
      });
      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.includes('application/json'))
        throw new Error(
          'Website loading isn’t available on this server. Run Vercel dev locally, or use Paste Text.'
        );
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 429)
          throw new Error(
            'Too many website requests. Wait a minute, or use Paste Text without waiting.'
          );
        throw new Error(
          typeof result.message === 'string'
            ? result.message.slice(0, 500)
            : 'That website could not be loaded. Try a direct policy link or use Paste Text.'
        );
      }
      if (
        !Array.isArray(result.pages) ||
        !result.pages.length ||
        result.pages.length > 2 ||
        !Array.isArray(result.warnings) ||
        result.warnings.some((warning: unknown) => typeof warning !== 'string') ||
        result.pages.some(
          (page: PolicyResult['pages'][number]) =>
            !page ||
            !['terms', 'privacy'].includes(page.kind) ||
            typeof page.title !== 'string' ||
            typeof page.text !== 'string' ||
            typeof page.url !== 'string' ||
            !/^https?:\/\//i.test(page.url)
        ) ||
        result.pages.reduce(
          (sum: number, page: PolicyResult['pages'][number]) => sum + page.text.length,
          0
        ) > 100_000
      )
        throw new Error(
          'The server returned an unreadable policy response. Please use Paste Text.'
        );
      if (current.signal.aborted) return;
      // Network phase finishes before local decoding starts. No uploaded text.
      onbusy(false);
      await onloaded(result as PolicyResult);
    } catch (error) {
      if (current.signal.aborted) {
        if (timedOut)
          message =
            'The website took too long to load. Try a direct policy link or switch to Paste Text.';
      } else
        message =
          error instanceof Error && error.message !== 'Failed to fetch'
            ? error.message
            : 'We couldn’t reach the policy reader. Check your connection, run Vercel dev locally, or use Paste Text.';
      await tick();
      if (active) errorHeading?.focus();
    } finally {
      clearTimeout(timer);
      loading = false;
      controller = undefined;
      onbusy(false);
    }
  }
</script>

<form
  class="website-form"
  onsubmit={(event) => {
    event.preventDefault();
    void load();
  }}
  aria-busy={loading}
>
  <span class="url-icon"><Icon name="globe" size={30} /></span>
  <span class="small-caps">PUBLIC POLICIES, PLAIN ENGLISH</span>
  <h2>One link. A little more clarity.</h2>
  <p>
    Enter a website or a direct policy link. We’ll look for its Terms of Service and Privacy Policy.
  </p>
  <label for="website-url">Website address</label>
  <div class="website-field">
    <Icon name="link" size={17} /><input
      id="website-url"
      type="text"
      inputmode="url"
      autocomplete="url"
      spellcheck="false"
      maxlength="2048"
      bind:value={url}
      disabled={loading}
      placeholder="https://example.com"
      aria-describedby="url-privacy url-error"
      aria-invalid={!!message}
    />
  </div>
  <p id="url-privacy" class="website-privacy">
    <Icon name="info" size={13} />URL mode sends this address to our server to fetch public pages.
    Rule analysis still runs in your browser. Don’t submit private or token-bearing links.
  </p>
  {#if message}<div class="website-error" role="alert">
      <p id="url-error" tabindex="-1" bind:this={errorHeading}>{message}</p>
      <button type="button" class="text-button" onclick={onpaste}
        >Use Paste Text instead <Icon name="arrow" size={14} /></button
      >
    </div>{:else}<span id="url-error"></span>{/if}
  <button class="primary-button" type="submit" disabled={loading || !url.trim()}
    >{#if loading}<span class="spinner"></span>Finding policy pages…{:else}<Icon
        name="search"
        size={17}
      />Find & decode policies<Icon name="arrow" size={16} />{/if}</button
  >
  {#if loading}<button type="button" class="text-button cancel-fetch" onclick={() => cancel()}
      >Cancel loading</button
    >{/if}
  <button type="button" class="text-button paste-fallback" onclick={onpaste}
    >Prefer not to send a URL? Use Paste Text <Icon name="arrow" size={14} /></button
  >
  <p class="website-footnote">
    Public HTML/text only. No login, scripts, or PDFs. A successful fetch replaces the editor text;
    errors leave it unchanged.
  </p>
</form>
