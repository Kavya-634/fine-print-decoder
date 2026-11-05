import { describe, expect, it } from 'vitest';
import { analyzePolicy, groupFindings, MAX_CHARACTERS } from '../src/lib/analyze';
import { rules } from '../src/lib/rules';
import { samplePolicy } from '../src/lib/sample';

// One positive fixture per rule keeps all 25 risk signals independently covered.
const positives: Record<string, string> = {
  'data-sale': 'We may sell your personal information to other businesses.',
  'affiliate-sharing': 'We share your information with our affiliates.',
  'business-transfer': 'Your information may be transferred as part of a merger.',
  'cross-site-tracking': 'We track your activity across websites.',
  'device-fingerprinting': 'We use device fingerprinting to recognize you.',
  'targeted-advertising': 'We use your information for personalized advertising.',
  'data-combination': 'We combine your information with data from third parties.',
  'automatic-renewal': 'Your subscription automatically renews every month.',
  'trial-conversion': 'At the end of your free trial, you will be charged the monthly fee.',
  'non-refundable': 'All payments are non-refundable.',
  'cancellation-friction': 'You must cancel by telephone at least 30 days before renewal.',
  'binding-arbitration': 'All claims are subject to binding arbitration.',
  'class-action-waiver': 'You waive your right to participate in a class action.',
  'broad-content-license':
    'You grant us a perpetual, irrevocable, worldwide license to your content.',
  'content-reuse': 'We may use your content for commercial and marketing purposes.',
  'terms-change': 'We may modify these terms at any time without prior notice.',
  'continued-use-consent': 'Your continued use constitutes acceptance of the revised terms.',
  'liability-cap': 'Our total liability shall not exceed the amount you paid us.',
  'damages-exclusion': 'We will not be liable for indirect or consequential damages.',
  'indefinite-retention': 'We retain your data indefinitely.',
  'post-closure-retention': 'We may retain your information after you delete your account.',
  'discretionary-termination': 'We may terminate your account at our sole discretion.',
  'termination-data-loss': 'Upon termination, we may delete your content and files.',
  'external-provider-sharing': 'We may share your personal data with service providers.',
  'third-party-responsibility':
    'We are not responsible for the privacy practices of third-party services.',
};

describe('rulebook', () => {
  it('has 25 unique documented rules across all 12 categories', () => {
    expect(rules).toHaveLength(25);
    expect(new Set(rules.map((rule) => rule.id)).size).toBe(25);
    expect(new Set(rules.map((rule) => rule.category)).size).toBe(12);
    expect(Object.keys(positives)).toHaveLength(rules.length);
    for (const rule of rules) {
      expect(rule.title.length).toBeGreaterThan(10);
      expect(rule.explanation.length).toBeGreaterThan(60);
      expect(rule.tip.length).toBeGreaterThan(40);
      expect(rule.patterns.length).toBeGreaterThan(0);
      expect(rule.patterns.every((pattern) => pattern.ignoreCase)).toBe(true);
    }
  });
  for (const [id, clause] of Object.entries(positives)) {
    it(`detects ${id} and preserves the original clause`, () => {
      const finding = analyzePolicy(clause).findings.find((finding) => finding.rule.id === id);
      expect(finding, id).toBeDefined();
      expect(finding?.clause).toBe(clause);
      expect(clause.slice(finding!.start, finding!.end)).toBe(clause);
      expect(finding!.matchEnd).toBeGreaterThan(finding!.matchStart);
    });
  }
});

describe('scanner reliability', () => {
  it.each([
    'We do not sell your personal information.',
    'We never sell your data.',
    'We don’t sell your information.',
    'We will not share your personal information with third parties.',
    'We do not share your information with affiliates.',
    'We do not use third-party cookies.',
    'We never use device fingerprinting.',
    'We do not use personalized advertising.',
    'Subscriptions do not automatically renew.',
    'We do not require binding arbitration.',
    'Binding arbitration is not required.',
    'We never retain your data indefinitely.',
    'We agree not to modify these terms without prior notice.',
    'You do not waive your right to participate in a class action.',
    'We do not exclude consequential damages.',
    'Our liability is not limited to the fees paid.',
    'We do not require a class-action waiver.',
    'Payments are not non-refundable.',
    'We offer optional services, but do not sell your data.',
  ])('does not flag an explicit denial: %s', (text) => {
    expect(analyzePolicy(text).findings).toHaveLength(0);
  });
  it('preserves rights restrictions and liability exclusion signals despite negatives', () => {
    const result = analyzePolicy(
      'You may not participate in a class action. We are not liable for consequential damages. Our liability will not exceed $100.'
    );
    expect(result.findings.map((finding) => finding.rule.id)).toEqual(
      expect.arrayContaining(['class-action-waiver', 'damages-exclusion', 'liability-cap'])
    );
  });
  it('finds an affirmative statement after a denial in the same sentence', () => {
    const result = analyzePolicy(
      'We do not sell your data, but our affiliates may sell your data to advertisers.'
    );
    expect(result.findings.map((finding) => finding.rule.id)).toContain('data-sale');
  });
  it('does not match vague standalone keywords', () => {
    expect(
      analyzePolicy('Privacy. Data. Liability. Advertising. Cookies. Welcome to our policy.')
        .findings
    ).toHaveLength(0);
  });
  it('keeps Unicode typography, source offsets, and line-oriented clauses', () => {
    const text =
      '  Your subscription automatically renews.\r\n  All payments are non‑refundable.\n';
    const result = analyzePolicy(text);
    expect(result.findings).toHaveLength(2);
    for (const finding of result.findings)
      expect(text.slice(finding.start, finding.end)).toBe(finding.clause);
    expect(result.findings[1].clause).toContain('non‑refundable');
  });
  it('deduplicates repeated clauses but preserves repeat count', () => {
    const clause = positives['automatic-renewal'];
    const result = analyzePolicy(`${clause}\n${clause}`);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].occurrences).toBe(2);
  });
  it('retains distinct clauses triggering the same rule', () => {
    expect(
      analyzePolicy(
        'We may sell your data. We also sell your personal information to partners.'
      ).findings.filter((finding) => finding.rule.id === 'data-sale')
    ).toHaveLength(2);
  });
  it('is deterministic across repeated calls', () => {
    expect(analyzePolicy(samplePolicy)).toEqual(analyzePolicy(samplePolicy));
  });
  it('has consistent category and severity counts', () => {
    const result = analyzePolicy(samplePolicy);
    expect(result.findings.length).toBeGreaterThan(7);
    expect(result.categories).toBe(groupFindings(result.findings).length);
    expect(result.findings.length).toBe(
      result.counts.high + result.counts.medium + result.counts.low
    );
    expect(result.findings[0].rule.severity).toBe('high');
  });
  it('rejects empty input and oversized policies', () => {
    expect(() => analyzePolicy(' \n ')).toThrow(/Paste/);
    expect(() => analyzePolicy('a'.repeat(MAX_CHARACTERS + 1))).toThrow(/too long/);
  });
  it('handles maximum-size unbroken input without a regex blowup', () => {
    const start = performance.now();
    expect(analyzePolicy('a'.repeat(MAX_CHARACTERS)).findings).toHaveLength(0);
    expect(performance.now() - start).toBeLessThan(2000);
  });
});
