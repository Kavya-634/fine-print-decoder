<script lang="ts">
  import { calculateRisk, RISK_METHOD } from '../lib/review';
  import type { Finding } from '../lib/analyze';
  let { findings }: { findings: Finding[] } = $props();
  const risk = $derived(calculateRisk(findings));
</script>

<div class="risk-overview">
  <div
    class={`risk-gauge risk-${risk.label.toLowerCase()}`}
    role="meter"
    aria-label="Overall risk score"
    aria-valuemin="0"
    aria-valuemax="100"
    aria-valuenow={risk.score}
    aria-valuetext={`${risk.score} out of 100, ${risk.label} risk. Wording-pattern index, not a safety rating.`}
  >
    <svg viewBox="0 0 120 120" aria-hidden="true"
      ><circle class="gauge-track" cx="60" cy="60" r="50" /><circle
        class="gauge-value"
        cx="60"
        cy="60"
        r="50"
        pathLength="100"
        stroke-dasharray={`${risk.score} 100`}
        transform="rotate(-90 60 60)"
      /></svg
    >
    <div class="gauge-number" aria-hidden="true">
      <strong>{risk.score}</strong><span>/ 100</span>
    </div>
  </div>
  <div class="risk-description">
    <span class="small-caps">OVERALL RISK SCORE</span>
    <h2><span class={`risk-label risk-${risk.label.toLowerCase()}`}>{risk.label} risk</span></h2>
    <p>
      {findings.length} potential {findings.length === 1 ? 'flag' : 'flags'} · {risk.hits} rule {risk.hits ===
      1
        ? 'hit'
        : 'hits'}
    </p>
  </div>
</div>
<p class="risk-caveat">
  {findings.length
    ? 'More or stronger wording signals raise this score.'
    : 'No patterns matched. Low does not mean safe.'} A review prompt, not a legal verdict.
</p>
<details class="score-method">
  <summary>How is this calculated?</summary>
  <p>{RISK_METHOD}</p>
</details>
