const { test, expect } = require('@playwright/test');
const { readFileSync } = require('node:fs');

const cutOff='2026-09-08';
const zones=['Example North','Example Central','Example South'];
const boundaries=zones.map((name,i)=>({id:name,name,properties:{nom:name,province:'Example province'},geometry:{type:'Polygon',coordinates:[[[29+i*.4,1],[29.35+i*.4,1],[29.35+i*.4,1.4],[29+i*.4,1.4],[29+i*.4,1]]]}}));
const series=(id,level,locations,role='cases')=>({id,metricId:level==='national'?`national_cumulative_confirmed_${role}`:'cumulative_confirmed_cases',label:`Example ${level} ${role}`,unit:'people',purpose:role,kind:'cumulative',level,status:'ready',source:'Synthetic browser-test fixture',records:locations.flatMap((location,z)=>Array.from({length:57},(_,i)=>({location,date:new Date(Date.parse(cutOff)-(56-i)*86400000).toISOString().slice(0,10),value:(i+2)*(z+1)*(role==='deaths'?1:3)})))});

async function open(page, irregular = false, history = false) {
  await page.route('**/api/**',r=>r.fulfill({json:r.request().url().includes('/gdacs')?[]:{reports:[],mapFeatures:[]}}));
  await page.route(/^https?:\/\/(?!127\.0\.0\.1|localhost).*$/,r=>r.abort());
  await page.route('**/api/outbreak-data?*',r=>{
    const kind=new URL(r.request().url()).searchParams.get('kind');
    const caseSeries=(...args)=>{const d=series(...args);if(history&&args[0]==='areas')d.records=d.records.map(r=>({...r,value:r.location===zones[0]?(r.date<'2026-09-06'?0:3):r.location===zones[1]?10:r.value}));return irregular?{...d,records:d.records.filter(r=>r.date!=='2026-09-01')}:d;};
    return r.fulfill({json:kind==='indicators'?{datasets:[caseSeries('areas','health_zone',zones),caseSeries('national','national',['Example country']),series('deaths','national',['Example country'],'deaths'),{...series('recoveries','national',['Example country'],'deaths'),metricId:'national_cumulative_recovered_cases',label:'National cumulative recoveries'},{...series('isolation','national',['Example country'],'deaths'),metricId:'national_suspected_cases_in_isolation',label:'National suspected cases in isolation',kind:'snapshot'}]}:kind==='mines'?{data:[{id:'example-mine',date:'2026-08-01',latitude:1.2,longitude:29.2}],source:'Synthetic mine fixture'}:kind==='relocations'?{routes:[{origin:zones[0],destination:zones[1],value:100},{origin:zones[1],destination:zones[2],value:50}],start:'2026-08-01',end:'2026-08-31',unit:'estimated relocations',source:'Synthetic mobility fixture'}:{products:[]}});
  });
  await page.goto('/404');
  await page.evaluate(async districts=>{
    localStorage.setItem('gdacs_onboarding_done','1');
    await new Promise((resolve,reject)=>{
      const request=indexedDB.open('aidstack_workspace',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('workspace');
      request.onerror=()=>reject(request.error);
      request.onsuccess=()=>{const db=request.result,tx=db.transaction('workspace','readwrite');tx.objectStore('workspace').put({schemaVersion:1,districts,facilities:[],impactedFacilities:[],acledData:[{event_id:'example-event',event_date:'2026-09-01',latitude:1.2,longitude:29.2,fatalities:2}],config:{},operationType:'general'},'current');tx.oncomplete=()=>{db.close();resolve();};};
    });
  },boundaries);
  await page.goto('/app');await page.getByRole('button',{name:'Workspace apps',exact:true}).click();
  await expect(page.getByRole('dialog').getByText(`${boundaries.length} admin areas`,{exact:true})).toBeVisible();
  const card=page.locator('article').filter({has:page.getByRole('heading',{name:'Outbreak Response',exact:true})});
  await card.getByRole('button',{name:'Install app',exact:true}).click();await card.getByRole('button',{name:'Open',exact:true}).click();
}

test('integrated Sitrep prints all five sections, retains report edits and keeps mobile navigation in reach',async({page},testInfo)=>{
  await open(page);
  await page.getByLabel('Reporting cut-off',{exact:true}).fill('2026-09-10');
  await page.getByRole('button',{name:'Data',exact:true}).click();await page.getByRole('button',{name:/^Connected sources/}).click();
  await page.getByLabel('Optional public source preset').selectOption('drc');
  await expect(page.getByRole('button',{name:'Refresh data',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'Situation',exact:true}).click();
  await expect(page.getByRole('region',{name:'Overall snapshot',exact:true})).toContainText('174');
  expect((await page.getByRole('navigation',{name:'Outbreak sections'}).boundingBox()).y).toBeLessThan(250);
  await page.getByRole('region',{name:'Outbreak response'}).evaluate(e=>e.scrollTop=0);
  await page.screenshot({path:testInfo.outputPath('situation-desktop.png')});
  await page.getByRole('navigation',{name:'Outbreak sections'}).getByRole('button',{name:'Sitrep',exact:true}).click();
  const preview=page.getByRole('article',{name:'Sitrep print preview'});
  await expect(preview.locator('h2').filter({hasText:/^[1-5]\./})).toHaveText([
    '1. Epidemiological situation & weekly trend','2. Population mobility','3. Mining and operational geography','4. Security and access','5. Operational implications & immediate actions'
  ]);
  await expect(preview.getByRole('img',{name:/Reported case/})).toBeVisible();
  await expect(preview.locator('#sitrep-epidemiology caption').filter({hasText:'Reporting periods through'})).toContainText('Reporting periods through 2026-09-08');
  await expect(preview).toContainText('series coverage 2026-07-14–2026-09-08');
  await expect(preview.getByRole('heading',{name:'Key messages',exact:true})).toHaveCount(0);
  const metrics=preview.getByLabel('Latest reported indicators');
  expect((await metrics.boundingBox()).height).toBeLessThan(110);
  await expect(metrics.locator('article')).toHaveCount(5);
  const positions=await metrics.locator('article').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().top));
  expect(new Set(positions).size).toBe(1);
  await page.getByRole('button',{name:'Edit report',exact:true}).click();
  await page.getByLabel('Prepared by',{exact:true}).fill('Example response team — synthetic demonstration');
  await page.getByLabel('Bottom line for decision-makers',{exact:false}).fill('Example report for layout verification. All values in this preview are synthetic.');
  const editor=page.getByRole('complementary',{name:'Report editor'});
  await editor.getByText('1. Epidemiological situation & weekly trend',{exact:true}).click();
  await page.getByLabel('Epidemiological situation & weekly trend — coordinator note').fill('Confirm staffing with the area teams.');
  await editor.getByText('2. Population mobility',{exact:true}).click();
  await page.getByLabel('Mobility view',{exact:true}).selectOption('outflow');
  await page.getByLabel('Focus area for movement maps',{exact:true}).selectOption(zones[0]);
  await page.getByLabel('Add another mobility map').selectOption(zones[1]);
  await expect(preview.getByRole('heading',{name:/Destinations from Example/})).toHaveCount(2);
  await page.getByRole('button',{name:'Edit report',exact:true}).click();
  await page.getByLabel('I have reviewed this snapshot and its evidence for sharing.').check();
  await page.getByRole('button',{name:/Save snapshot/}).click();
  await page.getByText('Other formats',{exact:true}).click();
  const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Export briefing HTML with visuals'}).click();
  const downloaded=await pending;expect(downloaded.suggestedFilename()).toContain('2026_W37');
  const html=readFileSync(await downloaded.path(),'utf8');
  expect(html).not.toContain('Choose a saved snapshot above');expect(html).not.toContain('<button');expect(html).toContain('Confirm staffing with the area teams.');
  const printable=await page.context().newPage();await printable.setContent(html);
  await expect(printable.getByRole('article',{name:'Sitrep print preview'})).toHaveCSS('font-family','Arial, sans-serif');
  await expect(printable.getByRole('columnheader').first()).toHaveCSS('background-color','rgb(33, 79, 112)');
  expect((await printable.getByLabel('Latest reported indicators').boundingBox()).height).toBeLessThan(110);
  await printable.pdf({path:testInfo.outputPath('example-sitrep.pdf'),preferCSSPageSize:true,printBackground:true});
  await printable.screenshot({path:testInfo.outputPath('sitrep-preview.png'),fullPage:true});await printable.close();
  await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Situation',exact:true}).click();
  const app=page.getByRole('region',{name:'Outbreak response'});
  expect((await page.getByRole('navigation',{name:'Outbreak sections'}).boundingBox()).y).toBeLessThan(220);
  expect(await app.evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);
  await page.screenshot({path:testInfo.outputPath('situation-mobile.png')});
  await page.getByRole('navigation',{name:'Outbreak sections'}).getByRole('button',{name:'Sitrep',exact:true}).click();
  await expect(page.getByRole('button',{name:'Print / save PDF',exact:true})).toBeVisible();
  await expect(preview).toContainText('Confirm staffing with the area teams.');
  expect(await preview.evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);
});

test('confirmed edits autosave as a recoverable draft without adding report versions',async({page})=>{
  await open(page);
  await page.getByText('Report settings & saved versions',{exact:true}).click();
  await page.getByLabel('Outbreak / operational scope').fill('Draft recovery example');
  await expect(page.getByRole('status').filter({hasText:/Draft saved/})).toBeVisible();
  await expect(page.getByLabel('Saved snapshots').locator('option')).toHaveCount(1);
  await page.getByRole('button',{name:'Close apps',exact:true}).click();
  await page.getByRole('button',{name:'Workspace apps',exact:true}).click();
  await page.locator('article').filter({has:page.getByRole('heading',{name:'Outbreak Response',exact:true})}).getByRole('button',{name:'Open',exact:true}).click();
  await page.getByRole('button',{name:'Resume draft',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Draft recovery example',exact:true})).toBeVisible();
  await page.getByRole('navigation',{name:'Outbreak sections'}).getByRole('button',{name:'Sitrep',exact:true}).click();
  await expect(page.getByRole('article',{name:'Sitrep print preview'})).toContainText('Draft recovery example');
});


test('Sitrep renders actual six-day comparisons when the seven-day report is absent',async({page})=>{
  await open(page,true);
  await page.getByLabel('Reporting cut-off',{exact:true}).fill('2026-09-10');
  await page.getByRole('button',{name:'Data',exact:true}).click();
  await page.getByRole('button',{name:/^Connected sources/}).click();
  await page.getByLabel('Optional public source preset').selectOption('drc');
  await expect(page.getByRole('button',{name:'Refresh data',exact:true})).toBeEnabled();
  await page.getByRole('navigation',{name:'Outbreak sections'}).getByRole('button',{name:'Sitrep',exact:true}).click();
  const preview=page.getByRole('article',{name:'Sitrep print preview'});
  await expect(preview).toContainText('Over 6 days (2026-09-02–2026-09-08)');
  await expect(preview).toContainText('Example South: +54');
  await expect(preview).toContainText('6 days; 3/3 areas have paired observations');
  const national=preview.locator('#sitrep-epidemiology tr').filter({hasText:'Example country (national)'});
  await expect(national).toContainText('2026-09-02–2026-09-08 · 6 days');
  await expect(national).toContainText('Not comparable');
  await expect(preview.getByRole('img',{name:'Reported case changes for Example country'})).toContainText('09-02 · 6d');
});


test('province coverage, first reports, unchanged history and horizon charts appear in the report',async({page},testInfo)=>{
  await open(page,false,true);
  await page.getByLabel('Reporting cut-off',{exact:true}).fill('2026-09-10');
  await page.getByRole('button',{name:'Data',exact:true}).click();
  await page.getByRole('button',{name:/^Connected sources/}).click();
  await page.getByLabel('Optional public source preset').selectOption('drc');
  await expect(page.getByRole('button',{name:'Refresh data',exact:true})).toBeEnabled();
  await page.getByRole('navigation',{name:'Outbreak sections'}).getByRole('button',{name:'Sitrep',exact:true}).click();
  const preview=page.getByRole('article',{name:'Sitrep print preview'});
  const coverage=preview.getByRole('region',{name:'Province case coverage',exact:true});
  await expect(coverage).toContainText('3 / 3');
  await expect(coverage).toContainText('100.0%');
  await expect(coverage).toContainText('535');
  expect(await coverage.evaluate(el=>el.previousElementSibling.querySelector('svg')!==null)).toBe(true);
  const message=preview.getByRole('region',{name:'Key message',exact:true});
  await expect(message).toContainText('Example North (2026-09-06; previously reported zero)');
  await expect(message).toContainText('Example Central: 8 complete weeks');
  const history=preview.getByRole('region',{name:'Health-zone reporting history',exact:true});
  await expect(history).toContainText('≥42 days unchanged — verify surveillance');
  await expect(history.getByRole('link',{name:'WHO end-of-outbreak criteria'})).toBeVisible();
  const horizon=preview.getByRole('region',{name:'Health-zone horizon charts',exact:true});
  await expect(horizon.getByRole('img',{name:'Health-zone horizon chart — Example province',exact:true})).toBeVisible();
  const cell=horizon.locator('g[tabindex="0"]').filter({hasText:'Example North · 2026-W36'}).first();
  await cell.focus();
  await expect(horizon.locator('[aria-live]')).toContainText('2026-W36');
  await horizon.screenshot({path:testInfo.outputPath('province-horizon.png')});
  await page.setViewportSize({width:390,height:844});
  expect(await preview.evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);
});
