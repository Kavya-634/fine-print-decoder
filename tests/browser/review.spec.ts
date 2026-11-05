import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const disclaimer =
  'Not legal advice. This tool flags wording patterns and can miss or misread clauses.';

test('three fictional policies instantly decode, with score and 5–8 sourced points', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.disclaimer')).toHaveText(disclaimer);
  for (const name of ['Subscription App', 'Social Network', 'Free Mobile Game']) {
    await page.getByRole('button', { name, exact: true }).click();
    const meter = page.getByRole('meter', { name: 'Overall risk score' });
    await expect(meter).toBeVisible();
    const score = Number(await meter.getAttribute('aria-valuenow'));
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
    expect(await page.locator('.agreement-points li').count()).toBeGreaterThanOrEqual(5);
    expect(await page.locator('.agreement-points li').count()).toBeLessThanOrEqual(8);
    await expect(page.getByLabel('Your policy text')).toHaveValue(/FICTIONAL/);
  }
  await page.screenshot({ path: 'artifacts/screenshots/review-desktop.png', fullPage: true });
});

test('category chips and Info/Warning/High combine without changing the overall score', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Free Mobile Game', exact: true }).click();
  const meter = page.getByRole('meter');
  const originalScore = await meter.getAttribute('aria-valuenow');
  await page
    .getByRole('group', { name: 'Filter categories' })
    .getByRole('button', { name: /^Arbitration/ })
    .click();
  await expect(page.locator('.category-group')).toHaveCount(1);
  await page
    .getByRole('group', { name: 'Filter by severity' })
    .getByRole('button', { name: /^Info/ })
    .click();
  await expect(page.getByText('No findings match these filters.')).toBeVisible();
  await expect(meter).toHaveAttribute('aria-valuenow', originalScore!);
  await page.getByRole('button', { name: 'Reset filters' }).click();
  await page
    .getByRole('group', { name: 'Filter by severity' })
    .getByRole('button', { name: /^Warning/ })
    .click();
  await expect(page.locator('.finding-heading .severity.high')).toHaveCount(0);
  await expect(page.locator('.finding-heading .severity.low')).toHaveCount(0);
  await expect(meter).toHaveAttribute('aria-valuenow', originalScore!);
});

test('clicking a flag opens and focuses its exact original clause; repeated clauses are preserved', async ({
  page,
}) => {
  await page.goto('/');
  const clause = 'We may sell your personal information.';
  const text = `  FICTIONAL — policy\n\n${clause}\n${'\tUnflagged text.\n'.repeat(80)}${clause}\n`;
  await page.getByLabel('Your policy text').fill(text);
  await page.getByRole('button', { name: 'Decode the fine print' }).click();
  await page.locator('.flag-title').click();
  await expect(page.getByRole('tab', { name: 'Original document' })).toHaveAttribute(
    'aria-selected',
    'true'
  );
  await expect(page.locator('.clause-highlight').first()).toBeFocused();
  await expect(page.locator('.clause-highlight').first()).toBeInViewport();
  await expect(page.locator('.clause-highlight')).toHaveCount(2);
  expect(await page.locator('.document-text').textContent()).toBe(text);
  await page.getByRole('button', { name: 'Occurrence 2', exact: true }).click();
  await expect(page.locator('.clause-highlight').nth(1)).toBeFocused();
  await expect(page.locator('.clause-highlight').nth(1)).toBeInViewport();
  await page.getByRole('tab', { name: 'Original document' }).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('tab', { name: 'Results', exact: true })).toHaveAttribute(
    'aria-selected',
    'true'
  );
  await expect(page.getByRole('tab', { name: 'Results', exact: true })).toBeFocused();
});

test('summary links reset restrictive filters and focus a real source clause', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Social Network', exact: true }).click();
  await page
    .getByRole('group', { name: 'Filter by severity' })
    .getByRole('button', { name: /^Info/ })
    .click();
  await page.locator('.agreement-points button').first().click();
  await expect(page.getByRole('tab', { name: 'Original document' })).toHaveAttribute(
    'aria-selected',
    'true'
  );
  await expect(page.locator('.clause-highlight:focus')).toHaveCount(1);
  await expect(page.locator('.clause-highlight:focus')).toHaveClass(/high/);
  await expect(
    page
      .getByRole('group', { name: 'Filter by severity' })
      .getByRole('button', { name: /^All flags/ })
  ).toHaveAttribute('aria-pressed', 'true');
});

test('original highlights follow filters and do not execute markup', async ({ page }) => {
  await page.goto('/');
  const text =
    'We may sell your data and share your data with service providers.\nThird-party services have their own privacy policies.\n<img src=x onerror="window.PWNED=true">';
  await page.getByLabel('Your policy text').fill(text);
  await page.getByRole('button', { name: 'Decode the fine print' }).click();
  await page.getByRole('tab', { name: 'Original document' }).click();
  await expect(page.locator('.clause-highlight.high')).toHaveCount(1);
  await page
    .getByRole('group', { name: 'Filter by severity' })
    .getByRole('button', { name: /^Warning/ })
    .click();
  await expect(page.locator('.clause-highlight.high')).toHaveCount(0);
  await expect(page.locator('.clause-highlight.medium')).toHaveCount(1);
  expect(await page.locator('.document-text').textContent()).toBe(text);
  await expect(page.locator('.document-text img')).toHaveCount(0);
  expect(await page.evaluate(() => Reflect.get(window, 'PWNED'))).toBeUndefined();
});

test('Copy Summary uses all findings regardless of filters and disables stale exports', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await page.getByRole('button', { name: 'Free Mobile Game', exact: true }).click();
  await page
    .getByRole('group', { name: 'Filter by severity' })
    .getByRole('button', { name: /^Info/ })
    .click();
  await page.getByRole('button', { name: 'Copy Summary', exact: true }).click();
  await expect(page.locator('.copy-status')).toContainText('Summary copied');
  const summary = await page.evaluate(() => navigator.clipboard.readText());
  expect(summary).toContain(disclaimer);
  expect(summary).toContain('Overall risk score:');
  expect(summary).toContain('device-fingerprinting');
  expect(summary).toContain('WHAT YOU’RE AGREEING TO');
  await page.getByLabel('Your policy text').fill('Changed text.');
  for (const name of ['Copy Summary', 'Print / Save as PDF', 'Save report'])
    await expect(page.getByRole('button', { name, exact: true })).toBeDisabled();
});

test('clipboard refusal offers an honest manual-copy fallback', async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: async () => {
          throw new Error('Denied');
        },
      },
    })
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Subscription App', exact: true }).click();
  await page.getByRole('button', { name: 'Copy Summary', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Copy your summary' })).toBeVisible();
  await expect(page.getByLabel('Summary to copy')).toHaveValue(/Overall risk score:/);
  expect(
    await page
      .getByLabel('Summary to copy')
      .evaluate((element: HTMLTextAreaElement) => element.selectionEnd - element.selectionStart)
  ).toBeGreaterThan(100);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
});

test('dedicated print report includes all findings when screen view is filtered, collapsed, or original', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Free Mobile Game', exact: true }).click();
  const allCount = await page.locator('.finding-card').count();
  await page.locator('.category-group summary').first().click();
  await page
    .getByRole('group', { name: 'Filter by severity' })
    .getByRole('button', { name: /^Info/ })
    .click();
  await page.getByRole('tab', { name: 'Original document' }).click();
  await page.evaluate(() => {
    window.print = () => {
      Reflect.set(window, 'PRINT_CALLED', true);
    };
  });
  await page.getByRole('button', { name: 'Print / Save as PDF', exact: true }).click();
  expect(await page.evaluate(() => Reflect.get(window, 'PRINT_CALLED'))).toBe(true);
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByRole('region', { name: 'Printable full analysis' })).toBeVisible();
  await expect(page.locator('.print-finding')).toHaveCount(allCount);
  await expect(page.locator('.print-report')).toContainText('device-fingerprinting');
  await expect(page.locator('.print-report')).toContainText(disclaimer);
  await expect(page.locator('.site-header')).not.toBeVisible();
  await expect(page.locator('#results')).not.toBeVisible();
  await page.pdf({ path: 'artifacts/print/fine-print-review.pdf', format: 'A4' });
  await page.emulateMedia({ media: 'screen' });
  await page.getByLabel('Your policy text').fill('Changed.');
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByRole('heading', { name: 'Analysis needs updating' })).toBeVisible();
  await expect(page.locator('.print-finding')).toHaveCount(0);
});

test('no matches shows a zero score without invented agreement bullets', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Your policy text').fill('We do not sell your data.');
  await page.getByRole('button', { name: 'Decode the fine print' }).click();
  await expect(page.getByRole('meter')).toHaveAttribute('aria-valuenow', '0');
  await expect(page.locator('.risk-caveat')).toContainText('Low does not mean safe');
  await expect(page.locator('.agreement-points li')).toHaveCount(0);
  await expect(page.locator('.agreement-card')).toContainText('No rules matched');
  await page.getByRole('tab', { name: 'Original document' }).click();
  expect(await page.locator('.document-text').textContent()).toBe('We do not sell your data.');
});

for (const width of [375, 768, 1440]) {
  test(`review and original views are responsive and accessible at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Social Network', exact: true }).click();
    for (const view of ['Results', 'Original document']) {
      await page.getByRole('tab', { name: view, exact: true }).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true
      );
      const result = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      expect(
        result.violations.map((violation) => ({
          id: violation.id,
          nodes: violation.nodes.map((node) => ({
            target: node.target,
            reason: node.failureSummary,
          })),
        }))
      ).toEqual([]);
    }
    await page.screenshot({ path: `artifacts/screenshots/original-${width}.png`, fullPage: true });
  });
}
