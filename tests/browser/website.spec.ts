import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const payload = {
  pages: [
    {
      kind: 'terms',
      title: 'Fictional Terms',
      url: 'https://example.com/terms',
      text: 'Your subscription automatically renews. All payments are non-refundable. Disputes require binding arbitration.',
    },
    {
      kind: 'privacy',
      title: 'Fictional Privacy',
      url: 'https://example.com/privacy',
      text: 'We may sell your personal information. We use device fingerprinting.',
    },
  ],
  warnings: [] as string[],
};

async function openUrl(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Website URL' }).click();
}

test('URL mode sends only the URL, analyzes extracted text and preserves source links', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  let posted: unknown;
  await page.route('**/api/fetch-policy', async (route) => {
    posted = route.request().postDataJSON();
    await route.fulfill({ json: payload });
  });
  await page.goto('/');
  await page.getByLabel('Your policy text').fill('PRIVATE_PASTE_CANARY');
  await page.getByRole('tab', { name: 'Website URL' }).click();
  await page.getByLabel('Website address').fill('example.com');
  await page.getByRole('button', { name: 'Find & decode policies' }).click();
  await expect(page.getByRole('heading', { name: /closer look/ })).toBeVisible();
  expect(posted).toEqual({ url: 'https://example.com/' });
  await expect(page.getByRole('region', { name: 'Imported policy sources' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Fictional Privacy/ })).toHaveAttribute(
    'href',
    'https://example.com/privacy'
  );
  await page.getByRole('button', { name: 'Copy Summary', exact: true }).click();
  await expect(page.locator('.copy-status')).toContainText('Summary copied');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
    'https://example.com/terms'
  );
  await page.getByRole('button', { name: /Prefer not to send a URL/ }).click();
  await expect(page.getByLabel('Your policy text')).toHaveValue(
    /Source: https:\/\/example.com\/terms/
  );
  await page.getByLabel('Your policy text').fill('We may sell your data.');
  await page.getByRole('button', { name: 'Decode updated text' }).click();
  await expect(page.getByRole('region', { name: 'Imported policy sources' })).toHaveCount(0);
});

test('partial extraction warnings appear on screen and in print and copied exports', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const warnings = [
    'Privacy Policy was not found. This review is incomplete; paste it separately.',
  ];
  await page.route('**/api/fetch-policy', (route) =>
    route.fulfill({ json: { pages: [payload.pages[0]], warnings } })
  );
  await openUrl(page);
  await page.getByLabel('Website address').fill('https://example.com');
  await page.getByRole('button', { name: 'Find & decode policies' }).click();
  await expect(page.locator('.source-warning')).toContainText('incomplete');
  await page.getByRole('button', { name: 'Copy Summary', exact: true }).click();
  await expect(page.locator('.copy-status')).toContainText('Summary copied');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(warnings[0]);
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.print-report')).toContainText(warnings[0]);
});

for (const [code, status, message] of [
  [
    'BLOCKED_URL',
    400,
    'For safety, only public website addresses are supported. Please use Paste Text.',
  ],
  ['NO_POLICY', 422, 'We couldn’t find readable policy text. Please use Paste Text.'],
  ['TIMEOUT', 504, 'The website took too long to load. Try Paste Text.'],
  ['RATE_LIMITED', 429, 'Wait a minute.'],
] as const) {
  test(`friendly ${code} preserves text and offers Paste Text`, async ({ page }) => {
    await page.route('**/api/fetch-policy', (route) =>
      route.fulfill({ status, json: { code, message } })
    );
    await page.goto('/');
    await page.getByLabel('Your policy text').fill('Keep my existing text.');
    await page.getByRole('tab', { name: 'Website URL' }).click();
    await page.getByLabel('Website address').fill('https://example.com');
    await page.getByRole('button', { name: 'Find & decode policies' }).click();
    await expect(page.getByRole('alert')).toContainText(
      status === 429 ? 'Too many website requests' : message
    );
    await page.getByRole('button', { name: 'Use Paste Text instead' }).click();
    await expect(page.getByLabel('Your policy text')).toHaveValue('Keep my existing text.');
    await expect(page.getByLabel('Your policy text')).toBeFocused();
  });
}

test('missing server and network failures are friendly, not JSON parser errors', async ({
  page,
}) => {
  await page.route('**/api/fetch-policy', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<html>Vite</html>' })
  );
  await openUrl(page);
  await page.getByLabel('Website address').fill('https://example.com');
  await page.getByRole('button', { name: 'Find & decode policies' }).click();
  await expect(page.getByRole('alert')).toContainText('Vercel dev');
  await page.unroute('**/api/fetch-policy');
  await page.route('**/api/fetch-policy', (route) => route.abort());
  await page.getByRole('button', { name: 'Find & decode policies' }).click();
  await expect(page.getByRole('alert')).toContainText('Check your connection');
});

test('canceling or switching tabs aborts loading and does not replace existing text', async ({
  page,
}) => {
  await page.route('**/api/fetch-policy', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 600));
    try {
      await route.fulfill({ json: payload });
    } catch {
      /* browser canceled */
    }
  });
  await page.goto('/');
  await page.getByLabel('Your policy text').fill('Existing private text.');
  await page.getByRole('tab', { name: 'Website URL' }).click();
  await page.getByLabel('Website address').fill('https://example.com');
  await page.getByRole('button', { name: 'Find & decode policies' }).click();
  await expect(page.getByRole('button', { name: 'Finding policy pages…' })).toBeDisabled();
  await page.getByRole('button', { name: 'Cancel loading' }).click();
  await expect(page.getByRole('alert')).toContainText('canceled');
  await page.getByRole('tab', { name: 'Paste Text' }).click();
  await expect(page.getByLabel('Your policy text')).toHaveValue('Existing private text.');
  await page.waitForTimeout(700);
  await expect(page.locator('#results')).toHaveCount(0);
});

test('client deadline aborts and leaves a usable retry/fallback form', async ({ page }) => {
  await page.clock.install();
  await page.route('**/api/fetch-policy', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    try {
      await route.abort();
    } catch {
      /* deadline already aborted */
    }
  });
  await openUrl(page);
  await page.getByLabel('Website address').fill('https://example.com');
  await page.getByRole('button', { name: 'Find & decode policies' }).click();
  await page.clock.fastForward(25_001);
  await expect(page.getByRole('alert')).toContainText('too long');
  await expect(page.getByRole('button', { name: 'Find & decode policies' })).toBeEnabled();
});

for (const width of [375, 1440]) {
  test(`URL form and errors are responsive and accessible at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 950 });
    await page.route('**/api/fetch-policy', (route) =>
      route.fulfill({
        status: 422,
        json: { message: 'The site needs JavaScript. Please use Paste Text.' },
      })
    );
    await openUrl(page);
    await page.screenshot({ path: `artifacts/screenshots/website-${width}.png`, fullPage: true });
    await page.getByLabel('Website address').fill('https://example.com');
    await page.getByRole('button', { name: 'Find & decode policies' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true
    );
    const axe = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(
      axe.violations.map((violation) => ({
        id: violation.id,
        nodes: violation.nodes.map((node) => node.target),
      }))
    ).toEqual([]);
  });
}
