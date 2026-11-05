<script lang="ts">
  import { tick } from 'svelte';
  import Icon from './components/Icon.svelte';
  import RiskGauge from './components/RiskGauge.svelte';
  import OriginalDocument from './components/OriginalDocument.svelte';
  import PrintReport from './components/PrintReport.svelte';
  import WebsiteInput from './components/WebsiteInput.svelte';
  import type { PolicyResult } from '../server/policy-fetcher';
  import {
    analyzePolicy,
    groupFindings,
    MAX_CHARACTERS,
    severityLabel,
    type Analysis,
    type Finding,
  } from './lib/analyze';
  import { rules, type Severity, type RiskCategory } from './lib/rules';
  import { samplePolicy, samplePolicies } from './lib/sample';
  import { buildSummary, summarizeAgreement, LEGAL_DISCLAIMER } from './lib/review';
  import './styles.css';
  import './review.css';
  import './print.css';
  import './website.css';

  // Paste text and all rule analysis remain local. URL fetching is opt-in and
  // sends only the submitted URL to the Vercel endpoint, never the paste buffer.
  let mode = $state<'paste' | 'url'>('paste');
  let text = $state('');
  let analyzedText = $state('');
  let analysis = $state<Analysis | null>(null);
  let busy = $state(false);
  let urlBusy = $state(false);
  let imported = $state<PolicyResult | null>(null);
  let importedText = '';
  let error = $state('');
  let announcement = $state('');
  let severity = $state<Severity | 'all'>('all');
  let category = $state<RiskCategory | 'all'>('all');
  let resultView = $state<'findings' | 'original'>('findings');
  let selectedFinding = $state('');
  let copyStatus = $state('');
  let copying = $state(false);
  let manualCopy = $state('');
  let manualCopyDialog: HTMLDialogElement;
  let manualCopyField: HTMLTextAreaElement;
  let textarea: HTMLTextAreaElement;
  let resultsHeading = $state<HTMLHeadingElement>();
  let rulebook: HTMLDialogElement;
  let privacy: HTMLDialogElement;

  const severities: Severity[] = ['high', 'medium', 'low'];
  const ruleGroups = groupFindings(
    rules.map((rule) => ({
      id: rule.id,
      rule,
      clause: '',
      start: 0,
      end: 0,
      matchStart: 0,
      matchEnd: 0,
      occurrences: 1,
      locations: [],
    }))
  );
  const stale = $derived(analysis !== null && text !== analyzedText);
  const tooLong = $derived(text.length > MAX_CHARACTERS);
  const wordCount = $derived(text.trim() ? text.trim().split(/\s+/u).length : 0);
  const filtered = $derived(
    analysis?.findings.filter(
      (finding) =>
        (severity === 'all' || finding.rule.severity === severity) &&
        (category === 'all' || finding.rule.category === category)
    ) ?? []
  );
  const groups = $derived(groupFindings(filtered));
  const agreement = $derived(summarizeAgreement(analysis?.findings ?? []));
  const categoryNames = $derived([
    ...new Set(analysis?.findings.map((finding) => finding.rule.category) ?? []),
  ]);
  const formatted = (number: number) => number.toLocaleString('en-US');

  function setMode(next: 'paste' | 'url') {
    mode = next;
  }
  function tabKey(event: KeyboardEvent) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    mode =
      event.key === 'Home'
        ? 'paste'
        : event.key === 'End'
          ? 'url'
          : mode === 'paste'
            ? 'url'
            : 'paste';
    document.getElementById(`tab-${mode}`)?.focus();
  }

  async function loadExample() {
    if (urlBusy) return;
    mode = 'paste';
    text = samplePolicy;
    analysis = null;
    error = '';
    copyStatus = '';
    imported = null;
    announcement = 'Fictional example loaded. Choose Decode the fine print to analyze it.';
    await tick();
    textarea.focus();
  }

  async function loadSample(id: string) {
    const sample = samplePolicies.find((item) => item.id === id);
    if (!sample || busy || urlBusy) return;
    mode = 'paste';
    text = sample.text;
    imported = null;
    await decode();
    await tick();
    resultsHeading?.scrollIntoView({ behavior: 'instant', block: 'start' });
  }

  function clearText() {
    if (urlBusy) return;
    text = '';
    analyzedText = '';
    analysis = null;
    imported = null;
    error = '';
    severity = 'all';
    category = 'all';
    resultView = 'findings';
    selectedFinding = '';
    copyStatus = '';
    announcement = 'Text and analysis cleared.';
    textarea.focus();
  }

  async function decode() {
    if (busy || urlBusy) return;
    error = '';
    if (!text.trim()) {
      error = 'Paste some policy text to get started.';
      textarea.focus();
      return;
    }
    if (tooLong) {
      error = 'Please split this policy into sections of 100,000 characters or fewer.';
      return;
    }
    busy = true;
    copyStatus = '';
    announcement = 'Checking the text against 25 rules, in your browser.';
    const snapshot = text;
    // Yield for the pending state to paint; no artificial multi-second delay.
    await new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
    try {
      if (imported && snapshot !== importedText) imported = null;
      analysis = analyzePolicy(snapshot);
      analyzedText = snapshot;
      severity = 'all';
      category = 'all';
      resultView = 'findings';
      selectedFinding = '';
      announcement = `${analysis.findings.length} potential red flags found across ${analysis.categories} categories.`;
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Something went wrong. Please try again.';
    } finally {
      busy = false;
    }
    await tick();
    if (analysis && !error) resultsHeading?.focus({ preventScroll: true });
  }

  async function backToPaste() {
    mode = 'paste';
    await tick();
    textarea.focus();
  }

  async function acceptPolicies(result: PolicyResult) {
    const combined = result.pages
      .map(
        (page) =>
          `${page.kind === 'terms' ? 'TERMS OF SERVICE' : 'PRIVACY POLICY'} — ${page.title}\nSource: ${page.url}\n\n${page.text}`
      )
      .join('\n\n────────────────────────\n\n');
    if (combined.length > MAX_CHARACTERS)
      throw new Error(
        'The combined policies are too long to analyze at once. Please use Paste Text in smaller sections.'
      );
    imported = result;
    importedText = combined;
    text = combined;
    await decode();
    await tick();
    resultsHeading?.scrollIntoView({ behavior: 'instant', block: 'start' });
  }

  function downloadReport() {
    if (!analysis || stale) return;
    const report = [
      fullSummary(),
      ...groupFindings(analysis.findings).flatMap((group) => [
        `\n${group.category.toUpperCase()}`,
        ...group.findings.map(
          (finding) =>
            `\n[${severityLabel[finding.rule.severity]}] ${finding.rule.title}\nRule: ${finding.rule.id}\nOriginal clause: ${finding.clause}\nPlain English: ${finding.rule.explanation}\nPractical tip: ${finding.rule.tip}`
        ),
      ]),
    ].join('\n');
    const url = URL.createObjectURL(new Blob([report], { type: 'text/plain;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'fine-print-review.txt';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    announcement = 'Report downloaded. It includes original clauses; store it with care.';
  }

  function fullSummary() {
    if (!analysis) return '';
    return [
      buildSummary(analysis),
      ...(imported
        ? [
            '\nWEBSITE SOURCES (extraction can omit content)',
            ...imported.pages.map((page) => `${page.kind}: ${page.url}`),
            ...imported.warnings.map((warning) => `Note: ${warning}`),
          ]
        : []),
    ].join('\n');
  }

  async function copySummary() {
    if (!analysis || stale || busy || copying) return;
    const summary = fullSummary();
    copying = true;
    copyStatus = '';
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(summary);
      copyStatus = 'Summary copied from the full analysis. Filters do not change it.';
    } catch {
      // Clipboard permissions and insecure contexts can block writes. Offer a
      // visible, selectable summary rather than falsely reporting success.
      manualCopy = summary;
      manualCopyDialog.showModal();
      await tick();
      manualCopyField.focus();
      manualCopyField.select();
      copyStatus = 'Clipboard access was blocked. Select and copy the summary in the dialog.';
    } finally {
      copying = false;
    }
    announcement = copyStatus;
  }

  function printReport() {
    if (!analysis || stale || busy) return;
    // A separate, always-expanded print report is independent of filters and
    // the selected results/document view; native browser Print can save a PDF.
    window.print();
  }

  async function showClause(finding: Finding, start = finding.start) {
    resultView = 'original';
    selectedFinding = finding.id;
    await tick();
    const clause = document.getElementById(`clause-${start}`);
    clause?.focus({ preventScroll: true });
    clause?.scrollIntoView({
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
      block: 'center',
    });
    announcement = `Original clause for ${finding.rule.title}. ${severityLabel[finding.rule.severity]} severity.`;
  }

  function resultTabKey(event: KeyboardEvent) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    resultView =
      event.key === 'Home'
        ? 'findings'
        : event.key === 'End'
          ? 'original'
          : resultView === 'findings'
            ? 'original'
            : 'findings';
    document.getElementById(`view-${resultView}`)?.focus();
  }

  function chooseCategory(next: RiskCategory) {
    category = next;
    severity = 'all';
    document.getElementById('results')?.scrollIntoView({
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
      block: 'start',
    });
  }
</script>

<svelte:head><title>Fine Print Decoder — Read between the lines.</title></svelte:head>

<a class="skip-link" href="#decoder">Skip to decoder</a>
<header class="site-header" id="top">
  <div class="header-inner">
    <a class="brand" href="#top">
      <span class="brand-mark"><Icon name="document" size={23} /></span>
      <span
        >fine print <span class="brand-secondary">decoder</span><span class="brand-dot">.</span
        ></span
      >
    </a>
    <nav aria-label="Main navigation">
      <a href="#how-it-works">How it works</a>
      <button class="nav-rulebook" onclick={() => rulebook.showModal()}
        >The rulebook <Icon name="external" size={14} /></button
      >
      <span class="header-privacy"><Icon name="shield" size={15} /> Private by design</span>
    </nav>
  </div>
</header>

<main>
  <section class="hero" aria-labelledby="hero-title">
    <div class="eyebrow">
      <span class="tiny-spark"><Icon name="sparkles" size={14} /></span> A little clarity. A lot more
      control.
    </div>
    <h1 id="hero-title">Know what you’re<br /><span>really agreeing to.</span></h1>
    <p class="hero-description">
      The fine print shouldn’t be a mystery. Uncover potential red flags<br class="desktop-break" /> in
      Terms of Service and Privacy Policies — in plain English.
    </p>
    <div class="hero-trust">
      <span><Icon name="lock" size={14} /> No uploads</span><i></i><span>No sign-up</span><i
      ></i><span>No legal jargon</span>
    </div>
  </section>

  <section id="decoder" class="workspace" aria-label="Policy decoder">
    <div class="input-card card">
      <div class="mode-tabs" role="tablist" aria-label="Input method">
        <button
          id="tab-paste"
          class:active={mode === 'paste'}
          role="tab"
          aria-selected={mode === 'paste'}
          aria-controls="panel-paste"
          tabindex={mode === 'paste' ? 0 : -1}
          onclick={() => setMode('paste')}
          onkeydown={tabKey}><Icon name="document" size={17} /> Paste Text</button
        >
        <button
          id="tab-url"
          class:active={mode === 'url'}
          role="tab"
          aria-selected={mode === 'url'}
          aria-controls="panel-url"
          tabindex={mode === 'url' ? 0 : -1}
          onclick={() => setMode('url')}
          onkeydown={tabKey}><Icon name="link" size={17} /> Website URL</button
        >
      </div>
      <div id="panel-paste" role="tabpanel" aria-labelledby="tab-paste" hidden={mode !== 'paste'}>
        <form
          class="paste-form"
          onsubmit={(event) => {
            event.preventDefault();
            void decode();
          }}
        >
          <div class="input-title">
            <div>
              <h2>Let’s read between the lines.</h2>
              <p>Paste a policy. We’ll help you spot what matters.</p>
            </div>
            <span class="step-number">01</span>
          </div>
          <div class="field-header">
            <label for="policy-text">Your policy text</label><span>English-language policies</span>
          </div>
          <div class="textarea-wrap" class:invalid={tooLong}>
            <textarea
              id="policy-text"
              bind:this={textarea}
              bind:value={text}
              disabled={busy || urlBusy}
              aria-describedby="input-help input-error"
              aria-invalid={!!error || tooLong}
              spellcheck="false"
              placeholder="Paste Terms of Service or a Privacy Policy here…&#10;&#10;You know, the part we all usually skip."
              oninput={() => {
                error = '';
              }}
              onkeydown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                  event.preventDefault();
                  void decode();
                }
              }}></textarea>
            <div class="textarea-footer">
              <span
                >{formatted(wordCount)}
                {wordCount === 1 ? 'word' : 'words'} <span class="count-separator">·</span>
                <span class:over-limit={tooLong}>{formatted(text.length)} / 100,000 characters</span
                ></span
              >{#if text}<button
                  type="button"
                  class="clear-button"
                  disabled={busy || urlBusy}
                  onclick={clearText}><Icon name="x" size={13} /> Clear</button
                >{/if}
            </div>
          </div>
          <div id="input-error" class="error-message" role="alert">
            {error ||
              (tooLong ? 'This policy is too long. Please analyze it in smaller sections.' : '')}
          </div>
          <button
            class="primary-button decode-button"
            disabled={busy || urlBusy || !text.trim() || tooLong}
            type="submit"
            >{#if busy}<span class="spinner"></span> Decoding locally…{:else}<Icon
                name="sparkles"
                size={18}
              />
              {stale ? 'Decode updated text' : 'Decode the fine print'}
              <Icon name="arrow" size={17} />{/if}</button
          >
          <p id="input-help" class="local-note">
            <Icon name="lock" size={12} /> Your text stays in this browser. Always.
          </p>
        </form>
        <div class="sample-row">
          <span>Just exploring?</span><button
            class="text-button"
            onclick={loadExample}
            disabled={busy || urlBusy}>Try an example <Icon name="arrow" size={14} /></button
          >
        </div>
        <div class="sample-library" aria-label="Fictional sample policies">
          <span class="small-caps">FICTIONAL POLICIES · CLICK TO DECODE</span>
          <div>
            {#each samplePolicies as sample}<button
                class="sample-chip"
                disabled={busy || urlBusy}
                onclick={() => loadSample(sample.id)}
                ><Icon
                  name={sample.id === 'subscription'
                    ? 'refresh'
                    : sample.id === 'social'
                      ? 'users'
                      : 'sparkles'}
                  size={14}
                />{sample.name}</button
              >{/each}
          </div>
        </div>
      </div>
      <div
        id="panel-url"
        role="tabpanel"
        aria-labelledby="tab-url"
        hidden={mode !== 'url'}
        class="website-panel"
      >
        <WebsiteInput
          active={mode === 'url'}
          onloaded={acceptPolicies}
          onbusy={(value) => (urlBusy = value)}
          onpaste={backToPaste}
        />
      </div>
    </div>

    <aside class="preview-card card" aria-label="Analysis overview">
      <div class="preview-topline">
        <span class="small-caps">YOUR CLARITY CORNER</span><span class="local-badge"
          ><span></span> On-device analysis</span
        >
      </div>
      {#if !analysis}
        <div class="empty-preview">
          <div class="document-art" aria-hidden="true">
            <div class="orbit orbit-one"></div>
            <div class="orbit orbit-two"></div>
            <div class="art-dot art-dot-one"></div>
            <div class="art-dot art-dot-two"></div>
            <div class="art-document">
              <div class="art-fold"></div>
              <div class="art-title"></div>
              <div class="art-line long"></div>
              <div class="art-line"></div>
              <div class="art-highlight coral"><span></span><i></i></div>
              <div class="art-line long"></div>
              <div class="art-highlight gold"><span></span><i></i></div>
              <div class="art-line short"></div>
              <div class="art-stamp"><Icon name="check" size={13} /></div>
            </div>
            <div class="art-search"><Icon name="search" size={31} stroke={1.8} /></div>
            <div class="art-spark"><Icon name="sparkles" size={18} /></div>
          </div>
          <h2>Less legalese.<br /> More peace of mind.</h2>
          <p>
            Your analysis will appear here.<br />We’ll flag the details worth a second look<br
              class="desktop-break"
            /> and explain what they could mean for you.
          </p>
          <div class="empty-steps">
            <span><Icon name="check" size={13} /> Real excerpts</span><span
              ><Icon name="check" size={13} /> Practical tips</span
            >
          </div>
        </div>
        <div class="severity-key">
          <span class="severity high"><i></i> High</span><span class="severity medium"
            ><i></i> Warning</span
          ><span class="severity low"><i></i> Info</span>
        </div>
      {:else}
        <div class="summary-content" class:is-stale={stale}>
          <span class="analysis-status"
            ><Icon name={stale ? 'refresh' : 'check'} size={15} />
            {stale ? 'Text changed · update needed' : 'Your review is ready'}</span
          >
          <RiskGauge findings={analysis.findings} />
          <p class="summary-description">
            {#if analysis.findings.length}A few things to understand before you agree.{:else}No
              patterns matched. That’s not a guarantee of safety — review the full policy too.{/if}
          </p>
          <div class="summary-counts">
            {#each severities as item}<div class={item}>
                <strong>{analysis.counts[item]}</strong><span><i></i>{severityLabel[item]}</span>
              </div>{/each}
          </div>
          {#if categoryNames.length}<div class="category-preview">
              <span class="small-caps">FOUND ACROSS {analysis.categories} CATEGORIES</span>
              <div>
                {#each categoryNames as item}<button onclick={() => chooseCategory(item)}
                    >{item}<Icon name="arrow" size={12} /></button
                  >{/each}
              </div>
            </div>{/if}
          <a class="summary-link" href="#results"
            >Read the full breakdown <Icon name="arrow" size={16} /></a
          >
        </div>
        <div class="summary-footer">
          <Icon name="shield" size={15} /><span
            >{formatted(analysis.wordCount)} words checked against {rules.length} rules.<br />A
            starting point, not a legal verdict.</span
          >
        </div>
      {/if}
    </aside>
  </section>

  <div class="disclaimer">
    <Icon name="info" size={15} />
    <p>{LEGAL_DISCLAIMER}</p>
  </div>

  {#if analysis}
    <section id="results" class="results-section" aria-label="Detected red flags" aria-busy={busy}>
      <div class="results-heading">
        <div>
          <span class="small-caps">THE FINE PRINT, DECODED</span>
          <h2 tabindex="-1" bind:this={resultsHeading}>
            Here’s what deserves a closer look<span class="brand-dot">.</span>
          </h2>
          <p>Grouped by category. Grounded in the text you provided.</p>
        </div>
      </div>
      <div class="export-actions" aria-label="Export full analysis">
        <button class="secondary-button" onclick={copySummary} disabled={stale || busy || copying}
          ><Icon name="copy" size={16} />{copying ? 'Copying…' : 'Copy Summary'}</button
        >
        <button class="secondary-button" onclick={printReport} disabled={stale || busy}
          ><Icon name="print" size={16} />Print / Save as PDF</button
        >
        <button class="secondary-button" onclick={downloadReport} disabled={stale || busy}
          ><Icon name="download" size={16} />Save report</button
        >
        <span>Exports use the full analysis, not current filters.</span>
      </div>
      {#if copyStatus}<p class="copy-status" role="status">{copyStatus}</p>{/if}
      {#if stale}<div class="stale-banner" role="status">
          <Icon name="refresh" size={18} />
          <p>You’ve changed the text. These findings are from the previous version.</p>
          <button class="text-button" onclick={decode}
            >Update analysis <Icon name="arrow" size={14} /></button
          >
        </div>{/if}
      {#if imported}<section class="policy-sources" aria-label="Imported policy sources">
          <h3><Icon name="link" size={15} />Website sources</h3>
          <p>
            Only these extracted pages were analyzed. Extraction may omit content; check the
            originals.
          </p>
          <ul>
            {#each imported.pages as page}<li>
                <span>{page.kind === 'terms' ? 'Terms of Service' : 'Privacy Policy'}</span><a
                  href={page.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  >{page.title}<Icon name="external" size={12} /><span class="sr-only">
                    (opens a new tab)</span
                  ></a
                >
              </li>{/each}
          </ul>
          {#each imported.warnings as warning}<p class="source-warning">
              <Icon name="info" size={14} />{warning}
            </p>{/each}
        </section>{/if}
      <section class="agreement-card card" aria-labelledby="agreement-title">
        <div class="agreement-heading">
          <span class="agreement-icon"><Icon name="check" size={20} /></span>
          <div>
            <h3 id="agreement-title">What you're agreeing to</h3>
            <p>
              Potential implications of matched wording — not a definitive reading of the contract.
            </p>
          </div>
        </div>
        {#if agreement.length}
          <ul class="agreement-points">
            {#each agreement as point}<li>
                <button
                  onclick={() => {
                    category = 'all';
                    severity = 'all';
                    void showClause(point.finding);
                  }}
                  >{point.text}<Icon name="arrow" size={14} /><span class="sr-only">
                    View original clause</span
                  ></button
                >
              </li>{/each}
          </ul>
          <p class="agreement-note">
            {#if agreement.length < 5}Only {agreement.length}
              {agreement.length === 1 ? 'rule matched' : 'rules matched'}; we won’t invent extra
              implications.
            {:else}Up to 8 distinct implications, prioritized by severity and category.
            {/if}{' '}Click a point to check its source. Filters do not change this overview.
          </p>
        {:else}<p class="agreement-note">
            No rules matched, so there are no supported agreement points to summarize. That does not
            mean the policy is safe.
          </p>{/if}
      </section>
      <div class="review-tabs" role="tablist" aria-label="Analysis view">
        <button
          id="view-findings"
          role="tab"
          aria-selected={resultView === 'findings'}
          aria-controls="findings-panel"
          tabindex={resultView === 'findings' ? 0 : -1}
          class:active={resultView === 'findings'}
          onclick={() => (resultView = 'findings')}
          onkeydown={resultTabKey}><Icon name="flag" size={16} />Results</button
        >
        <button
          id="view-original"
          role="tab"
          aria-selected={resultView === 'original'}
          aria-controls="original-panel"
          tabindex={resultView === 'original' ? 0 : -1}
          class:active={resultView === 'original'}
          onclick={() => (resultView = 'original')}
          onkeydown={resultTabKey}><Icon name="document" size={16} />Original document</button
        >
      </div>
      {#if analysis.findings.length}
        <div class="results-toolbar">
          <div class="filter-buttons" role="group" aria-label="Filter by severity">
            <button
              class:selected={severity === 'all'}
              aria-pressed={severity === 'all'}
              onclick={() => (severity = 'all')}
              >All flags <span>{analysis.findings.length}</span></button
            >{#each severities as item}<button
                class:selected={severity === item}
                aria-pressed={severity === item}
                onclick={() => (severity = item)}
                ><i class={`severity-dot ${item}`}></i>{severityLabel[item]}
                <span>{analysis.counts[item]}</span></button
              >{/each}
          </div>
          <label class="category-filter"
            ><span class="sr-only">Filter by category</span><Icon name="sliders" size={15} /><select
              bind:value={category}
              ><option value="all">All categories</option>{#each categoryNames as item}<option
                  value={item}>{item}</option
                >{/each}</select
            ></label
          >
        </div>
        <div class="category-chips" role="group" aria-label="Filter categories">
          <button
            aria-pressed={category === 'all'}
            class:selected={category === 'all'}
            onclick={() => (category = 'all')}>All categories</button
          >
          {#each categoryNames as item}<button
              aria-pressed={category === item}
              class:selected={category === item}
              onclick={() => (category = item)}
              >{item}<span
                >{analysis.findings.filter((finding) => finding.rule.category === item)
                  .length}</span
              ></button
            >{/each}
        </div>
        <p class="filter-count" aria-live="polite">
          Showing {filtered.length} of {analysis.findings.length} findings{#if filtered.length < analysis.findings.length}<button
              class="text-button"
              onclick={() => {
                severity = 'all';
                category = 'all';
              }}>Reset filters</button
            >{/if}
        </p>
      {/if}
      <div
        id="findings-panel"
        role="tabpanel"
        aria-labelledby="view-findings"
        hidden={resultView !== 'findings'}
      >
        {#if analysis.findings.length}
          {#each groups as group (group.category)}
            <details class="category-group" open>
              <summary
                ><span class="category-icon"
                  ><Icon
                    name={group.category === 'Arbitration' || group.category === 'Liability limits'
                      ? 'scale'
                      : group.category === 'Auto-renewals' || group.category === 'Cancellation'
                        ? 'refresh'
                        : group.category === 'Tracking' || group.category === 'Ad profiling'
                          ? 'eye'
                          : group.category === 'Data sharing' ||
                              group.category === 'Third-party sharing'
                            ? 'users'
                            : 'document'}
                    size={19}
                  /></span
                >
                <h3>{group.category}</h3>
                <span class="group-count"
                  >{group.findings.length} {group.findings.length === 1 ? 'flag' : 'flags'}</span
                ><span class="group-chevron"><Icon name="chevron" size={18} /></span></summary
              >
              <div class="group-findings">
                {#each group.findings as finding (finding.id)}
                  <article class="finding-card">
                    <div class="finding-heading">
                      <h4>
                        <button class="flag-title" onclick={() => showClause(finding)}
                          >{finding.rule.title}<span class="sr-only">
                            — view original clause</span
                          ></button
                        >
                      </h4>
                      <span class={`severity ${finding.rule.severity}`}
                        ><i></i>{severityLabel[finding.rule.severity]}</span
                      >
                    </div>
                    <div class="clause-label">
                      IN THEIR WORDS{#if finding.occurrences > 1}<span
                          >Repeated {finding.occurrences} times</span
                        >{/if}
                    </div>
                    <blockquote class={finding.rule.severity}>
                      {finding.clause.slice(0, finding.matchStart)}<mark
                        >{finding.clause.slice(finding.matchStart, finding.matchEnd)}</mark
                      >{finding.clause.slice(finding.matchEnd)}
                    </blockquote>
                    <div class="explanation">
                      <span class="small-caps">IN PLAIN ENGLISH</span>
                      <p>{finding.rule.explanation}</p>
                    </div>
                    <div class="practical-tip">
                      <Icon name="sparkles" size={17} />
                      <p><strong>Your next move</strong>{finding.rule.tip}</p>
                    </div>
                    <div class="finding-source">
                      <button class="text-button" onclick={() => showClause(finding)}
                        ><Icon name="document" size={13} />View in original<Icon
                          name="arrow"
                          size={13}
                        /></button
                      ><span class="rule-id">Rule: {finding.rule.id}</span>
                    </div>
                  </article>
                {/each}
              </div>
            </details>
          {:else}<div class="no-filter-results">
              <Icon name="search" size={28} />
              <h3>No findings match these filters.</h3>
              <p>Try another category or show all severity levels.</p>
              <button
                class="secondary-button"
                onclick={() => {
                  severity = 'all';
                  category = 'all';
                }}>Show all findings</button
              >
            </div>{/each}
        {:else}
          <div class="no-findings card">
            <span class="no-findings-icon"><Icon name="search" size={30} /></span>
            <h3>No red flags detected by these rules.</h3>
            <p>
              This is a limited, English-language pattern check — not a safety rating. It can miss
              unusual wording, context, and risks outside its 25 rules. Make sure you pasted the
              actual policy, and still read the full document.
            </p>
            <button class="text-button" onclick={() => rulebook.showModal()}
              >See what we check <Icon name="arrow" size={15} /></button
            >
          </div>
        {/if}
      </div>
      <div
        id="original-panel"
        role="tabpanel"
        aria-labelledby="view-original"
        hidden={resultView !== 'original'}
      >
        <OriginalDocument
          text={analyzedText}
          findings={filtered}
          selectedId={selectedFinding}
          onshow={showClause}
        />
      </div>
      <div class="results-bottom">
        <p>
          <Icon name="info" size={14} /> Severity is a guide to attention, not a judgment of legality.
        </p>
        <a href="#decoder">Back to your text <Icon name="arrow-up" size={14} /></a>
      </div>
    </section>
  {/if}

  <section id="how-it-works" class="how-section" aria-labelledby="how-title">
    <div class="how-heading">
      <span class="small-caps">LESS GUESSWORK. BETTER DECISIONS.</span>
      <h2 id="how-title">A little understanding goes a long way.</h2>
      <p>From “I agree” to “I understand” in three simple steps.</p>
    </div>
    <div class="how-grid">
      <article>
        <div class="how-icon purple"><Icon name="document" size={22} /></div>
        <div>
          <span class="how-step">01 / PASTE</span>
          <h3>Bring the fine print.</h3>
          <p>Copy the terms or privacy policy you’re about to agree to. No account needed.</p>
        </div>
      </article>
      <article>
        <div class="how-icon amber"><Icon name="flag" size={21} /></div>
        <div>
          <span class="how-step">02 / DECODE</span>
          <h3>Spot the important bits.</h3>
          <p>We check for 25 common signals, from data sharing to sneaky renewals.</p>
        </div>
      </article>
      <article>
        <div class="how-icon mint"><Icon name="shield" size={22} /></div>
        <div>
          <span class="how-step">03 / UNDERSTAND</span>
          <h3>Make a more informed call.</h3>
          <p>Get plain-English explanations and practical next steps. You decide what matters.</p>
        </div>
      </article>
    </div>
  </section>

  <section class="transparency-section" aria-labelledby="transparency-title">
    <div>
      <span class="transparency-icon"><Icon name="shield" size={24} /></span>
      <h2 id="transparency-title">Nothing hidden.<br />Especially how this works.</h2>
      <p>Clear about the fine print. Clear about our limits.</p>
    </div>
    <div class="faq-list">
      <details>
        <summary>How does the analysis work?<Icon name="chevron" size={16} /></summary>
        <p>
          We check English-language text against {rules.length} hand-written pattern rules across 12 categories.
          We look for common phrases, filter some explicit denials, and show the exact source sentence.
          This is not AI or a complete legal review: unusual phrasing and context can produce missed flags
          or false alarms.
        </p>
        <button class="text-button" onclick={() => rulebook.showModal()}
          >Explore all 25 rules <Icon name="arrow" size={14} /></button
        >
      </details>
      <details>
        <summary>What happens to my pasted text?<Icon name="chevron" size={16} /></summary>
        <p>
          Pasted text and rule analysis stay in your browser. URL mode sends only the submitted
          address to our server, which fetches public policy pages. Those sites see a server
          request, not your browser cookies or login. Don’t submit private or token-bearing URLs. We
          do not store documents or use analytics. Hosting providers may log URL requests and
          metadata. Clear or reload to reset this page’s session; downloads and copied text remain
          wherever you save them.
        </p>
      </details>
      <details>
        <summary>Does “no red flags” mean it’s safe?<Icon name="chevron" size={16} /></summary>
        <p>
          No. It only means our current rules did not match the text you provided. The decoder
          cannot determine legality, enforceability, or whether an agreement is right for you. Read
          the complete policy and consult a qualified professional for important decisions.
        </p>
      </details>
    </div>
  </section>
</main>

<footer class="site-footer">
  <div class="footer-inner">
    <span class="footer-brand"
      ><Icon name="document" size={18} /> Fine Print Decoder<span class="brand-dot">.</span></span
    >
    <p>Built for a little more informed consent.</p>
    <div>
      <button onclick={() => privacy.showModal()}>Your privacy</button><span class="footer-version"
        >Paste + URL · v1.2</span
      >
    </div>
  </div>
</footer>
<div class="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</div>

<PrintReport {analysis} {stale} sources={imported} />

<dialog
  bind:this={manualCopyDialog}
  onclose={() => (manualCopy = '')}
  class="privacy-dialog"
  aria-labelledby="copy-title"
>
  <div class="dialog-header">
    <h2 id="copy-title">Copy your summary</h2>
    <button
      class="icon-button"
      aria-label="Close copy summary"
      onclick={() => manualCopyDialog.close()}><Icon name="x" size={22} /></button
    >
  </div>
  <div class="privacy-content">
    <p>Clipboard access was blocked. Select the text below and use your device’s Copy command.</p>
    <label for="manual-summary" class="sr-only">Summary to copy</label><textarea
      id="manual-summary"
      class="manual-summary"
      readonly
      bind:this={manualCopyField}
      value={manualCopy}></textarea><button
      class="primary-button"
      onclick={() => manualCopyDialog.close()}>Done</button
    >
  </div>
</dialog>

<dialog bind:this={rulebook} class="rulebook-dialog" aria-labelledby="rulebook-title">
  <div class="dialog-header">
    <div>
      <span class="small-caps">TRANSPARENT BY DESIGN</span>
      <h2 id="rulebook-title">The rulebook.</h2>
    </div>
    <button class="icon-button" aria-label="Close rulebook" onclick={() => rulebook.close()}
      ><Icon name="x" size={22} /></button
    >
  </div>
  <p class="dialog-intro">
    25 rules. 12 categories. No black box. These are review prompts, not legal conclusions. Each
    rule uses alternative, case-insensitive patterns.
  </p>
  <div class="dialog-scroll">
    {#each ruleGroups as group}<section class="rulebook-category">
        <h3>{group.category}</h3>
        {#each group.findings as { rule }}<details class="rule-entry">
            <summary
              ><span>{rule.title}<small>{rule.id}</small></span><span
                class={`severity ${rule.severity}`}><i></i>{severityLabel[rule.severity]}</span
              ><Icon name="chevron" size={16} /></summary
            >
            <div>
              <p>{rule.explanation}</p>
              <p><strong>Practical tip:</strong> {rule.tip}</p>
              <span class="small-caps">MATCHING PATTERNS</span>{#each rule.patterns as pattern}<code
                  >{pattern.toString()}</code
                >{/each}
            </div>
          </details>{/each}
      </section>{/each}
  </div>
</dialog>

<dialog bind:this={privacy} class="privacy-dialog" aria-labelledby="privacy-title">
  <div class="dialog-header">
    <div>
      <span class="small-caps">YOUR TEXT IS YOUR BUSINESS</span>
      <h2 id="privacy-title">Private by design.</h2>
    </div>
    <button
      class="icon-button"
      aria-label="Close privacy information"
      onclick={() => privacy.close()}><Icon name="x" size={22} /></button
    >
  </div>
  <div class="privacy-content">
    <p>
      Pasted text and risk analysis stay in your browser. Pasted text is never sent to a server,
      saved to browser storage, or used to train a model. Website URL mode is different: it sends
      your submitted URL to our server to fetch public policy text.
    </p>
    <ul>
      <li>No account, cookies, analytics, or third-party browser scripts.</li>
      <li>
        URL requests are opt-in. Our server contacts the target site without your cookies or login;
        the site sees the server’s request.
      </li>
      <li>
        URLs and request metadata may appear in hosting logs. Avoid private links, credentials, and
        access tokens.
      </li>
      <li>Text and results live only in the current page session.</li>
      <li>Clear or reload the page to reset the current session.</li>
      <li>Downloaded reports contain original clauses. Store and share them thoughtfully.</li>
    </ul>
    <p>
      Loading the website still makes ordinary requests for the app’s files. Your hosting provider
      may log those requests; they do not contain your pasted policy. Browser extensions and your
      device are outside this app’s control.
    </p>
    <button class="primary-button" onclick={() => privacy.close()}
      >Got it <Icon name="check" size={17} /></button
    >
  </div>
</dialog>
