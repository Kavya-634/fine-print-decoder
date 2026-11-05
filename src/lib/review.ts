import { severityLabel, severityRank, type Analysis, type Finding } from './analyze';
import type { Severity } from './rules';

export const LEGAL_DISCLAIMER =
  'Not legal advice. This tool flags wording patterns and can miss or misread clauses.';

// Editorial attention index, NOT a probability of harm or a safety rating.
// Count sentence-level rule hits (including deduplicated repeats), but cap each
// rule's contribution at three hits so repeated boilerplate cannot dominate.
export const RISK_WEIGHTS: Record<Severity, number> = { high: 12, medium: 6, low: 2 };
export const RISK_METHOD =
  'High = 12 points, Warning = 6, Info = 2 per clause-level rule hit. Each rule counts at most 3 hits; the total is capped at 100. Low: 0–24, Moderate: 25–59, High: 60–100. Filters never change the overall score. This is an editorial wording-pattern index, not a probability of harm or a safety rating.';

export function riskLabel(score: number): 'Low' | 'Moderate' | 'High' {
  return score >= 60 ? 'High' : score >= 25 ? 'Moderate' : 'Low';
}

export function calculateRisk(findings: Finding[]) {
  const hits = new Map<string, { severity: Severity; count: number }>();
  for (const finding of findings) {
    const previous = hits.get(finding.rule.id);
    hits.set(finding.rule.id, {
      severity: finding.rule.severity,
      count: (previous?.count ?? 0) + finding.occurrences,
    });
  }
  const score = Math.min(
    100,
    [...hits.values()].reduce(
      (total, hit) => total + RISK_WEIGHTS[hit.severity] * Math.min(3, hit.count),
      0
    )
  );
  return {
    score,
    label: riskLabel(score),
    hits: findings.reduce((sum, item) => sum + item.occurrences, 0),
  };
}

// Every summary sentence is authored against a specific rule. No generated
// claims, external services, or generic padding when fewer than five rules fire.
const agreementText: Record<string, string> = {
  'data-sale': 'Your personal information may be sold or rented to other businesses.',
  'affiliate-sharing': 'Your information may be shared with other companies in the same group.',
  'business-transfer': 'A merger or sale could put your information in a new owner’s hands.',
  'cross-site-tracking':
    'The service may connect your activity here with what you do on other sites.',
  'device-fingerprinting': 'Your device may be recognized even after you clear its cookies.',
  'targeted-advertising': 'Information about you may be used to choose personalized ads.',
  'data-combination': 'Your profile may include information collected from other sources.',
  'automatic-renewal': 'Your subscription may keep renewing until you cancel before the cutoff.',
  'trial-conversion': 'Your free trial may turn into a paid subscription unless you act in time.',
  'non-refundable': 'Canceling may not get you a refund for money you have already paid.',
  'cancellation-friction': 'Canceling may require advance notice or a particular contact method.',
  'binding-arbitration':
    'You may have to resolve disputes through arbitration rather than in court.',
  'class-action-waiver': 'You may give up the option to join a class action or have a jury trial.',
  'broad-content-license': 'You may give the company broad permission to use content you upload.',
  'content-reuse': 'Your content may be adapted or reused beyond displaying it to your audience.',
  'terms-change': 'The company may change the agreement without much warning.',
  'continued-use-consent': 'Continuing to use the service may count as accepting updated terms.',
  'liability-cap': 'The amount the company pays if something goes wrong may be capped.',
  'damages-exclusion': 'Some losses, such as lost data or indirect damage, may not be covered.',
  'indefinite-retention': 'Your information may be kept without a clear deletion date.',
  'post-closure-retention': 'Closing your account may not delete all of your information.',
  'discretionary-termination': 'The company may suspend or close your account at its discretion.',
  'termination-data-loss': 'Losing access to your account may also mean losing files or credits.',
  'external-provider-sharing':
    'Outside organizations may receive some of your personal information.',
  'third-party-responsibility':
    'Connected services may have separate policies and different protections.',
};

export interface AgreementPoint {
  text: string;
  finding: Finding;
}

export function summarizeAgreement(findings: Finding[]): AgreementPoint[] {
  const ordered = [...findings].sort(
    (a, b) => severityRank[a.rule.severity] - severityRank[b.rule.severity] || a.start - b.start
  );
  const unique = ordered.filter(
    (finding, index) => ordered.findIndex((other) => other.rule.id === finding.rule.id) === index
  );
  // Cover different categories first, then fill remaining slots by severity.
  const selected: Finding[] = [];
  const categories = new Set<string>();
  for (const finding of unique) {
    if (!categories.has(finding.rule.category)) {
      selected.push(finding);
      categories.add(finding.rule.category);
    }
    if (selected.length === 8) break;
  }
  for (const finding of unique) {
    if (selected.length === 8) break;
    if (!selected.includes(finding)) selected.push(finding);
  }
  return selected.map((finding) => ({
    text: agreementText[finding.rule.id] ?? finding.rule.title,
    finding,
  }));
}

export interface DocumentSegment {
  start: number;
  end: number;
  text: string;
  severity?: Severity;
  findingIds: string[];
}

// Sweep boundaries to avoid nested/overlapping marks. All clauses sharing a
// range become one highlight with the highest visible severity. Include every
// repeated occurrence and leave all original text/whitespace untouched.
export function documentSegments(text: string, findings: Finding[]): DocumentSegment[] {
  const events = new Map<number, { add: Finding[]; remove: Finding[] }>();
  const eventAt = (at: number) => {
    if (!events.has(at)) events.set(at, { add: [], remove: [] });
    return events.get(at)!;
  };
  eventAt(0);
  eventAt(text.length);
  for (const finding of findings) {
    for (const location of finding.locations) {
      eventAt(location.start).add.push(finding);
      eventAt(location.end).remove.push(finding);
    }
  }
  const boundaries = [...events.keys()].sort((a, b) => a - b);
  const active = new Map<string, Finding>();
  const segments: DocumentSegment[] = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const start = boundaries[i];
    const end = boundaries[i + 1];
    const event = events.get(start)!;
    for (const finding of event.remove) active.delete(finding.id);
    for (const finding of event.add) active.set(finding.id, finding);
    const sorted = [...active.values()].sort(
      (a, b) => severityRank[a.rule.severity] - severityRank[b.rule.severity]
    );
    if (end > start)
      segments.push({
        start,
        end,
        text: text.slice(start, end),
        severity: sorted[0]?.rule.severity,
        findingIds: sorted.map((finding) => finding.id),
      });
  }
  return segments;
}

export function buildSummary(analysis: Analysis): string {
  const risk = calculateRisk(analysis.findings);
  const points = summarizeAgreement(analysis.findings);
  return [
    'FINE PRINT DECODER — LOCAL REVIEW',
    LEGAL_DISCLAIMER,
    `Overall risk score: ${risk.score}/100 — ${risk.label} risk (wording-pattern index only)`,
    `${analysis.findings.length} findings | ${risk.hits} clause-level rule hits | ${analysis.categories} categories | ${analysis.wordCount} words checked`,
    'WHAT YOU’RE AGREEING TO (potential implications of matched wording)',
    'Up to 8 distinct implications from the full analysis, regardless of filters.',
    ...(points.length
      ? points.map((point) => `• ${point.text} [${point.finding.rule.id}]`)
      : ['No rules matched. No matches does not mean a policy is safe.']),
    ...(points.length > 0 && points.length < 5
      ? ['Fewer than five rules matched; no extra implications have been invented.']
      : []),
    '',
    'SEVERITY BREAKDOWN',
    ...(['high', 'medium', 'low'] as const).map(
      (level) => `${severityLabel[level]}: ${analysis.counts[level]}`
    ),
    '',
    'HOW THE SCORE WORKS',
    RISK_METHOD,
    'Read the complete policy. Exceptions, local law, and context can change what clauses mean.',
  ].join('\n');
}
