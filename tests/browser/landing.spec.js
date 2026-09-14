const { test, expect } = require('@playwright/test');

test('landing positioning, responsive layout, navigation and workspace route', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  // Layout and route checks must not depend on external feeds or services.
  await page.route(/^https?:\/\/(?!127\.0\.0\.1|localhost).*$/, route => route.abort());
  await page.goto('/landing');
  await expect(page).toHaveTitle('Aidstack — Geospatial Operational Intelligence');
  await expect(page.locator('h1')).toHaveText('See what’s changing around the places that matter to you.');
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /your own locations and operational data/);
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.screenshot({ path: `/tmp/aidstack-rewrite-${width}.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole('link', { name: 'Explore Platform', exact: true })).toBeVisible();
  }
  for (const link of await page.locator('nav a[href^="#"]').all()) {
    const target = await link.getAttribute('href');
    await link.click();
    await expect(page.locator(target)).toBeInViewport();
  }
  await page.getByRole('link', { name: 'See How It Works' }).click();
  await expect(page.locator('#how-it-works')).toBeInViewport();
  await page.getByText('Can I assess many sites together?', { exact: true }).click();
  await expect(page.locator('details[open]')).toContainText('more limited than a detailed individual assessment');
  for (const link of await page.getByRole('link', { name: /Explore.*Platform|Open workspace/ }).all()) {
    await expect(link).toHaveAttribute('href', '/app');
  }
  for (const link of await page.getByRole('link', { name: /GitHub/ }).all()) {
    await expect(link).toHaveAttribute('href', 'https://github.com/jmesplana/gdacs_ai');
  }
  expect(errors).toEqual([]);
  await page.getByRole('link', { name: 'Explore Platform', exact: true }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.locator('main')).toBeVisible();
});
