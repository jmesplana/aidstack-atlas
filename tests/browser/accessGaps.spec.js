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
const counts = [10, 190, 100];
const shape = longitude => ({ type: 'Polygon', coordinates: [[[longitude-.001,46.099],[longitude+.001,46.099],[longitude+.001,46.101],[longitude-.001,46.101],[longitude-.001,46.099]]] });
async function installMocks(page, events = []) {
  await page.route('**/api/access-inputs', async route => {
    const body = route.request().postDataJSON(); events.push(body);
    const { accessScopeKey } = require('../../lib/planning/accessInputs.js');
    const factor = body.cohort?.age === 'all' && body.cohort?.sex === 'both' ? 2 : body.cohort?.sex === 'male' ? .5 : body.cohort?.sex === 'female' ? 1 : 1.5;
    const points = [7.1,7.14,7.13].map((longitude,i) => ({ settlement_id:`cell${i}`, settlement:`Population cell ${i+1}`, latitude:46.1,longitude,population:counts[i]*factor,area_id:'A',demandType:'worldpop-cell',populationGeometry:shape(longitude) }));
    const metadata = { timestamp:new Date().toISOString(),scopeKey:accessScopeKey(body.districts,body.cellSize,body.year,body.kind==='population'?body.cohort:{})+(body.group?`:${body.group}`:'') };
    await route.fulfill({ json:body.kind==='population'?{metadata,year:2025,cellSize:body.cellSize,points,totalPopulation:points.reduce((s,p)=>s+p.population,0),missingCells:0,zeroCells:0}:{metadata,routingReady:true,roads,sites:[{...facilities[0],role:'existing'}]} });
  });
  await page.route('**/api/access-surface', async route => {
    const body=route.request().postDataJSON();events.push(body);
    await route.fulfill({json:body.action==='facilities'?{sites:[{...facilities[0],role:'existing'}],source:{name:'Test mapped healthcare'},metadata:{timestamp:new Date().toISOString()}}:{times:body.sites[0][0]===7.1?[0,80,90]:[80,0,10],connectedSites:body.sites.map(()=>true)}});
  });
  await page.route('**/api/access-demographics', async route => {
    const body=route.request().postDataJSON();events.push(body);
    const { DEMOGRAPHIC_BANDS, demographicKey }=require('../../lib/worldpop/demographics.js');
    if(body.level==='area') {
      const bands=Object.fromEntries(DEMOGRAPHIC_BANDS.map(band=>[band,1]));Object.assign(bands,{f_00:100,f_01:200,m_00:50,m_01:100});
      await route.fulfill({json:{year:2025,scopeKey:demographicKey(body.districts,body.year,body.dataType),areas:body.districts.map(area=>({id:String(area.id),bands,totalPopulation:600})),source:'WorldPop test'}});
    } else {
      await route.fulfill({json:{year:body.year,cohort:body.cohort,cells:body.cells.map(cell=>{const index=Number(JSON.parse(cell.id)[1].replace('cell',''));const bands=Object.fromEntries(DEMOGRAPHIC_BANDS.map(band=>[band,1]));Object.assign(bands,{f_00:counts[index]/3,f_01:counts[index]*2/3,m_00:counts[index]/6,m_01:counts[index]/3});return {id:cell.id,bands};})}});
    }
  });
  await page.route('**/api/worldpop-tiles', async route => {const body=route.request().postDataJSON();events.push({tiles:true,...body});await route.fulfill({json:{year:body.year,cohort:body.cohort,tileUrl:'http://127.0.0.1:3000/test-population/{z}/{x}/{y}.png',visParams:{max:100,palette:['#ffffcc','#800026']}}});});
  await page.route('**/test-population/**',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#fd8d3c"/></svg>'}));
}
async function openApp(page,name='Access Gaps',install=true) {
  const card=page.locator('article').filter({has:page.getByRole('heading',{name,exact:true})});
  if(install)await card.getByRole('button',{name:'Install app',exact:true}).click();
  await card.getByRole('button',{name:'Open',exact:true}).click();
}
async function chooseArea(page) {
  await page.getByRole('button',{name:'Select operational areas',exact:true}).click();
  await page.getByRole('button',{name:'Select matching areas'}).click();
  await page.getByRole('button',{name:'Done',exact:true}).click();
  await page.getByRole('button',{name:'Continue',exact:true}).click();
}
async function step(page,name) {await page.getByRole('navigation',{name:'Assessment steps'}).getByRole('button',{name:new RegExp(name)}).click();}
async function closePanel(page,title) {await page.getByRole('button',{name:`Close ${title}`,exact:true}).click();}
async function settings(page,{model='earth-engine',age='all',sex='both'}={}) {
  await openApp(page);await chooseArea(page);
  await page.getByLabel('Assessment name',{exact:true}).fill('Pilot access assessment');
  await page.getByLabel('Target age group',{exact:true}).selectOption(age);
  await page.getByLabel('Population sex',{exact:true}).selectOption(sex);
  if(model!=='earth-engine') {await page.getByText('Advanced options',{exact:true}).click();await page.getByLabel('Analysis data',{exact:true}).selectOption(model);}
}
async function loadAndRun(page) {
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await page.getByRole('button',{name:/^Load (WorldPop|population and travel)/}).click();
  await expect(page.getByText(/Ready: 3 population cells/)).toBeVisible();
  await page.getByRole('checkbox',{name:/Use these mapped facilities/}).check();
  await page.getByRole('button',{name:'Calculate access gaps',exact:true}).click();
  await expect(page.getByRole('region',{name:'Access assessment results'})).toBeVisible();
}
async function savePanel(page) {await page.getByRole('button',{name:'Save / Share',exact:true}).first().click();return page.getByRole('dialog',{name:'Save and share',exact:true});}
async function evidence(page,tab='Decision brief') {await page.getByRole('button',{name:'View evidence',exact:true}).click();const panel=page.getByRole('dialog',{name:'Assessment evidence',exact:true});await panel.getByRole('button',{name:tab,exact:true}).click();return panel;}

test('four-step flow shows one task at a time and keeps technical evidence out of the result overview',async({page},testInfo)=>{
  await seed(page);await installMocks(page);await openApp(page);
  await expect(page.getByRole('button',{name:'Continue',exact:true})).toBeDisabled();
  await expect(page.getByLabel('Target age group')).toHaveCount(0);
  await chooseArea(page);
  await expect(page.getByLabel('Target age group')).toBeVisible();
  await expect(page.getByLabel('Analysis data')).not.toBeVisible();
  await expect(page.getByLabel('Population preview')).toContainText('600');
  await page.screenshot({path:testInfo.outputPath('guided-define-assessment.png'),fullPage:true});
  await page.getByLabel('Number of new locations',{exact:true}).selectOption('automatic');
  await page.getByLabel('Target modeled coverage (%)').fill('90');
  await loadAndRun(page);
  await expect(page.getByText(/Consider 1 additional location/)).toBeVisible();
  await expect(page.getByRole('table')).toHaveCount(0);
  await expect(page.getByLabel('Map access view')).toHaveValue('recommended');
  await expect(page.getByRole('region',{name:'Access assessment results'}).locator('.leaflet-container')).toBeInViewport({ratio:.5});
  await page.screenshot({path:testInfo.outputPath('guided-initial-result.png'),fullPage:true});
  await page.getByRole('button',{name:'Suggested outreach near Population cell 2',exact:true}).click();
  await expect(page.locator('dialog .leaflet-popup')).toContainText('Proposed site 1');
  const detail=await evidence(page);
  await expect(detail.getByRole('region',{name:'Outreach decision brief'})).toContainText('90% coverage target');
  await detail.getByRole('button',{name:'Candidate comparison',exact:true}).click();
  await expect(detail.getByText(/Combined scenario \(0 candidates\)/)).toBeVisible();
  await closePanel(page,'Assessment evidence');
  await page.screenshot({path:testInfo.outputPath('guided-recommendation.png'),fullPage:true});
});

test('selected age and sex stay consistent in preview, context, map, access breakdown, save and reopen',async({page},testInfo)=>{
  test.setTimeout(120000);
  const events=[];await seed(page);await installMocks(page,events);await settings(page,{age:'under5',sex:'female'});
  await expect(page.getByLabel('Population preview')).toContainText('300');
  await page.getByRole('button',{name:'View age and sex breakdown',exact:true}).click();
  const populationPanel=page.getByRole('dialog',{name:'Population breakdown',exact:true});
  await expect(populationPanel.getByRole('table').locator('tbody tr')).toHaveCount(2);
  await expect(populationPanel.getByRole('table')).toContainText('Not selected');
  await populationPanel.getByRole('checkbox',{name:/Show all ages/}).check();
  await expect(populationPanel.getByRole('table').locator('tbody tr')).toHaveCount(20);
  await expect(populationPanel).toContainText('map and assessment still use Under 5 years · female');
  await closePanel(page,'Population breakdown');
  await expect(page.getByLabel('Population sex',{exact:true})).toHaveValue('female');
  await loadAndRun(page);
  await page.getByRole('checkbox',{name:'WorldPop population',exact:true}).check();
  await expect(page.getByLabel('WorldPop overlay status')).toContainText('ready');
  expect(events.find(event=>event.tiles)).toMatchObject({year:2025,cohort:{age:'under5',sex:'female'}});
  await page.getByRole('button',{name:'Population breakdown',exact:true}).click();
  await populationPanel.getByRole('button',{name:'Who has access?',exact:true}).click();
  await populationPanel.getByRole('button',{name:'Load access population breakdown',exact:true}).click();
  await expect(populationPanel.getByRole('table')).toContainText('Access by age group · Under 5 years · female');
  await expect(populationPanel.getByRole('table').locator('tbody tr')).toHaveCount(2);
  expect(events.find(event=>event.level==='cell').cohort).toMatchObject({age:'under5',sex:'female'});
  await page.screenshot({path:testInfo.outputPath('access-age-sex-breakdown.png'),fullPage:true});
  await closePanel(page,'Population breakdown');
  const save=await savePanel(page);await save.getByLabel('Decision owner').fill('Area team');await save.getByRole('button',{name:'Save assessment',exact:true}).click();
  await expect(save.getByText('Saved on this device',{exact:true})).toBeVisible();
  const download=page.waitForEvent('download');await save.getByRole('button',{name:'Export assessment and evidence',exact:true}).click();
  const exported=JSON.parse(require('fs').readFileSync(await (await download).path(),'utf8'));
  expect(exported.settings.populationCohort).toMatchObject({age:'under5',sex:'female'});expect(exported.demographics.cells).toHaveLength(3);
  await closePanel(page,'Save and share');await page.getByRole('button',{name:'Back to Apps'}).click();await openApp(page,'Access Gaps',false);
  await page.getByLabel('Saved access assessments').selectOption({label:'Pilot access assessment (v1)'});
  await page.getByRole('button',{name:'Population breakdown',exact:true}).click();await populationPanel.getByRole('button',{name:'Who has access?',exact:true}).click();
  await expect(populationPanel.getByRole('table')).toContainText('Under 5 years · female');
  await expect(populationPanel.getByRole('button',{name:'Load access population breakdown'})).toHaveCount(0);
});

test('changing the selected population invalidates old results while browsing context does not',async({page})=>{
  const events=[];await seed(page);await installMocks(page,events);await settings(page,{age:'under5',sex:'female'});await loadAndRun(page);
  await step(page,'Define assessment');await page.getByLabel('Population sex',{exact:true}).selectOption('male');
  await expect(page.getByLabel('Population preview')).toContainText('150');
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await expect(page.getByRole('button',{name:'Calculate access gaps',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Load WorldPop and facilities for selected areas',exact:true}).click();await expect(page.getByText(/Ready: 3 population cells/)).toBeVisible();
  await page.getByRole('checkbox',{name:/Use these mapped facilities/}).check();await page.getByRole('button',{name:'Calculate access gaps',exact:true}).click();
  const detail=await evidence(page);await expect(detail).toContainText('Under 5 years · male');
  expect(events.filter(event=>event.kind==='population').at(-1).cohort).toMatchObject({age:'under5',sex:'male'});
});

test('custom service assessments load population without adopting healthcare locations',async({page})=>{
  const events=[];await seed(page);await installMocks(page,events);await settings(page);
  await page.getByLabel('Service locations',{exact:true}).selectOption('other');await page.getByLabel('Service being assessed').fill('Water points');
  await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByRole('button',{name:'Load population and travel data',exact:true}).click();
  await expect(page.getByText(/Ready: 3 population cells/)).toContainText('0 included services');
  expect(events.filter(event=>event.action==='facilities')).toHaveLength(0);
  await page.getByRole('button',{name:'Review or change service locations',exact:true}).click();
  const panel=page.getByRole('dialog',{name:'Service locations',exact:true});
  await panel.getByLabel('Service sites CSV').setInputFiles({name:'water.csv',mimeType:'text/csv',buffer:Buffer.from('id,name,latitude,longitude,role\nw1,Water point,46.1,7.1,existing\n')});
  await closePanel(page,'Service locations');await page.getByRole('checkbox',{name:/Use these mapped facilities/}).check();await page.getByRole('button',{name:'Calculate access gaps',exact:true}).click();
  const save=await savePanel(page);const download=page.waitForEvent('download');await save.getByRole('button',{name:'Export assessment and evidence'}).click();const data=JSON.parse(require('fs').readFileSync(await(await download).path(),'utf8'));
  expect(data.existingSites.map(site=>site.name)).toEqual(['Water point']);expect(data.settings.serviceName).toBe('Water points');
});

test('mobile loading stays visible, cancels cleanly and keeps selected areas',async({page},testInfo)=>{
  await page.setViewportSize({width:390,height:844});await seed(page);await installMocks(page);await settings(page,{model:'platform'});
  let release;const gate=new Promise(resolve=>{release=resolve;});await page.route('**/api/access-inputs',async route=>{await gate;await route.abort().catch(()=>{});});
  await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByRole('button',{name:'Load WorldPop and OSM for selected areas',exact:true}).click();
  await expect(page.getByLabel('Action progress')).toBeInViewport();await expect(page.getByRole('button',{name:'Cancel loading',exact:true})).toBeInViewport();
  await page.screenshot({path:testInfo.outputPath('guided-loading-mobile.png')});
  await page.getByRole('button',{name:'Cancel loading',exact:true}).click();await expect(page.getByRole('alert').filter({hasText:'Loading cancelled'})).toBeVisible();release();
  await step(page,'Choose area');await expect(page.getByRole('button',{name:'Remove Test district'})).toBeVisible();
});

test('population breakdown rejects a mismatched response and never replaces the assessment',async({page})=>{
  await seed(page);await installMocks(page);await settings(page,{age:'under5'});await loadAndRun(page);
  await page.route('**/api/access-demographics',async route=>{const body=route.request().postDataJSON();if(body.level==='area')return route.fallback();await route.fulfill({json:{year:2024,cohort:body.cohort,cells:body.cells.map(cell=>({id:cell.id,bands:{}}))}});});
  await page.getByRole('button',{name:'Population breakdown',exact:true}).click();const panel=page.getByRole('dialog',{name:'Population breakdown',exact:true});await panel.getByRole('button',{name:'Who has access?'}).click();await panel.getByRole('button',{name:'Load access population breakdown'}).click();
  await expect(panel.getByRole('alert')).toContainText('did not match');await expect(panel.getByRole('table')).toHaveCount(0);
  await closePanel(page,'Population breakdown');await expect(page.getByRole('region',{name:'Access assessment results'})).toBeVisible();
});

test('map layers and recommended sites remain interactive in the mobile flow',async({page},testInfo)=>{
  await page.setViewportSize({width:390,height:844});await seed(page);await installMocks(page);await settings(page);await loadAndRun(page);
  const map=page.getByRole('region',{name:'Access assessment results'}).locator('.leaflet-container');
  await page.getByRole('checkbox',{name:'WorldPop population',exact:true}).check();await expect(page.getByLabel('WorldPop overlay status')).toContainText('ready');
  await page.getByRole('checkbox',{name:'Access hexagons',exact:true}).uncheck();await expect(map.getByLabel('Population hexagon legend')).toHaveCount(0);
  await page.getByRole('button',{name:'Expand map',exact:true}).click();await expect(page.getByRole('button',{name:'Restore map size'})).toHaveAttribute('aria-expanded','true');
  await page.getByRole('button',{name:'Suggested outreach near Population cell 2',exact:true}).click();await expect(map.locator('.leaflet-popup')).toContainText('Proposed site 1');
  await map.getByRole('button',{name:'Close popup'}).click();await page.getByRole('checkbox',{name:'WorldPop population',exact:true}).uncheck();await expect(map.locator('.access-worldpop-tiles')).toHaveCount(0);await expect(map.locator('.access-service-point')).toHaveCount(2);
  await page.getByRole('checkbox',{name:'Access hexagons',exact:true}).check();await expect(map.getByLabel('Population hexagon legend')).toContainText('Recommended option');
  await page.getByLabel('Map access view').selectOption('baseline');await expect(map.getByLabel('Population hexagon legend')).toContainText('Current access');
  expect(await page.locator('dialog').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
  await page.screenshot({path:testInfo.outputPath('guided-map-mobile.png'),fullPage:true});
});

async function calculateUploaded(page) {
  await settings(page,{model:'upload'});
  await page.getByLabel('Travel mode',{exact:true}).selectOption('driving');await page.getByLabel('Assumed network speed').fill('60');await page.getByLabel('Maximum travel time').fill('1');
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await page.getByLabel('Settlement population CSV').setInputFiles({name:'population.csv',mimeType:'text/csv',buffer:Buffer.from(population)});
  await page.getByLabel('Population observation date').fill('2026-10-01');
  await page.getByLabel('Road network GeoJSON').setInputFiles({name:'roads.geojson',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(roads))});
  await page.getByLabel('Road observation date').fill('2026-10-01');
  await page.getByRole('button',{name:'Review or change service locations',exact:true}).click();const panel=page.getByRole('dialog',{name:'Service locations',exact:true});
  await panel.getByRole('button',{name:'Use workspace sites in selected areas'}).click();await panel.getByLabel('Role for Outreach site').selectOption('candidate');await panel.getByLabel('Include Outreach site in scenario').check();await closePanel(page,'Service locations');
  await page.getByRole('checkbox',{name:/The population rows do not overlap/}).check();await page.getByRole('button',{name:'Calculate access gaps',exact:true}).click();await expect(page.getByRole('region',{name:'Access assessment results'})).toBeVisible();
}

test('calculates, saves, publishes, maps, attaches and reopens an explicit cross-module snapshot', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await seed(page);
  await installMocks(page);
  await calculateUploaded(page);
  const saveDialog = await savePanel(page);
  await page.getByRole('button', { name: 'Save assessment', exact: true }).click();
  await expect(saveDialog.getByText('Saved on this device', { exact: true })).toBeVisible();
  await closePanel(page, 'Save and share');
  await page.getByRole('button', { name: 'Back to Apps' }).click();
  await expect(page.getByRole('region', { name: 'Workspace results' })).toHaveCount(0);
  await openApp(page, 'Access Gaps', false);
  await page.getByLabel('Saved access assessments').selectOption({ label: 'Pilot access assessment (v1)' });
  await savePanel(page);
  await page.getByRole('button', { name: 'Publish to workspace' }).click();
  await closePanel(page, 'Save and share');
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
  await openApp(page, 'Immunization planning', false);
  await page.getByLabel('Saved plans', { exact: true }).selectOption({ label: 'Outreach plan (v1)' });
  await page.getByRole('tab', { name: 'Access', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Pilot access assessment', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: '20', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});


test('road-network assessments reuse road downloads when the age selection changes',async({page})=>{
  const events=[];await seed(page);await installMocks(page,events);await settings(page,{model:'platform',age:'under5',sex:'female'});
  await loadAndRun(page);
  const roadRequests=events.filter(event=>event.kind==='roads').length;
  expect(roadRequests).toBeGreaterThan(0);
  await step(page,'Define assessment');await page.getByLabel('Target age group',{exact:true}).selectOption('under1');
  await loadAndRun(page);
  expect(events.filter(event=>event.kind==='roads')).toHaveLength(roadRequests);
  expect(events.filter(event=>event.kind==='population').at(-1).cohort.age).toBe('under1');
});

test('local target lists and community feedback remain available in evidence',async({page})=>{
  await seed(page);await installMocks(page);await settings(page);await loadAndRun(page);
  await step(page,'Review data');await page.getByRole('button',{name:'Add local context (optional)'}).click();
  await page.getByText('Government catch-up lists and community feedback (optional, no coordinates needed)',{exact:true}).click();
  await page.getByLabel('Catch-up list CSV or Excel').setInputFiles({name:'government.csv',mimeType:'text/csv',buffer:Buffer.from('place,area_code,target\nVillage X,A001,20\n')});
  await page.getByLabel('Community feedback CSV or Excel').setInputFiles({name:'feedback.csv',mimeType:'text/csv',buffer:Buffer.from('place,area_code,feedback\nVillage X,A001,Transport costs prevent visits\n')});
  await closePanel(page,'Local context');await page.getByRole('button',{name:'Calculate access gaps',exact:true}).click();
  await expect(page.getByRole('region',{name:'Access assessment results'})).toBeVisible();
  await evidence(page,'Sources and context');
  const review=page.getByRole('region',{name:'Area planning review'});
  await expect(review).toContainText('Transport costs prevent visits');await expect(review.getByRole('cell',{name:'20',exact:true})).toBeVisible();
});

test('WorldPop overlay errors and mismatched years cannot replace the selected population',async({page})=>{
  await seed(page);await installMocks(page);await settings(page);await loadAndRun(page);
  let attempts=0;
  await page.route('**/api/worldpop-tiles',async route=>{
    const body=route.request().postDataJSON();
    await route.fulfill(++attempts===1?{status:503,json:{error:'Population tile provider unavailable.'}}:{json:{year:2024,cohort:body.cohort,tileUrl:'http://127.0.0.1:3000/wrong-year/{z}/{x}/{y}.png'}});
  });
  await page.getByRole('checkbox',{name:'WorldPop population',exact:true}).check();
  await expect(page.getByRole('alert',{name:'WorldPop overlay status'})).toContainText('provider unavailable');
  await page.getByRole('button',{name:'Retry population overlay',exact:true}).click();
  await expect(page.getByRole('alert',{name:'WorldPop overlay status'})).toContainText('does not match');
  await expect(page.locator('dialog .access-worldpop-tiles')).toHaveCount(0);
  await page.getByRole('checkbox',{name:'WorldPop population',exact:true}).uncheck();
  await expect(page.getByRole('region',{name:'Access assessment results'})).toBeVisible();
});
