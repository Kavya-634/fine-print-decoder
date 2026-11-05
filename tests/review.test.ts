import { describe, expect, it } from 'vitest';
import { analyzePolicy, type Finding } from '../src/lib/analyze';
import {
  buildSummary,
  calculateRisk,
  documentSegments,
  LEGAL_DISCLAIMER,
  riskLabel,
  summarizeAgreement,
} from '../src/lib/review';
import { samplePolicies } from '../src/lib/sample';
import { rules } from '../src/lib/rules';

const highClause = 'We may sell your personal information.';
const warningClause = 'Your subscription automatically renews.';
const infoClause = 'Third-party services have their own privacy policies.';

describe('transparent risk index', () => {
  it.each([
    [0, 'Low'],
    [24, 'Low'],
    [25, 'Moderate'],
    [59, 'Moderate'],
    [60, 'High'],
    [100, 'High'],
  ] as const)('labels %i as %s', (score, label) => {
    expect(riskLabel(score)).toBe(label);
  });
  it('returns zero for no flags without inferring safety', () => {
    expect(calculateRisk([])).toEqual({ score: 0, label: 'Low', hits: 0 });
    expect(buildSummary(analyzePolicy('We do not sell your data.'))).toContain(
      'No matches does not mean a policy is safe.'
    );
  });
  it('weights high/warning/info at 12/6/2', () => {
    expect(calculateRisk(analyzePolicy(highClause).findings).score).toBe(12);
    expect(calculateRisk(analyzePolicy(warningClause).findings).score).toBe(6);
    expect(calculateRisk(analyzePolicy(infoClause).findings).score).toBe(2);
  });
  it('counts repeated clauses but caps each rule at three hits', () => {
    for (const count of [1, 2, 3, 10]) {
      const result = analyzePolicy(Array(count).fill(highClause).join('\n'));
      expect(result.findings).toHaveLength(1);
      expect(calculateRisk(result.findings)).toEqual({
        score: 12 * Math.min(3, count),
        label: count < 3 ? 'Low' : 'Moderate',
        hits: count,
      });
    }
  });
  it('caps multiple distinct clauses for one rule together, not per card', () => {
    const result = analyzePolicy(
      'We may sell your data. We sell your personal information to partners. We rent your data. We rent your information.'
    );
    expect(result.findings).toHaveLength(4);
    expect(calculateRisk(result.findings).score).toBe(36);
  });
  it('never exceeds 100 and is independent of finding order', () => {
    const findings = analyzePolicy(samplePolicies.map((sample) => sample.text).join('\n')).findings;
    expect(calculateRisk(findings).score).toBe(100);
    expect(calculateRisk([...findings].reverse())).toEqual(calculateRisk(findings));
  });
});

describe('grounded agreement points and samples', () => {
  for (const sample of samplePolicies) {
    it(`${sample.name} is clearly fictional and produces 5–8 grounded points`, () => {
      expect(sample.text).toContain('FICTIONAL');
      expect(sample.text).toContain('not a real agreement');
      const analysis = analyzePolicy(sample.text);
      const points = summarizeAgreement(analysis.findings);
      expect(points.length).toBeGreaterThanOrEqual(5);
      expect(points.length).toBeLessThanOrEqual(8);
      expect(new Set(points.map((point) => point.finding.rule.id)).size).toBe(points.length);
      for (const point of points) {
        expect(analysis.findings).toContain(point.finding);
        expect(point.text.length).toBeGreaterThan(30);
        expect(point.text).not.toContain('undefined');
      }
    });
  }
  it('never fabricates five implications when only one rule fires', () => {
    expect(summarizeAgreement([])).toEqual([]);
    expect(summarizeAgreement(analyzePolicy(highClause).findings)).toHaveLength(1);
    expect(buildSummary(analyzePolicy(highClause))).toContain('Fewer than five rules matched');
  });
  it('deduplicates a rule triggered by different sentences', () => {
    expect(
      summarizeAgreement(
        analyzePolicy('We sell your data. We sell your personal information to partners.').findings
      )
    ).toHaveLength(1);
  });
  it('covers all 25 known rules with simple authored text', () => {
    const findings: Finding[] = rules.map((rule, index) => ({
      rule,
      id: rule.id,
      start: index,
      end: index + 1,
      clause: 'x',
      matchStart: 0,
      matchEnd: 1,
      occurrences: 1,
      locations: [{ start: index, end: index + 1 }],
    }));
    for (const finding of findings) {
      const point = summarizeAgreement([finding])[0];
      expect(point.text).not.toBe(finding.rule.title);
      expect(point.finding).toBe(finding);
    }
  });
  it('includes score, rule IDs, disclaimer, counts, and methodology in copied text', () => {
    const result = analyzePolicy(samplePolicies[0].text);
    const summary = buildSummary(result);
    expect(summary).toContain(LEGAL_DISCLAIMER);
    expect(summary).toContain(`${calculateRisk(result.findings).score}/100`);
    expect(summary).toContain('WHAT YOU’RE AGREEING TO');
    expect(summary).toContain('HOW THE SCORE WORKS');
    expect(summary).toContain(summarizeAgreement(result.findings)[0].finding.rule.id);
  });
});

describe('source document segments', () => {
  it('preserves all original text, Unicode, whitespace, and repeated occurrences', () => {
    const text = `  FICTIONAL — policy\r\n\n${highClause}\n\tUnflagged text.\n${highClause}\n`;
    const result = analyzePolicy(text);
    const segments = documentSegments(text, result.findings);
    expect(segments.map((segment) => segment.text).join('')).toBe(text);
    const highlights = segments.filter((segment) => segment.severity);
    expect(highlights).toHaveLength(2);
    for (const segment of highlights) {
      expect(text.slice(segment.start, segment.end)).toBe(highClause);
      expect(segment.severity).toBe('high');
    }
    expect(result.findings[0].locations).toHaveLength(2);
  });
  it('handles two rules on the same clause using highest visible severity', () => {
    const text = 'We may sell your data and share your data with service providers.';
    const result = analyzePolicy(text);
    expect(result.findings).toHaveLength(2);
    const segments = documentSegments(text, result.findings);
    expect(segments).toHaveLength(1);
    expect(segments[0].severity).toBe('high');
    expect(segments[0].findingIds).toHaveLength(2);
    const warnings = result.findings.filter((finding) => finding.rule.severity === 'medium');
    expect(documentSegments(text, warnings)[0].severity).toBe('medium');
  });
  it('preserves HTML-like content as plain source text', () => {
    const text = 'We sell your data <script>alert(1)</script>.';
    expect(
      documentSegments(text, analyzePolicy(text).findings)
        .map((segment) => segment.text)
        .join('')
    ).toBe(text);
  });
  it('retains the full document when filters select no flags', () => {
    expect(documentSegments(highClause, [])).toEqual([
      { start: 0, end: highClause.length, text: highClause, severity: undefined, findingIds: [] },
    ]);
    expect(documentSegments('', [])).toEqual([]);
  });
});
