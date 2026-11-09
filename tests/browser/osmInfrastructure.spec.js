const { test, expect } = require('@playwright/test');

test('main map retries a busy OSM layer, then retains loaded roads when a different layer fails', async ({ page }) => {
  await page.route('**/api/**', route => route.fulfill({ json: [] }));
  await page.route(/^https?:\/\/(?!127\.0\.0\.1|localhost).*$/, route => route.abort());
  await page.goto('/404');
  await page.evaluate(async () => {
    localStorage.setItem('gdacs_onboarding_done', '1');
    const districts = [{ id: 'A', name: 'Test district', geometryVersion: 'test', properties: {}, geometry: { type: 'Polygon', coordinates: [[[7,46],[8,46],[8,47],[7,47],[7,46]]] } }];
    await new Promise((resolve, reject) => {
      const request = indexedDB.open('aidstack_workspace', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('workspace');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result, tx = db.transaction('workspace', 'readwrite');
        tx.objectStore('workspace').put({ schemaVersion: 1, districts, facilities: [], impactedFacilities: [], acledData: [], config: {}, operationType: 'immunization' }, 'current');
        tx.oncomplete = () => { db.close(); resolve(); };
      };
    });
  });
  let roadCalls = 0;
  await page.route('**/api/osm-infrastructure', async route => {
    const body = route.request().postDataJSON();
    if (body.layers[0] === 'hospitals') return route.fulfill({ status: 400, json: { success: false, error: { message: 'Provider rejected this layer', retryable: false } } });
    if (++roadCalls === 1) {
      expect(body.options.providerAttempt).toBe(0);
      return route.fulfill({ status: 503, json: { success: false, error: { message: 'Service busy', retryAfter: 30, retryable: true } } });
    }
    expect(body.options.providerAttempt).toBe(1);
    await route.fulfill({ json: { success: true, data: { type: 'FeatureCollection', features: [{ type: 'Feature', id: 'way/1', properties: { category: 'road', name: 'Test road', tags: { highway: 'primary' } }, geometry: { type: 'LineString', coordinates: [[7.1,46.1],[7.2,46.1]] } }], metadata: { byLayer: { road: 1 }, requestedLayers: ['roads'], timestamp: new Date().toISOString(), partialFailures: 0 } } } });
  });
  await page.goto('/app');
  await page.getByTitle('Map Layers', { exact: true }).click();
  await page.getByRole('checkbox', { name: 'Test district', exact: true }).check();
  await page.getByRole('checkbox', { name: /Major Roads/ }).check();
  await page.clock.install();
  await page.getByRole('button', { name: 'Load 1 Type for 1 Admin Area', exact: true }).click();
  await expect(page.getByText(/Retrying in 30 seconds/).first()).toBeVisible();
  await page.clock.fastForward(30000);
  await expect(page.getByText('OSM infrastructure loaded', { exact: true })).toBeVisible();
  expect(roadCalls).toBe(2);
  await expect(page.getByText(/Available: 1 features/)).toBeVisible();
  await page.getByRole('checkbox', { name: /Hospitals & Clinics/ }).check();
  await page.getByRole('button', { name: 'Load 1 Type for 1 Admin Area', exact: true }).click();
  await expect(page.getByText('OSM loading finished with errors', { exact: true })).toBeVisible();
  await expect(page.getByText(/1 requests failed. Previously loaded assets were retained/)).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /Major Roads/ })).toBeChecked();
});
