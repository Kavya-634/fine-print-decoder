<script lang="ts">
  import { groupFindings, severityLabel, type Analysis } from '../lib/analyze';
  import { calculateRisk, summarizeAgreement, LEGAL_DISCLAIMER, RISK_METHOD } from '../lib/review';
  import type { PolicyResult } from '../../server/policy-fetcher';
  let {
    analysis,
    stale,
    sources = null,
  }: { analysis: Analysis | null; stale: boolean; sources?: PolicyResult | null } = $props();
</script>

<section class="print-report" aria-label="Printable full analysis">
  <h1>Fine Print Decoder</h1>
  <p class="print-disclaimer">{LEGAL_DISCLAIMER}</p>
  {#if analysis && !stale}
    {@const risk = calculateRisk(analysis.findings)}
    <h2>Overall risk score: {risk.score}/100 — {risk.label} risk</h2>
    <p>Wording-pattern index only, not a safety rating. No flags does not mean a policy is safe.</p>
    <p>
      {analysis.findings.length} findings · {risk.hits} clause-level rule hits · {analysis.categories}
      categories · {analysis.wordCount} words checked
    </p>
    <p>Full analysis — all findings, regardless of on-screen filters.</p>
    {#if sources}<h2>Website sources</h2>
      <p>
        Only these extracted pages were analyzed. Extraction may omit content; check the originals.
      </p>
      <ul>
        {#each sources.pages as page}<li>{page.kind}: {page.url}</li>{/each}
      </ul>
      {#each sources.warnings as warning}<p><strong>Note:</strong> {warning}</p>{/each}{/if}
    <h2>What you're agreeing to</h2>
    <p>Potential implications of matched wording, not a definitive contract interpretation.</p>
    <ul>
      {#each summarizeAgreement(analysis.findings) as point}<li>
          {point.text} [{point.finding.rule.id}]
        </li>{:else}<li>
          No rules matched. Read the full policy; this does not establish safety.
        </li>{/each}
    </ul>
    <h2>Score methodology</h2>
    <p>{RISK_METHOD}</p>
    {#each groupFindings(analysis.findings) as group}<section class="print-category">
        <h2>{group.category}</h2>
        {#each group.findings as finding}<article class="print-finding">
            <h3>[{severityLabel[finding.rule.severity]}] {finding.rule.title}</h3>
            <p>
              Rule: {finding.rule.id}{#if finding.occurrences > 1}
                · Repeated {finding.occurrences} times{/if}
            </p>
            <blockquote>{finding.clause}</blockquote>
            <p><strong>In plain English:</strong> {finding.rule.explanation}</p>
            <p><strong>Your next move:</strong> {finding.rule.tip}</p>
          </article>{/each}
      </section>{/each}
    <footer>{LEGAL_DISCLAIMER}</footer>
  {:else}<h2>{stale ? 'Analysis needs updating' : 'No analysis to print yet'}</h2>
    <p>
      {stale
        ? 'The text changed after the last analysis. Decode the updated text before printing a report.'
        : 'Paste a policy and decode it to create a report.'}
    </p>{/if}
</section>
