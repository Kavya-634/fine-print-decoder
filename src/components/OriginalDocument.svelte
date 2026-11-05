<script lang="ts">
  import type { Finding } from '../lib/analyze';
  import { severityLabel } from '../lib/analyze';
  import { documentSegments } from '../lib/review';
  let {
    text,
    findings,
    selectedId,
    onshow,
  }: {
    text: string;
    findings: Finding[];
    selectedId: string;
    onshow: (finding: Finding, start?: number) => void;
  } = $props();
  const segments = $derived(documentSegments(text, findings));
</script>

<div class="original-intro">
  <div>
    <h3>Your original document</h3>
    <p>
      The analyzed snapshot, with its wording and spacing preserved. Only flags matching your
      filters are highlighted. Overlapping flags use the highest visible severity.
    </p>
  </div>
  <div class="document-key" aria-label="Highlight legend">
    <span class="severity high"><i></i>High</span><span class="severity medium"><i></i>Warning</span
    ><span class="severity low"><i></i>Info</span>
  </div>
</div>
<div class="original-layout">
  <aside class="document-flags" aria-label="Jump to flagged clause">
    <h4>Jump to a flag</h4>
    {#each findings as finding}<div class="document-flag">
        <button class:chosen={finding.id === selectedId} onclick={() => onshow(finding)}
          ><span class={`severity ${finding.rule.severity}`}
            ><i></i>{severityLabel[finding.rule.severity]}</span
          ><strong>{finding.rule.title}</strong></button
        >{#if finding.locations.length > 1}<div class="repeat-links">
            {#each finding.locations as location, index}<button
                onclick={() => onshow(finding, location.start)}>Occurrence {index + 1}</button
              >{/each}
          </div>{/if}
      </div>{:else}<p>
        No flags match your filters. The unhighlighted text is still available for review.
      </p>{/each}
  </aside>
  <article class="original-document card" aria-label="Highlighted original policy">
    <div class="document-text">
      {#each segments as segment (segment.start)}{#if segment.severity}<mark
            id={`clause-${segment.start}`}
            class={`clause-highlight ${segment.severity}`}
            class:active-clause={segment.findingIds.includes(selectedId)}
            tabindex="-1"
            title={`${severityLabel[segment.severity]} · ${segment.findingIds.length} matching ${segment.findingIds.length === 1 ? 'rule' : 'rules'}`}
            >{segment.text}</mark
          >{:else}{segment.text}{/if}{/each}
    </div>
  </article>
</div>
