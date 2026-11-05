import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('desktop entry, sample review, filters, export, and stale results', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Know what/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Decode the fine print' })).toBeDisabled();
  await page.screenshot({ path: 'artifacts/screenshots/desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Try an example' }).click();
  await expect(page.getByLabel('Your policy text')).toHaveValue(/FICTIONAL TERMS/);
  await page.getByRole('button', { name: 'Decode the fine print' }).click();
  await expect(page.getByRole('heading', { name: /closer look/ })).toBeVisible();
  await expect(page.locator('.finding-card')).not.toHaveCount(0);
  await expect(
    page
      .locator('.category-group')
      .filter({ has: page.getByRole('heading', { name: 'Arbitration', exact: true }) })
  ).toBeVisible();
  await expect(page.locator('.practical-tip').first()).toContainText('Your next move');
  await expect(page.locator('blockquote mark').first()).toBeVisible();
  await page.screenshot({ path: 'artifacts/screenshots/desktop-results.png', fullPage: true });
  await page.getByRole('button', { name: /^High/ }).click();
  await expect(page.locator('.finding-heading .severity.medium')).toHaveCount(0);
  await page.getByLabel('Filter by category').selectOption('Arbitration');
  await expect(page.locator('.category-group')).toHaveCount(1);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save report' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('fine-print-review.txt');
  await page.getByLabel('Your policy text').fill('Subscriptions automatically renew every year.');
  await expect(
    page.getByText('These findings are from the previous version.', { exact: false })
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save report' })).toBeDisabled();
  await page.getByRole('button', { name: 'Update analysis' }).click();
  await expect(page.locator('.finding-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(page.locator('#results')).toHaveCount(0);
  await expect(page.getByLabel('Your policy text')).toHaveValue('');
  expect(errors).toEqual([]);
});

test('URL tab is honest, keyboard operable, and preserves pasted text', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Your policy text').fill('My draft policy.');
  await page.getByRole('tab', { name: 'Paste Text' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: /Website URL/ })).toHaveAttribute(
    'aria-selected',
    'true'
  );
  await expect(page.getByText(/URL mode sends this address to our server/)).toBeVisible();
  await page.getByRole('button', { name: /Prefer not to send a URL/ }).click();
  await expect(page.getByLabel('Your policy text')).toHaveValue('My draft policy.');
  await expect(page.getByLabel('Your policy text')).toBeFocused();
  await page.getByRole('button', { name: 'The rulebook' }).click();
  await expect(page.getByRole('dialog', { name: 'The rulebook.' })).toBeVisible();
  await expect(page.locator('.rule-entry')).toHaveCount(25);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'The rulebook' })).toBeFocused();
});

test('local analysis makes no requests and does not store the document', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await page
    .getByLabel('Your policy text')
    .fill('We may sell your personal data. PRIVATE_CANARY_8152');
  await page.getByRole('button', { name: 'Decode the fine print' }).click();
  await expect(page.locator('.finding-card')).toHaveCount(1);
  expect(requests).toEqual([]);
  expect(
    await page.evaluate(() => ({
      local: localStorage.length,
      session: sessionStorage.length,
      cookie: document.cookie,
    }))
  ).toEqual({ local: 0, session: 0, cookie: '' });
  await page.reload();
  await expect(page.getByLabel('Your policy text')).toHaveValue('');
});

test('no matches is not a safety verdict; malicious text is only text', async ({ page }) => {
  await page.goto('/');
  await page
    .getByLabel('Your policy text')
    .fill('We do not sell your data. We never use device fingerprinting.');
  await page.getByRole('button', { name: 'Decode the fine print' }).click();
  await expect(
    page.getByRole('heading', { name: 'No red flags detected by these rules.' })
  ).toBeVisible();
  await expect(page.locator('.no-findings')).toContainText('not a safety rating');
  await page
    .getByLabel('Your policy text')
    .fill('We sell your data <img src=x onerror="window.PWNED=true">.');
  await page.getByRole('button', { name: 'Decode updated text' }).click();
  await expect(page.locator('.finding-card blockquote')).toContainText('<img src=x');
  await expect(page.locator('blockquote img')).toHaveCount(0);
  expect(await page.evaluate(() => Reflect.get(window, 'PWNED'))).toBeUndefined();
});

test('input limit is explicit and no matches exist for impossible filters', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Your policy text').fill('x'.repeat(100_001));
  await expect(
    page.getByText('This policy is too long. Please analyze it in smaller sections.')
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Decode the fine print' })).toBeDisabled();
  await page.getByRole('button', { name: 'Try an example' }).click();
  await page.getByRole('button', { name: 'Decode the fine print' }).click();
  await page.getByRole('button', { name: /^Info / }).click();
  await expect(
    page.getByRole('heading', { name: 'No findings match these filters.' })
  ).toBeVisible();
  await page.getByRole('button', { name: 'Show all findings' }).click();
  await expect(page.locator('.finding-card')).not.toHaveCount(0);
});

for (const width of [375, 768]) {
  test(`responsive paste and results at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    await page.screenshot({ path: `artifacts/screenshots/mobile-${width}.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true
    );
    await page.getByRole('button', { name: 'Try an example' }).click();
    await page.getByRole('button', { name: 'Decode the fine print' }).click();
    await expect(page.locator('.finding-card').first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true
    );
    await page.screenshot({
      path: `artifacts/screenshots/mobile-results-${width}.png`,
      fullPage: true,
    });
  });
}

test('WCAG A/AA automated accessibility checks on input, URL, findings and rulebook', async ({
  page,
}) => {
  await page.goto('/');
  const check = async () => {
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
  };
  await check();
  await page.getByRole('tab', { name: /Website URL/ }).click();
  await check();
  await page.getByRole('button', { name: /Prefer not to send a URL/ }).click();
  await page.getByRole('button', { name: 'Try an example' }).click();
  await page.getByRole('button', { name: 'Decode the fine print' }).click();
  await check();
  await page.getByRole('button', { name: 'The rulebook' }).click();
  await check();
});
