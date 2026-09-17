const { test, expect } = require('@playwright/test');

const areas = [
  { id: 'A', name: 'North area', bounds: { minLng: 7, minLat: 46, maxLng: 8, maxLat: 47 }, geometry: { type: 'Polygon', coordinates: [[[7, 46], [8, 46], [8, 47], [7, 47], [7, 46]]] } },
  { id: 'B', name: 'South area', bounds: { minLng: 8, minLat: 44, maxLng: 9, maxLat: 45 }, geometry: { type: 'MultiPolygon', coordinates: [[[[8, 44], [9, 44], [9, 45], [8, 45], [8, 44]]]] } },
  { id: 'C', name: 'Unselected area', bounds: { minLng: 20, minLat: 20, maxLng: 21, maxLat: 21 }, geometry: { type: 'Polygon', coordinates: [[[20, 20], [21, 20], [21, 21], [20, 21], [20, 20]]] } },
];

async function openForecast(page, districts, analysisHandler) {
  await page.route('**/api/**', route => {
    if (route.request().url().includes('/district-hazard-analysis')) return analysisHandler(route);
    return route.fulfill({ json: route.request().url().includes('/gdacs') ? [] : { reports: [], mapFeatures: [] } });
  });
  await page.route(/^https?:\/\/(?!127\.0\.0\.1|localhost).*$/, route => route.abort());
  await page.goto('/404');
  await page.evaluate(async (districts) => {
    localStorage.setItem('gdacs_onboarding_done', '1');
    await new Promise((resolve, reject) => {
      const request = indexedDB.open('aidstack_workspace', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('workspace');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('workspace', 'readwrite');
        tx.objectStore('workspace').put({ schemaVersion: 1, districts, selectedAnalysisDistricts: districts.slice(0, 2), facilities: [], impactedFacilities: [], acledData: [], config: {} }, 'current');
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
    });
  }, districts);
  await page.goto('/app');
  await page.getByRole('button', { name: 'Forecast', exact: true }).click();
}

function analysisResponse(route) {
  const { districts } = route.request().postDataJSON();
  return route.fulfill({ json: {
    summary: {},
    districts: districts.map(district => ({
      districtId: district.id, districtName: district.name,
      dominantHazard: { type: 'Heat', level: 'low', score: null },
      exposure: { facilityCount: 0, disasterSignalCount: 0, securitySignalCount: 0 },
      rationale: [], drivers: [], sources: [], limitations: [],
    })),
  } });
}

for (const geometryOnly of [false, true]) {
  test(`main app forecasts selected admin areas without sites or disasters (${geometryOnly ? 'geometry' : 'bounds'})`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const districts = areas.map(area => geometryOnly ? { ...area, bounds: undefined } : area);
    const weatherRequest = page.waitForRequest('**/api/weather-forecast');
    const analysisRequest = page.waitForRequest('**/api/district-hazard-analysis');
    await openForecast(page, districts, analysisResponse);
    expect((await weatherRequest).postDataJSON()).toEqual({ latitude: 45.5, longitude: 8, days: 14 });
    const payload = (await analysisRequest).postDataJSON();
    expect(payload.districts.map(area => area.id)).toEqual(['A', 'B']);
    expect(payload.facilities).toEqual([]);
    expect(payload.disasters).toEqual([]);
    await expect(page.getByRole('heading', { name: 'How This Was Calculated' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'North area', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Unselected area', exact: true })).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test('main app shows the forecast failure and allows retry', async ({ page }) => {
  let serviceUnavailable = true;
  await openForecast(page, areas, route => {
    return serviceUnavailable
      ? route.fulfill({ status: 503, json: { error: 'Forecast service temporarily unavailable' } })
      : analysisResponse(route);
  });
  await expect(page.getByRole('alert').filter({ hasText: 'Failed to load predictions: Forecast service temporarily unavailable' })).toBeVisible();
  // Next's development overlay opens for the deliberately logged API error.
  // Hide developer chrome so it does not block the app's retry button.
  await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
  serviceUnavailable = false;
  const retryResponse = page.waitForResponse(response => response.url().includes('/api/district-hazard-analysis') && response.ok());
  await page.getByRole('button', { name: 'Refresh Forecast', exact: true }).click();
  await retryResponse;
  await expect(page.getByRole('heading', { name: 'How This Was Calculated' })).toBeVisible();
});
