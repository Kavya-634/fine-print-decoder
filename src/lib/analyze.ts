import { rules, type RiskCategory, type RiskRule, type Severity } from './rules';

export const MAX_CHARACTERS = 100_000;
export const severityRank: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
export const severityLabel: Record<Severity, string> = {
  high: 'High',
  medium: 'Warning',
  low: 'Info',
};

export interface ClauseLocation {
  start: number;
  end: number;
}

export interface Finding {
  id: string;
  rule: RiskRule;
  clause: string;
  start: number;
  end: number;
  matchStart: number;
  matchEnd: number;
  occurrences: number;
  locations: ClauseLocation[];
}

export interface Analysis {
  findings: Finding[];
  wordCount: number;
  characterCount: number;
  categories: number;
  counts: Record<Severity, number>;
}

// Only explicit local denials are suppressed. Negative rights ("may not
// participate in a class action") and liability exclusions are risk signals,
// not promises of privacy. Ambiguous language remains for human review.
function isNegated(clause: string, index: number, length: number, rule: RiskRule): boolean {
  const prefix = clause
    .slice(Math.max(0, index - 100), index)
    .toLowerCase()
    .split(/\b(?:but|however|except|unless)\b|[;:]/)
    .at(-1)!;
  const matched = clause.slice(index, index + length).toLowerCase();
  const denial =
    /\b(?:do not|does not|will not|shall not|never|cannot|can't|don't|doesn't|won't|no longer|not to|not|no)\s+(?:(?:a|an|any|ever|use|engage in|require|impose|perform|allow|permit|include|conduct|participate in|sell|share|or|and)\s+){0,6}$/i;
  const suffix = clause.slice(index + length, index + length + 80);
  if (denial.test(prefix)) return true;
  if (
    /^\s+(?:(?:is|are|will be)\s+)?(?:not (?:used|required|permitted|allowed)|prohibited|disabled)\b/i.test(
      suffix
    )
  )
    return true;
  // Negation INSIDE these particular matches defines the risk itself. Do not
  // suppress "liability shall not exceed" or "may not join a class action".
  if (rule.id === 'liability-cap' && /\bnot exceed\b/.test(matched)) return false;
  if (
    [
      'damages-exclusion',
      'class-action-waiver',
      'third-party-responsibility',
      'non-refundable',
    ].includes(rule.id)
  )
    return false;
  return /\b(?:do not|does not|will not|shall not|never|not be|not being|not limited)\b/.test(
    matched
  );
}

function* clauses(text: string): Generator<{ clause: string; start: number }> {
  const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });
  // Newlines also delimit clauses, covering copied bullet lists without periods.
  for (const paragraph of text.matchAll(/[^\r\n]+/g)) {
    for (const sentence of segmenter.segment(paragraph[0])) {
      const leading = sentence.segment.length - sentence.segment.trimStart().length;
      const clause = sentence.segment.trim();
      if (clause) yield { clause, start: paragraph.index + sentence.index + leading };
    }
  }
}

export function analyzePolicy(text: string): Analysis {
  if (!text.trim()) throw new Error('Paste some policy text before decoding.');
  if (text.length > MAX_CHARACTERS)
    throw new Error(
      'This text is too long. Analyze sections of up to 100,000 characters at a time.'
    );
  const findings: Finding[] = [];
  const seen = new Map<string, Finding>();

  for (const { clause, start } of clauses(text)) {
    // Normalize same-length typography/whitespace solely for matching. Display
    // and offsets always refer to the untouched original pasted text.
    const normalized = clause
      .replace(/[’‘]/g, "'")
      .replace(/[‐‑–—]/g, '-')
      .replace(/\s/g, ' ');
    for (const rule of rules) {
      let accepted: RegExpExecArray | null = null;
      for (const pattern of rule.patterns) {
        // Fresh global instances avoid mutable lastIndex between analyses and
        // allow a positive occurrence after a denial in the same sentence.
        const matcher = new RegExp(pattern.source, pattern.flags.replace(/[gy]/g, '') + 'g');
        for (const match of normalized.matchAll(matcher)) {
          if (!isNegated(normalized, match.index, match[0].length, rule)) {
            accepted = match;
            break;
          }
        }
        if (accepted) break;
      }
      if (!accepted) continue;
      const duplicateKey = `${rule.id}:${normalized.toLowerCase()}`;
      const previous = seen.get(duplicateKey);
      if (previous) {
        previous.occurrences++;
        previous.locations.push({ start, end: start + clause.length });
        continue;
      }
      const finding: Finding = {
        id: `${rule.id}-${start}`,
        rule,
        clause,
        start,
        end: start + clause.length,
        matchStart: accepted.index,
        matchEnd: accepted.index + accepted[0].length,
        occurrences: 1,
        locations: [{ start, end: start + clause.length }],
      };
      findings.push(finding);
      seen.set(duplicateKey, finding);
    }
  }
  findings.sort(
    (a, b) => severityRank[a.rule.severity] - severityRank[b.rule.severity] || a.start - b.start
  );
  const counts = { high: 0, medium: 0, low: 0 };
  for (const finding of findings) counts[finding.rule.severity]++;
  return {
    findings,
    counts,
    wordCount: text.trim().split(/\s+/u).length,
    characterCount: text.length,
    categories: new Set(findings.map((finding) => finding.rule.category)).size,
  };
}

export function groupFindings(
  findings: Finding[]
): { category: RiskCategory; findings: Finding[] }[] {
  const groups = new Map<RiskCategory, Finding[]>();
  for (const finding of findings) {
    const group = groups.get(finding.rule.category) ?? [];
    group.push(finding);
    groups.set(finding.rule.category, group);
  }
  return [...groups].map(([category, findings]) => ({ category, findings }));
}
