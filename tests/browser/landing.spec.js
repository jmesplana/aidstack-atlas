const { test, expect } = require('@playwright/test');

test('landing positioning, responsive layout, navigation and workspace route', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  // Layout and route checks must not depend on external feeds or services.
  await page.route(/^https?:\/\/(?!127\.0\.0\.1|localhost).*$/, route => route.abort());
  await page.goto('/landing');
  await expect(page).toHaveTitle('Aidstack Atlas — Geospatial Operational Intelligence');
  await expect(page.locator('h1')).toHaveText('See what’s changing around the places that matter to you.');
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /your own locations and operational data/);
  const hero = page.getByRole('figure', { name: 'Interactive illustrative workspace', exact: true });
  const portfolio = page.getByRole('figure', { name: 'Interactive illustrative portfolio', exact: true });
  await hero.getByRole('button', { name: 'Select Site C on map' }).click();
  await expect(hero.getByRole('heading', { name: 'Site C', exact: true })).toBeVisible();
  await expect(portfolio.getByRole('button', { name: 'Select Site C on map' })).toHaveAttribute('aria-pressed', 'true');
  await portfolio.getByRole('button', { name: /Site B GO No current impacts detected/ }).click();
  await expect(hero.getByRole('heading', { name: 'Site B', exact: true })).toHaveCount(1);
  await expect(page.locator('#evidence')).toContainText('Site B / Review context');
  await hero.getByRole('button', { name: 'Select Site A on map' }).focus();
  await page.keyboard.press('Enter');
  await expect(hero.getByRole('heading', { name: 'Site A', exact: true })).toBeVisible();
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const id of ['D', 'C', 'B', 'A']) {
      await hero.getByRole('button', { name: `Select Site ${id} on map` }).click();
      await expect(hero.getByRole('heading', { name: `Site ${id}`, exact: true })).toBeVisible();
    }
    await page.locator('h1').click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `/tmp/aidstack-atlas-design-${width}.png`, fullPage: true });
    await page.screenshot({ path: `/tmp/aidstack-atlas-hero-${width}.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole('link', { name: 'Explore Platform', exact: true })).toBeVisible();
  }
  await page.locator('#evidence summary').filter({ hasText: 'Security & infrastructure' }).click();
  await expect(page.locator('#evidence details[open]').filter({ hasText: 'Security & infrastructure' })).toContainText('does not establish current access');
  await page.locator('#data-evidence summary').filter({ hasText: 'ACLED' }).click();
  await expect(page.locator('#data-evidence details[open]')).toContainText('Upload conflict-event exports');
  for (const link of await page.locator('nav a[href^="#"]').all()) {
    const target = await link.getAttribute('href');
    await link.click();
    await expect(page.locator(target)).toBeInViewport();
  }
  await page.getByRole('link', { name: 'See How It Works' }).click();
  await expect(page.locator('#how-it-works')).toBeInViewport();
  await page.getByText('Can I assess many sites together?', { exact: true }).click();
  await expect(page.locator('details').filter({ has: page.getByText('Can I assess many sites together?', { exact: true }) })).toContainText('more limited than a detailed individual assessment');
  for (const link of await page.getByRole('link', { name: /Explore.*Platform|Open workspace/ }).all()) {
    await expect(link).toHaveAttribute('href', '/app');
  }
  for (const link of await page.getByRole('link', { name: /GitHub/ }).all()) {
    await expect(link).toHaveAttribute('href', 'https://github.com/jmesplana/aidstack-atlas');
  }
  expect(errors).toEqual([]);
  await page.getByRole('link', { name: 'Explore Platform', exact: true }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.locator('main')).toBeVisible();
  await expect(page).toHaveTitle('Aidstack Atlas — Geospatial Operational Intelligence');
});
