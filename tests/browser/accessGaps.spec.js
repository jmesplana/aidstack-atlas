const { test, expect } = require('@playwright/test');

const districts = [{ id: 'A', name: 'Test district', geometryVersion: 'test-v1', properties: { PCODE: 'A001' }, geometry: { type: 'Polygon', coordinates: [[[7, 46], [8, 46], [8, 47], [7, 47], [7, 46]]] } }];
const facilities = [{ id: 'clinic', name: 'Existing clinic', latitude: 46.1, longitude: 7.1 }, { id: 'candidate', name: 'Outreach site', latitude: 46.1, longitude: 7.14 }];
const roads = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { highway: 'residential' }, geometry: { type: 'LineString', coordinates: [[7.1, 46.1], [7.11, 46.1], [7.12, 46.1], [7.13, 46.1], [7.14, 46.1]] } }] };
const population = 'settlement_id,settlement,latitude,longitude,population\nS1,Near clinic,46.1,7.1,10\nS2,Far settlement,46.1,7.14,200\nS3,Other settlement,46.1,7.13,100\n';

async function seed(page, selectedAreas = districts) {
  await page.route('**/api/**', (route) => route.fulfill({ json: route.request().url().includes('/gdacs') ? [] : { reports: [], mapFeatures: [] } }));
  await page.route(/^https?:\/\/(?!127\.0\.0\.1|localhost).*$/, (route) => route.abort());
  await page.goto('/404');
  await page.evaluate(async ({ districts, facilities }) => {
    localStorage.setItem('gdacs_onboarding_done', '1');
    await new Promise((resolve, reject) => {
      const request = indexedDB.open('aidstack_workspace', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('workspace');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('workspace', 'readwrite');
        tx.objectStore('workspace').put({ schemaVersion: 1, districts, facilities, impactedFacilities: [], acledData: [], config: {}, operationType: 'immunization' }, 'current');
        tx.oncomplete = () => { db.close(); resolve(); };
      };
    });
  }, { districts: selectedAreas, facilities });
  await page.goto('/app');
  await page.getByRole('button', { name: 'Workspace apps', exact: true }).click();
  await expect(page.getByText('1 admin areas', { exact: true })).toHaveCount(1);
}
async function openApp(page, name, install = false, dataMode = 'platform') {
  const card = page.locator('article').filter({ has: page.getByRole('heading', { name, exact: true }) });
  if (install) await card.getByRole('button', { name: 'Install app', exact: true }).click();
  await card.getByRole('button', { name: 'Open', exact: true }).click();
  if (install && name === 'Access Gaps') await page.getByLabel('Analysis data', { exact: true }).selectOption(dataMode);
}
async function calculate(page) {
  await openApp(page, 'Access Gaps', true);
  await expect(page.getByRole('button', { name: 'Calculate access gaps' })).toBeDisabled();
  await page.getByRole('button', { name: 'Select operational areas', exact: true }).click();
  await page.locator('dialog').getByRole('checkbox', { name: 'Test district', exact: true }).check();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByLabel('Analysis data', { exact: true }).selectOption('upload');
  await page.getByLabel('Assessment name').fill('Pilot access assessment');
  await page.getByRole('combobox', { name: 'Travel mode', exact: true }).selectOption('driving');
  await page.getByLabel('Assumed network speed').fill('60');
  await page.getByLabel('Maximum travel time').fill('1');
  await page.getByLabel('Settlement population CSV').setInputFiles({ name: 'population.csv', mimeType: 'text/csv', buffer: Buffer.from(population) });
  await page.getByLabel('Population observation date').fill('2026-10-01');
  await page.getByLabel('Road network GeoJSON').setInputFiles({ name: 'roads.geojson', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(roads)) });
  await page.getByLabel('Road observation date').fill('2026-10-01');
  await page.getByText('Review or change service locations (optional)', { exact: true }).click();
  await page.getByRole('button', { name: 'Use workspace sites in selected areas' }).click();
  await page.getByLabel('Role for Outreach site').selectOption('candidate');
  await page.getByLabel('Include Outreach site in scenario').check();
  await page.getByRole('checkbox', { name: /The population rows do not overlap/ }).check();
  await page.getByRole('button', { name: 'Calculate access gaps' }).click();
  await expect(page.getByRole('heading', { name: 'Modeled access within 1 minutes' })).toBeVisible();
  await expect(page.getByText(/Combined scenario \(1 candidates\): 300 additional/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Publish to workspace' })).toBeDisabled();
}

test('calculates, saves, publishes, maps, attaches and reopens an explicit cross-module snapshot', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await seed(page);
  await calculate(page);
  await page.getByRole('button', { name: 'Save assessment', exact: true }).click();
  await expect(page.getByText('Saved on this device', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back to Apps' }).click();
  await expect(page.getByRole('region', { name: 'Workspace results' })).toHaveCount(0);
  await openApp(page, 'Access Gaps');
  await page.getByLabel('Saved access assessments').selectOption({ label: 'Pilot access assessment (v1)' });
  await page.getByRole('button', { name: 'Publish to workspace' }).click();
  await expect(page.getByRole('region', { name: 'Published assessment' })).toBeVisible();
  await page.getByRole('button', { name: 'Show on workspace map' }).click();
  await expect(page.getByText(/Access Gaps: Pilot access assessment/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Clear access result' })).toBeVisible();
  await page.getByRole('button', { name: 'Workspace apps', exact: true }).click();
  await openApp(page, 'Immunization planning', true);
  for (const [name, value] of Object.entries({ 'Plan name': 'Outreach plan', 'Vaccine / antigen': 'Test antigen', Dose: '1', 'Eligible age / cohort': 'Children', 'Observation period': '2026-Q4', 'Data source / revision': 'Synthetic v1' })) await page.getByLabel(name, { exact: true }).fill(value);
  await page.locator('input[type=file][accept=".csv,.xlsx,.xls"]').setInputFiles({ name: 'immunization.csv', mimeType: 'text/csv', buffer: Buffer.from('settlement_id,settlement,area_code,target_population,children_vaccinated\nS2,Far settlement,A001,20,5\n') });
  await page.getByLabel('Boundary join field').selectOption('PCODE');
  await page.getByRole('button', { name: 'Validate observations' }).click();
  await page.getByRole('checkbox', { name: /The accepted rows represent/ }).check();
  await page.getByRole('button', { name: 'Create plan from 1 valid rows' }).click();
  await page.getByRole('tab', { name: 'Access', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Detach access evidence' })).toHaveCount(0);
  await page.getByLabel('Published access assessment').selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Attach snapshot to plan' }).click();
  await expect(page.getByRole('cell', { name: 'beyond threshold', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: '20', exact: true })).toBeVisible();
  await expect(page.getByText(/0 settlements are unmatched/)).toBeVisible();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Saved on this device · v1')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('access-handoff.png'), fullPage: true });
  await page.reload();
  await page.getByRole('button', { name: 'Workspace apps', exact: true }).click();
  await openApp(page, 'Immunization planning');
  await page.getByLabel('Saved plans', { exact: true }).selectOption({ label: 'Outreach plan (v1)' });
  await page.getByRole('tab', { name: 'Access', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Pilot access assessment', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: '20', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('mobile assessment fits viewport, exports evidence, and input changes invalidate results', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seed(page); await calculate(page);
  expect(await page.locator('dialog').evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export assessment and evidence' }).click();
  expect((await download).suggestedFilename()).toBe('access-assessment.json');
  await page.screenshot({ path: testInfo.outputPath('access-mobile.png'), fullPage: true });
  await page.getByLabel('Maximum travel time').fill('2');
  await expect(page.getByRole('region', { name: 'Access assessment results' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Publish to workspace' })).toBeDisabled();
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('button', { name: 'Close apps' }).click();
  await expect(page.getByRole('heading', { name: 'Access Gaps', exact: true })).toBeVisible();
});

test('population overlay renders a honeycomb with details and survives zooming', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await seed(page);
  await calculate(page);
  const densePopulation = 'settlement_id,settlement,latitude,longitude,population\n' + Array.from({ length: 900 }, (_, i) =>
    `H${i},Population cell ${i + 1},${46.08 + Math.floor(i / 30) * .0016},${7.08 + (i % 30) * .0023},100`).join('\n');
  await page.getByLabel('Settlement population CSV').setInputFiles({ name: 'dense.csv', mimeType: 'text/csv', buffer: Buffer.from(densePopulation) });
  await expect(page.getByRole('checkbox', { name: /The population rows do not overlap/ })).not.toBeChecked();
  await page.getByRole('checkbox', { name: /The population rows do not overlap/ }).check();
  await page.getByRole('button', { name: 'Calculate access gaps' }).click();
  const map = page.getByRole('region', { name: 'Access assessment results' }).locator('.leaflet-container');
  const table = page.getByRole('region', { name: 'Population result table' });
  await expect(table.locator('tbody tr')).toHaveCount(50);
  await table.getByLabel('Search population results').fill('Population cell 900');
  await expect(table.locator('tbody tr')).toHaveCount(1);
  await table.getByLabel('Search population results').fill('');
  await expect(map.getByLabel('Population hexagon legend')).toBeVisible();
  await map.scrollIntoViewIfNeeded();
  await map.screenshot({ path: testInfo.outputPath('honeycomb.png') });
  const expectPopupAboveMap = async () => {
    const popup = map.locator('.leaflet-popup-pane .leaflet-popup');
    await expect(popup).toBeVisible();
    await expect(map.locator('.leaflet-pan-anim')).toHaveCount(0);
    // Visibility alone does not detect a popup covered by another map layer.
    expect(await popup.evaluate(element => {
      const bounds = element.querySelector('.leaflet-popup-content-wrapper').getBoundingClientRect();
      return [.2, .5, .8].every(x => [.2, .5, .8].every(y =>
        element.contains(document.elementFromPoint(bounds.left + bounds.width * x, bounds.top + bounds.height * y))));
    })).toBe(true);
  };
  for (const zoomButton of [null, 'Zoom in', 'Zoom out']) {
    if (zoomButton) {
      const beforeZoom = await map.locator('.access-service-point').first().getAttribute('d');
      await map.getByRole('button', { name: zoomButton, exact: true }).click();
      await expect(map.locator('.access-service-point').first()).not.toHaveAttribute('d', beforeZoom);
      await expect(map).not.toHaveClass(/leaflet-zoom-anim/);
    }
    for (const [index, name] of ['Existing clinic', 'Outreach site'].entries()) {
      await map.locator('.access-service-point').nth(index).click();
      await expect(map.locator('.leaflet-popup')).toContainText(name);
      await expectPopupAboveMap();
      if (!zoomButton && index === 0) await map.screenshot({ path: testInfo.outputPath('service-popup-above-hexagons.png') });
      await map.getByRole('button', { name: 'Close popup' }).click();
      await expect(map.locator('.leaflet-popup')).toHaveCount(0);
    }
  }
  const bounds = await map.boundingBox();
  await map.click({ position: { x: bounds.width / 2, y: bounds.height / 2 } });
  await expect(map.locator('.leaflet-popup')).toContainText('Hexagons group nearby population points');
  await expectPopupAboveMap();
  await map.screenshot({ path: testInfo.outputPath('hexagon-popup-above-map.png') });
  await map.getByRole('button', { name: 'Close popup' }).click();
  expect(errors).toEqual([]);
});

async function loadAutomatic(page, requests) {
  const { accessScopeKey } = require('../../lib/planning/accessInputs.js');
  await page.route('**/api/access-inputs', async route => {
    const body = route.request().postDataJSON();
    requests.push(body.kind);
    const metadata = { scopeKey: accessScopeKey(body.districts, body.cellSize, body.year, body.cohort) + (body.group ? `:${body.group}` : ''), timestamp: new Date().toISOString() };
    await route.fulfill({ json: body.kind === 'population' ? {
      metadata, year: 2025, cellSize: body.cellSize, missingCells: 1, zeroCells: 2,
      points: [[7.1, 10.25], [7.14, 200.5], [7.13, 100.25]].map(([longitude, population], i) => ({ settlement_id: `cell${i}`, settlement: `Population cell ${i + 1}`, latitude: 46.1, longitude, population, demandType: 'worldpop-cell', area_id: 'A' }))
    } : { metadata, routingReady: true, roads, sites: [{ ...facilities[0], role: 'existing' }] } });
  });
  await openApp(page, 'Access Gaps', true);
  await page.getByRole('button', { name: 'Select operational areas', exact: true }).click();
  await page.getByLabel('Search operational areas').fill('Test');
  await page.getByRole('button', { name: 'Select matching areas' }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Remove Test district' })).toBeVisible();
  await page.getByRole('button', { name: 'Load WorldPop and OSM for selected areas' }).click();
  await expect(page.getByText(/Ready: 3 population cells/)).toBeVisible();
}

test('models WorldPop and OSM without uploading points or roads; caches, suggests, saves and invalidates', async ({ page }) => {
  await seed(page);
  const requests = [];
  await loadAutomatic(page, requests);
  await page.getByRole('combobox', { name: 'Travel mode', exact: true }).selectOption('driving');
  await page.getByLabel('Assumed network speed').fill('60');
  await page.getByLabel('Maximum travel time').fill('1');
  await page.getByRole('checkbox', { name: /Use these mapped facilities/ }).check();
  await page.getByRole('button', { name: 'Calculate access gaps' }).click();
  await expect(page.getByRole('heading', { name: 'Population cell results' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Suggested outreach near Population cell 2', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save assessment', exact: true }).click();
  await expect(page.getByText('Saved on this device', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Publish to workspace' }).click();
  await expect(page.getByRole('region', { name: 'Published assessment' })).toBeVisible();
  await page.getByRole('button', { name: 'Back to Apps' }).click();
  await openApp(page, 'Access Gaps');
  await page.getByLabel('Saved access assessments').selectOption({ label: 'Access assessment (v1)' });
  await expect(page.getByRole('heading', { name: 'Population cell results' })).toBeVisible();
  await page.getByRole('button', { name: 'Reload platform data' }).click();
  await expect(page.getByText(/Ready: 3 population cells/)).toBeVisible();
  expect(requests.filter(kind => kind === 'population')).toHaveLength(2);
  expect(requests.filter(kind => kind === 'roads')).toHaveLength(8);
  await page.getByRole('combobox', { name: 'Population cell size', exact: true }).selectOption('500');
  await expect(page.getByRole('button', { name: 'Calculate access gaps' })).toBeDisabled();
  await expect(page.getByRole('region', { name: 'Access assessment results' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Remove Test district' }).click();
  await expect(page.getByRole('button', { name: 'Load WorldPop and OSM for selected areas' })).toBeDisabled();
});

test('keeps government place names and feedback without coordinates as optional context', async ({ page }) => {
  await seed(page);
  await loadAutomatic(page, []);
  await page.getByText('Government catch-up lists and community feedback (optional, no coordinates needed)', { exact: true }).click();
  await page.getByLabel('Catch-up list CSV or Excel').setInputFiles({ name: 'government.csv', mimeType: 'text/csv', buffer: Buffer.from('place,area_code,target\nVillage X,A001,20\n') });
  await page.getByLabel('Community feedback CSV or Excel').setInputFiles({ name: 'feedback.csv', mimeType: 'text/csv', buffer: Buffer.from('place,area_code,feedback\nVillage X,A001,Transport costs prevent visits\n') });
  await page.getByRole('checkbox', { name: /Use these mapped facilities/ }).check();
  await page.getByRole('button', { name: 'Calculate access gaps' }).click();
  const review = page.getByRole('region', { name: 'Area planning review' });
  await expect(review.getByText('Transport costs prevent visits', { exact: false })).toBeVisible();
  await expect(review.getByRole('cell', { name: '20', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Population cell results' })).toBeVisible();
});

test('unavailable platform data prevents calculations and reports a retryable error', async ({ page }) => {
  await seed(page);
  await page.route('**/api/access-inputs', route => route.fulfill({ status: 502, json: { error: 'WorldPop cells could not be loaded. Try a smaller area or a different year.' } }));
  await openApp(page, 'Access Gaps', true);
  await page.getByRole('button', { name: 'Select operational areas', exact: true }).click();
  await page.getByRole('button', { name: 'Select matching areas' }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: 'Load WorldPop and OSM for selected areas' }).click();
  await expect(page.locator('dialog').getByRole('alert')).toContainText('WorldPop cells could not be loaded');
  await expect(page.getByRole('button', { name: 'Calculate access gaps' })).toBeDisabled();
});

test('models a selected admin above 10,000 km² by batching internally without changing its boundary', async ({ page }) => {
  const { accessScopeKey } = require('../../lib/planning/accessInputs.js');
  const { planAccessBatches } = require('../../lib/planning/accessBatches.js');
  const { fingerprint } = require('../../lib/planning/geography.js');
  const large = { ...districts[0], geometry: { type: 'Polygon', coordinates: [[[7, 46], [9, 46], [9, 47], [7, 47], [7, 46]]] } };
  const planned = planAccessBatches([large]);
  expect(planned.batches.length).toBeGreaterThan(1);
  await seed(page, [large]);
  const calls = [];
  await page.route('**/api/access-inputs', async route => {
    const body = route.request().postDataJSON(); calls.push(body);
    expect(body.districts.map(d => d.id)).toEqual(['A']);
    const metadata = { scopeKey: accessScopeKey(body.districts, body.cellSize, body.year, body.cohort) + (body.group ? `:${body.group}` : ''), timestamp: new Date().toISOString() };
    const ring = body.districts[0].geometry.coordinates[0];
    const longitude = (Math.min(...ring.map(p => p[0])) + Math.max(...ring.map(p => p[0]))) / 2;
    const latitude = (Math.min(...ring.map(p => p[1])) + Math.max(...ring.map(p => p[1]))) / 2;
    await route.fulfill({ json: body.kind === 'population' ? { metadata, year: 2025, cellSize: body.cellSize, missingCells: 0, zeroCells: 0,
      points: [{ settlement_id: 'cell', settlement: 'Cell', latitude, longitude, population: 10.5, area_id: 'A', demandType: 'worldpop-cell' }] }
      : { metadata, routingReady: true, roads, sites: [{ ...facilities[0], role: 'existing' }] } });
  });
  await openApp(page, 'Access Gaps', true);
  await page.getByRole('button', { name: 'Select operational areas', exact: true }).click();
  await page.getByRole('button', { name: 'Select matching areas' }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: 'Load WorldPop and OSM for selected areas' }).click();
  await expect(page.getByText(`Ready: ${planned.batches.length} population cells`, { exact: false })).toBeVisible({ timeout: 20000 });
  await expect(page.getByText(/Adjusted from 1 km for this selection/)).toBeVisible();
  expect(calls.length).toBe(planned.batches.length * 5);
  await expect(page.getByRole('button', { name: 'Remove Test district' })).toBeVisible();
  await page.getByRole('checkbox', { name: /Use these mapped facilities/ }).check();
  await page.getByRole('button', { name: 'Calculate access gaps' }).click();
  await expect(page.getByRole('heading', { name: 'Population cell results' })).toBeVisible();
  await page.getByRole('button', { name: 'Save assessment', exact: true }).click();
  await expect(page.getByText('Saved on this device', { exact: true })).toBeVisible();
  const result = await page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('aidstack_planning_apps');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const records = db.transaction('modulePlans').objectStore('modulePlans').getAll();
      records.onsuccess = () => { resolve(records.result.find(p => p.moduleId === 'access-gaps').result); db.close(); };
    };
  }));
  expect(result.scope.areas).toEqual([{ id: 'A', name: large.name, geometryVersion: fingerprint(large.geometry) }]);
  expect(result.totals.population).toBe(planned.batches.length * 10.5);
  expect(result.settlements.every(s => s.areaId === 'A')).toBe(true);
});

test('shows animated loading beside the data button and cancels an in-flight download', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seed(page);
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/api/access-inputs', async route => { await gate; await route.abort().catch(() => {}); });
  await openApp(page, 'Access Gaps', true);
  await page.getByRole('button', { name: 'Select operational areas', exact: true }).click();
  await page.getByRole('button', { name: 'Select matching areas' }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: 'Load WorldPop and OSM for selected areas' }).click();
  const loading = page.getByRole('status', { name: 'Loading analysis data' });
  await expect(loading).toBeVisible();
  await expect(loading).toContainText('WorldPop cells: batch 1 of 1');
  await expect(loading).toContainText('OSM major roads: loading group 1 of 4');
  expect(await loading.locator('[aria-hidden=true]').evaluate(el => getComputedStyle(el).animationName)).not.toBe('none');
  await page.screenshot({ path: testInfo.outputPath('loading-mobile.png') });
  await page.getByRole('button', { name: 'Cancel loading', exact: true }).click();
  await expect(loading).toHaveCount(0);
  await expect(page.locator('dialog').getByRole('alert')).toHaveText('Loading cancelled.');
  await expect(page.getByRole('button', { name: 'Calculate access gaps' })).toBeDisabled();
  release();
});

test('shows provider retry progress and recovers without changing the selected admin', async ({ page }) => {
  const { accessScopeKey } = require('../../lib/planning/accessInputs.js');
  await seed(page);
  let roadCalls = 0;
  await page.route('**/api/access-inputs', async route => {
    const body = route.request().postDataJSON();
    if (body.kind === 'roads' && ++roadCalls === 1) {
      expect(body.providerAttempt).toBe(0);
      await route.fulfill({ status: 503, json: { code: 'OSM_PROVIDER_BUSY', error: 'The download service is busy', retryAfter: 30 } });
      return;
    }
    if (body.kind === 'roads' && roadCalls === 2) expect(body.providerAttempt).toBe(1);
    const metadata = { scopeKey: accessScopeKey(body.districts, body.cellSize, body.year, body.cohort) + (body.group ? `:${body.group}` : ''), timestamp: new Date().toISOString() };
    await route.fulfill({ json: body.kind === 'population' ? { metadata, year: 2025, cellSize: body.cellSize, missingCells: 0, zeroCells: 0,
      points: [{ settlement_id: 'cell', settlement: 'Cell', latitude: 46.1, longitude: 7.1, population: 20, area_id: 'A', demandType: 'worldpop-cell' }] }
      : { metadata, routingReady: true, roads, sites: [{ ...facilities[0], role: 'existing' }] } });
  });
  await openApp(page, 'Access Gaps', true);
  await page.getByRole('button', { name: 'Select operational areas', exact: true }).click();
  await page.getByRole('button', { name: 'Select matching areas' }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.clock.install();
  await page.getByRole('button', { name: 'Load WorldPop and OSM for selected areas' }).click();
  await expect(page.getByRole('status', { name: 'Loading analysis data' })).toContainText('retrying in 30 seconds');
  await page.clock.fastForward(30000);
  await expect(page.getByText(/Ready: 1 population cells/)).toBeVisible({ timeout: 20000 });
  expect(roadCalls).toBe(5);
  await expect(page.getByRole('button', { name: 'Remove Test district' })).toBeVisible();
  await expect(page.getByRole('status', { name: 'Loading analysis data' })).toHaveCount(0);
});

test('Earth Engine estimates load without OSM roads, compare outreach, save and publish the distinct method', async ({ page }, testInfo) => {
  test.setTimeout(120000);
  await seed(page);
  const requests = [];
  await page.route('**/api/access-inputs', async route => {
    const body=route.request().postDataJSON(); requests.push(body.kind);
    expect(body.kind).toBe('population');
    const {accessScopeKey}=require('../../lib/planning/accessInputs.js');
    await route.fulfill({json:{year:2025,cellSize:body.cellSize,missingCells:0,zeroCells:0,metadata:{timestamp:new Date().toISOString(),scopeKey:accessScopeKey(body.districts,body.cellSize,body.year,body.cohort)},points:[
      {settlement_id:'one',settlement:'Cell 1',latitude:46.1,longitude:7.1,population:10,area_id:'A',demandType:'worldpop-cell'},
      {settlement_id:'two',settlement:'Cell 2',latitude:46.1,longitude:7.14,population:200,area_id:'A',demandType:'worldpop-cell'},
      {settlement_id:'three',settlement:'Cell 3',latitude:46.1,longitude:7.13,population:100,area_id:'A',demandType:'worldpop-cell'}
    ]}});
  });
  await page.route('**/api/access-surface', async route => {
    const body=route.request().postDataJSON();requests.push(body.action);
    await route.fulfill({json:body.action==='facilities'?{sites:[{...facilities[0],role:'existing'}],source:{name:'Healthsites snapshot'},metadata:{timestamp:new Date().toISOString()}}:{times:body.sites[0][0]===7.1?[0,80,90]:[80,0,10],connectedSites:body.sites.map(()=>true)}});
  });
  await openApp(page,'Access Gaps',true,'earth-engine');
  await expect(page.getByLabel('Assumed network speed')).toHaveCount(0);
  await expect(page.getByText(/2019 travel surface at approximately 1 km/)).toBeVisible();
  await page.getByLabel('Assessment name').fill('Surface assessment');
  await page.getByRole('button',{name:'Select operational areas',exact:true}).click();
  await page.getByRole('button',{name:'Select matching areas'}).click();
  await page.getByRole('button',{name:'Done',exact:true}).click();
  await page.getByRole('button',{name:'Load WorldPop and facilities for selected areas'}).click();
  await expect(page.getByText(/Ready: 3 population cells/)).toBeVisible({timeout:20000});
  await page.getByRole('checkbox',{name:/Use these mapped facilities/}).check();
  await page.getByRole('button',{name:'Calculate access gaps'}).click();
  await expect(page.getByRole('heading',{name:'Population cell results'})).toBeVisible({timeout:20000});
  const brief = page.getByRole('region', {name:'Outreach decision brief'});
  await expect(brief).toContainText('Provisional');
  await expect(brief).toContainText('300 people previously beyond the threshold');
  await page.getByRole('button', {name:'Use recommended sites in combined scenario'}).click();
  await expect(page.getByText(/Combined scenario \(1 candidates\): 300 additional/)).toBeVisible();
  await brief.screenshot({path:testInfo.outputPath('outreach-decision-brief.png')});
  const exportEvent=page.waitForEvent('download');
  await page.getByRole('button',{name:'Export decision brief',exact:true}).click();
  const decisionExport=await exportEvent;
  expect(decisionExport.suggestedFilename()).toBe('outreach-decision-brief.txt');
  const decisionText=require('fs').readFileSync(await decisionExport.path(),'utf8');
  expect(decisionText).toContain('300 additional people');
  expect(decisionText).toContain('Healthsites snapshot');
  await page.getByText('Review or change service locations (optional)',{exact:true}).click();
  await page.getByRole('checkbox',{name:/Include Suggested outreach/}).check();
  await page.getByRole('button',{name:'Calculate access gaps'}).click();
  await expect(page.getByText(/Combined scenario \(1 candidates\): 300 additional/)).toBeVisible({timeout:20000});
  await page.getByRole('button',{name:'Save assessment',exact:true}).click();
  await expect(page.getByText('Saved on this device',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Publish to workspace'}).click();
  await expect(page.getByRole('region',{name:'Published assessment'})).toBeVisible();
  expect(requests.filter(r=>r==='roads')).toHaveLength(0);
  expect(requests.filter(r=>r==='facilities')).toHaveLength(1);
  expect(requests.filter(r=>r==='travel')).toHaveLength(2);
  await expect(page.getByText('Roads: Not downloaded for this model or selection')).toBeVisible();
  const saved=await page.evaluate(()=>new Promise((resolve,reject)=>{
    const req=indexedDB.open('aidstack_planning_apps');req.onerror=()=>reject(req.error);req.onsuccess=()=>{const db=req.result;const rows=db.transaction('modulePlans').objectStore('modulePlans').getAll();rows.onsuccess=()=>{resolve(rows.result.filter(p=>p.result?.method==='friction-surface-v1').map(p=>({moduleId:p.moduleId,result:p.result})));db.close();};};
  }));
  expect(saved.some(p=>p.moduleId==='@workspace-results')).toBe(true);
  expect(saved.every(p=>p.result.sources.travelSurface.year===2019&&p.result.settings.surfaceResolutionM===927.67)).toBe(true);
  expect(saved.every(p=>p.result.decision.steps[0].additionalPopulation===300)).toBe(true);
  await page.getByLabel('Analysis data',{exact:true}).selectOption('platform');
  await expect(page.getByRole('region',{name:'Access assessment results'})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Load WorldPop and OSM for selected areas'})).toBeVisible();
});

test('age and sex selection reloads the correct denominator and survives saved assessment reopening', async ({ page }) => {
  await seed(page);
  const payloads=[];
  page.on('request', request=>{ if(request.url().endsWith('/api/access-inputs')) payloads.push(request.postDataJSON()); });
  await loadAutomatic(page, []);
  await expect(page.getByRole('combobox',{name:'Population year',exact:true})).toHaveValue('current');
  await page.getByLabel('Target age group').selectOption('under5');
  await page.getByRole('combobox',{name:'Population sex',exact:true}).selectOption('female');
  await expect(page.getByRole('button',{name:'Calculate access gaps'})).toBeDisabled();
  await page.getByRole('button',{name:'Load WorldPop and OSM for selected areas'}).click();
  await expect(page.getByText(/Ready: 3 population cells/)).toBeVisible();
  expect(payloads.filter(p=>p.kind==='population').at(-1).cohort).toMatchObject({age:'under5',sex:'female',bands:['f_00','f_01']});
  await page.getByRole('checkbox',{name:/Use these mapped facilities/}).check();
  await page.getByRole('button',{name:'Calculate access gaps'}).click();
  await expect(page.getByRole('region',{name:'Outreach decision brief'})).toContainText('Under 5 years · female');
  await page.getByRole('button',{name:'Save assessment',exact:true}).click();
  await expect(page.getByText('Saved on this device',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Back to Apps'}).click();
  await openApp(page,'Access Gaps');
  await page.getByLabel('Saved access assessments').selectOption({label:'Access assessment (v1)'});
  await expect(page.getByLabel('Target age group')).toHaveValue('under5');
  await expect(page.getByRole('combobox',{name:'Population sex',exact:true})).toHaveValue('female');
  await expect(page.getByRole('region',{name:'Outreach decision brief'})).toContainText('Under 5 years · female');
});

test('building footprints load automatically at neighborhood zoom and keep service popups clickable', async ({ page }, testInfo) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await seed(page); await calculate(page);
  let calls = 0;
  await page.route('**/api/building-footprints', async route => {
    calls++;
    expect(route.request().postDataJSON().z).toBe(13);
    await route.fulfill({ json: { type: 'FeatureCollection', features: [{ type: 'Feature', id: 'way/123', properties: { building: 'yes' }, geometry: { type: 'Polygon', coordinates: [[[7.1,46.1],[7.101,46.1],[7.101,46.101],[7.1,46.101],[7.1,46.1]]] } }], metadata: { source: 'OpenStreetMap', timestamp: '2026-11-09T00:00:00Z' } } });
  });
  const map = page.getByRole('region', { name: 'Access assessment results' }).locator('.leaflet-container');
  await map.getByRole('checkbox', { name: 'Building footprints', exact: true }).check();
  await expect(map.getByText('Zoom in to neighborhood level to load building outlines.')).toBeVisible();
  expect(calls).toBe(0);
  await map.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect(map.getByText('1 building outline in the visible selected area. Mapping coverage varies.')).toBeVisible({ timeout: 20000 });
  expect(calls).toBeGreaterThan(0);
  await map.locator('.access-service-point').first().click();
  await expect(map.locator('.leaflet-popup-pane .leaflet-popup')).toContainText('Existing clinic');
  await map.screenshot({ path: testInfo.outputPath('building-footprints.png') });
  await map.getByRole('button', { name: 'Close popup' }).click();
  await map.getByRole('checkbox', { name: 'Building footprints', exact: true }).uncheck();
  await expect(map.locator('.leaflet-buildingFootprints-pane canvas')).toHaveCount(0);
  expect(errors).toEqual([]);
});
