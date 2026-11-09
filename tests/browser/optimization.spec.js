const { test, expect } = require('@playwright/test');

async function seed(page, extra = {}) {
  await page.route('**/api/**', route => route.fulfill({ json: [] }));
  await page.route(/^https?:\/\/(?!127\.0\.0\.1|localhost).*$/, route => route.abort());
  await page.goto('/404');
  await page.evaluate(async extra => {
    localStorage.setItem('gdacs_onboarding_done', '1');
    await new Promise((resolve, reject) => {
      const request = indexedDB.open('aidstack_workspace', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('workspace');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result, tx = db.transaction('workspace', 'readwrite');
        tx.objectStore('workspace').put({ schemaVersion: 1, districts: [{ id: 'A', name: 'Test district', properties: {}, geometry: { type: 'Polygon', coordinates: [[[7,46],[8,46],[8,47],[7,47],[7,46]]] } }], facilities: [], impactedFacilities: [], acledData: [], config: {}, ...extra }, 'current');
        tx.oncomplete = () => { db.close(); resolve(); };
      };
    });
  }, extra);
}

test('impact assessment discards a delayed response after the time filter changes to no events', async ({ page }) => {
  await seed(page, { facilities: [{ id: 'clinic', name: 'Clinic', latitude: 46.5, longitude: 7.5 }] });
  const applied = [], requests = [];
  page.on('console', message => { if (message.text().startsWith('Applied impact assessment with')) applied.push(message.text()); });
  const oldDate = new Date(Date.now() - 5 * 86400000).toISOString();
  await page.route('**/api/gdacs', route => route.fulfill({ json: [{ id: 'old', title: 'Older earthquake 5.0', eventType: 'EQ', alertLevel: 'Green', latitude: 46.5, longitude: 7.5, pubDate: oldDate, fromDate: oldDate }] }));
  let held;
  await page.route('**/api/impact_assessment', async route => {
    requests.push(route.request().postDataJSON());
    if (!held) { held = route; return; }
    await route.fulfill({ json: { impactedFacilities: [], statistics: { impactedFacilityCount: 0 } } });
  });
  await page.goto('/app');
  await page.getByTitle('Filters', { exact: true }).click();
  const range = page.getByLabel('Event time range');
  await range.selectOption('all');
  await range.selectOption('7d');
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0].disasters).toHaveLength(1);
  await range.selectOption('24h');
  await expect(range).toHaveValue('24h');
  await held.fulfill({ json: { impactedFacilities: [], statistics: { impactedFacilityCount: 99 } } });
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1].disasters).toEqual([]);
  await expect.poll(() => applied).toEqual(['Applied impact assessment with 24h date filter (0 disasters)']);
});

test('OSM popup labels are literal text and category toggles retain marker icons', async ({ page }) => {
  await seed(page);
  const name = '<img src=x onerror="window.osmInjected=true">Clinic';
  await page.route('**/api/osm-infrastructure', route => route.fulfill({ json: { success: true, data: { type: 'FeatureCollection', features: [{ type: 'Feature', id: 'node/1', properties: { category: 'hospital', name, osmType: 'node', osmId: 1 }, geometry: { type: 'Point', coordinates: [7.5,46.5] } }], metadata: { requestedLayers: ['hospitals'], byLayer: { hospital: 1 }, timestamp: new Date().toISOString() } } } }));
  await page.goto('/app');
  await page.getByTitle('Map Layers', { exact: true }).click();
  await page.getByRole('checkbox', { name: 'Test district', exact: true }).check();
  await page.getByRole('checkbox', { name: /Hospitals & Clinics/ }).check();
  await page.getByRole('button', { name: 'Load 1 Type for 1 Admin Area', exact: true }).click();
  const marker = page.locator('.osm-marker');
  await expect(marker).toHaveCount(1);
  await marker.evaluate(node => { window.originalOSMIcon = node.firstElementChild; });
  await page.getByRole('button', { name: 'Hide', exact: true }).click();
  await expect(marker).toHaveCount(0);
  await page.getByRole('button', { name: 'Show', exact: true }).click();
  await expect(marker).toHaveCount(1);
  expect(await marker.evaluate(node => node.firstElementChild === window.originalOSMIcon)).toBe(true);
  await page.getByTitle('Map Layers', { exact: true }).click();
  await marker.click();
  const popup = page.locator('.leaflet-popup-content');
  await expect(popup).toContainText(name);
  await expect(popup.locator('img')).toHaveCount(0);
  expect(await page.evaluate(() => window.osmInjected)).toBeUndefined();
  await expect(popup.getByRole('link')).toHaveAttribute('href', 'https://www.openstreetmap.org/node/1');
});
