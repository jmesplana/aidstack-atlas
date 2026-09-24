const { test, expect } = require('@playwright/test');
async function openOutbreak(page, boundaries=[], sourceHandler=null, acledData=[]) {
  await page.route('**/api/**',route=>route.fulfill({json:route.request().url().includes('/gdacs')?[]:{reports:[],mapFeatures:[]}}));
  await page.route(/^https?:\/\/(?!127\.0\.0\.1|localhost).*$/,route=>route.abort());
  if(sourceHandler)await page.route('**/api/outbreak-data?*',sourceHandler);
  await page.clock.install({time:new Date('2026-09-23T12:00:00Z')});
  await page.goto('/404');
  await page.evaluate(async ({districts,acledData})=>{
    localStorage.setItem('gdacs_onboarding_done','1');
    await new Promise((resolve,reject)=>{
      const request=indexedDB.open('aidstack_workspace',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('workspace');
      request.onerror=()=>reject(request.error);
      request.onsuccess=()=>{
        const db=request.result,tx=db.transaction('workspace','readwrite');
        tx.objectStore('workspace').put({schemaVersion:1,districts,facilities:[],impactedFacilities:[],acledData,config:{},operationType:'general'},'current');
        tx.oncomplete=()=>{db.close();resolve();};
      };
    });
  },{districts:boundaries,acledData});
  await page.goto('/app');
  await page.getByRole('button',{name:'Workspace apps',exact:true}).click();
  await expect(page.getByRole('dialog').getByText(`${boundaries.length} admin areas`,{exact:true})).toBeVisible();
  const card=page.locator('article').filter({has:page.getByRole('heading',{name:'Outbreak Response',exact:true})});
  await card.getByRole('button',{name:'Install app',exact:true}).click();
  await card.getByRole('button',{name:'Open',exact:true}).click();
  await expect(page.getByRole('region',{name:'Outbreak response'})).toBeVisible();

}

const boundaries=['A','B','C'].map((nom,i)=>({id:nom,name:nom,properties:{nom,province:i<2?'Province One':'Province Two',district:i<2?'District One':'District Two',insp_sitrep:{cumulative_confirmed_cases:{_date:'2026-09-21',cumulative_confirmed_cases:i===0?4:0}}},geometry:{type:'Polygon',coordinates:[[[29+i,1],[30+i,1],[30+i,2],[29+i,2],[29+i,1]]]}}));
function dataset(value=4){return {id:'insp:cumulative_confirmed_cases',metricId:'cumulative_confirmed_cases',purpose:'cases',origin:'public',status:'ready',level:'health_zone',kind:'cumulative',label:'Confirmed cases',unit:'people',records:[{location:'A',date:'2026-09-14',value:0},{location:'B',date:'2026-09-14',value:0},{location:'A',date:'2026-09-21',value},{location:'B',date:'2026-09-21',value:0},{location:'C',date:'2026-09-21',value:null}]};}
test('dashboard links coverage, first reports, map callouts, trends and sitrep',async({page},testInfo)=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await openOutbreak(page,boundaries,route=>{const kind=new URL(route.request().url()).searchParams.get('kind');return route.fulfill({json:kind==='indicators'?{datasets:[dataset()]}:kind==='mines'?{data:[]}:kind==='relocations'?{routes:[]}:{products:[]}});});
  await expect(page.getByRole('heading',{name:'Situation dashboard',exact:true})).toBeVisible();
  const coverage=page.getByRole('region',{name:'Dashboard province coverage'});
  await expect(coverage.getByRole('row').filter({hasText:'Province One'})).toContainText('50.0%');
  await expect(coverage.getByRole('row').filter({hasText:'Province Two'})).toHaveCount(0);
  await page.getByRole('region',{name:'First positive reports',exact:true}).getByRole('button',{name:/A ·/}).click();
  await expect(page.getByLabel('Health zone',{exact:true})).toHaveValue('A');
  await expect(page.getByLabel('Selected health zone',{exact:true})).toContainText('Cumulative cases: 4');
  await expect(page.getByLabel('Health-zone map callout',{exact:true})).toBeVisible();
  await expect(page.getByRole('region',{name:'Dashboard health-zone trends'})).toContainText('Province One');
  await page.getByRole('button',{name:'Clear selection',exact:true}).click();
  await page.getByLabel('All zones with data',{exact:true}).check();
  await expect(page.getByRole('region',{name:'Dashboard health-zone trends'})).toContainText('All matched health zones');
  await page.getByRole('region',{name:'Dashboard health-zone trends'}).getByRole('img',{name:/Province One \/ B/}).first().waitFor();
  await page.getByLabel('Health zone',{exact:true}).selectOption('A');
  await page.getByRole('region',{name:'Outbreak response',exact:true}).evaluate(el=>el.scrollTop=0);
  await page.screenshot({path:testInfo.outputPath('dashboard-desktop.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});
  const dimensions=await page.getByRole('region',{name:'Outbreak response',exact:true}).evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth}));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width+1);
  await page.getByRole('region',{name:'Outbreak response',exact:true}).evaluate(el=>el.scrollTop=0);
  await page.screenshot({path:testInfo.outputPath('dashboard-mobile.png'),fullPage:true});
  await page.getByRole('button',{name:'Deep analysis → Sitrep',exact:true}).click();
  await expect(page.getByRole('navigation',{name:'Outbreak sections'}).getByRole('button',{name:'Sitrep',exact:true})).toHaveAttribute('aria-pressed','true');
  expect(errors).toEqual([]);
});

test('timed refresh preserves selection and viewport, retains data on failure and pauses for historical dates',async({page})=>{
  let checks=0,failed=false;
  await openOutbreak(page,boundaries,route=>{const kind=new URL(route.request().url()).searchParams.get('kind');if(kind==='indicators'){checks++;return failed?route.fulfill({status:502,json:{error:'Fixture offline'}}):route.fulfill({json:{datasets:[dataset(checks===1?4:8)]}});}return route.fulfill({json:kind==='mines'?{data:[]}:kind==='relocations'?{routes:[]}:{products:[]}});});
  await expect(page.getByRole('button',{name:'Refresh data',exact:true})).toBeEnabled();
  await page.getByLabel('Auto-refresh',{exact:true}).selectOption('5');
  await page.getByLabel('Health zone',{exact:true}).selectOption('A');
  const map=page.getByRole('region',{name:'Dashboard map'});
  await map.getByRole('button',{name:'Zoom in Reported cumulative cases map',exact:true}).click();
  const view=await map.locator('[data-map-viewport]').getAttribute('viewBox');
  const initialChecks=checks;
  await page.clock.fastForward(300001);
  await expect(page.getByLabel('Selected health zone',{exact:true})).toContainText('Cumulative cases: 8');
  expect(checks).toBe(initialChecks+1);
  await expect(map.locator('[data-map-viewport]')).toHaveAttribute('viewBox',view);
  failed=true;
  await page.clock.fastForward(300001);
  await expect(page.getByLabel('Dashboard refresh controls')).toContainText('Fixture offline');
  await expect(page.getByLabel('Selected health zone',{exact:true})).toContainText('Cumulative cases: 8');
  await page.getByLabel('Reporting cut-off',{exact:true}).fill('2026-09-21');
  const before=checks;
  await page.clock.fastForward(600001);
  expect(checks).toBe(before);
  await expect(page.getByLabel('Dashboard refresh controls')).toContainText('Automatic refresh paused');
  await page.getByRole('button',{name:/Save snapshot/}).click();
  await page.getByText('Report settings & saved versions',{exact:true}).click();
  await expect(page.getByLabel('Saved snapshots').locator('option')).toHaveCount(2);
  await page.getByLabel('Follow latest reporting dates',{exact:true}).check();
  page.on('dialog',dialog=>dialog.accept());
  await page.getByLabel('Saved snapshots').selectOption({index:1});
  await expect(page.getByLabel('Follow latest reporting dates',{exact:true})).not.toBeChecked();
  await page.clock.fastForward(600001);
  expect(checks).toBe(before);

});

for(const fallback of [false,true])test(`decision view fills the screen, stays live and exits cleanly${fallback?' without browser fullscreen':''}`,async({page},testInfo)=>{
  await page.setViewportSize({width:1920,height:1080});
  let checks=0;
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await openOutbreak(page,boundaries,route=>{
    const kind=new URL(route.request().url()).searchParams.get('kind');
    if(kind==='indicators'){checks++;return route.fulfill({json:{datasets:[dataset(checks===1?4:8)]}});}
    return route.fulfill({json:kind==='mines'?{data:[]}:kind==='relocations'?{routes:[]}:{products:[]}});
  });
  await expect(page.getByRole('button',{name:'Refresh data',exact:true})).toBeEnabled();
  await page.getByLabel('Auto-refresh',{exact:true}).selectOption('5');
  if(fallback)await page.evaluate(()=>{Element.prototype.requestFullscreen=()=>Promise.reject(new Error('Fullscreen unavailable'));});
  await page.getByRole('button',{name:'Full-screen dashboard',exact:true}).click();
  const board=page.getByRole('dialog',{name:'Decision dashboard',exact:true});
  await expect(board).toBeVisible();
  await expect(page.getByRole('navigation',{name:'Outbreak sections'})).toHaveCount(0);
  await expect(board.getByRole('combobox')).toHaveCount(0);
  await expect(board.getByRole('button',{name:'Export map SVG'})).toHaveCount(0);
  expect(await page.evaluate(()=>document.getElementById('__next').inert)).toBe(true);
  if(!fallback)expect(await board.evaluate(el=>!!document.fullscreenElement&&el.contains(document.fullscreenElement))).toBe(true);
  const dimensions=await board.evaluate(el=>({x:el.getBoundingClientRect().x,y:el.getBoundingClientRect().y,width:el.clientWidth,height:el.clientHeight,viewportWidth:innerWidth,viewportHeight:innerHeight,scrollHeight:el.scrollHeight}));
  expect(dimensions.x).toBe(0);expect(dimensions.y).toBe(0);expect(dimensions.width).toBe(dimensions.viewportWidth);expect(dimensions.height).toBe(dimensions.viewportHeight);
  expect(dimensions.scrollHeight).toBeLessThanOrEqual(dimensions.height+1);
  await board.getByRole('button',{name:'A',exact:true}).click();
  await expect(board.getByLabel('Health-zone map callout')).toBeVisible();
  await page.clock.fastForward(300001);
  await expect(board.getByLabel('Health-zone map callout')).toContainText('Cumulative cases: 8');
  await expect(board.getByRole('region',{name:'Decision health-zone trends'})).toContainText('Province One / A');
  await page.screenshot({path:testInfo.outputPath(fallback?'decision-fallback.png':'decision-fullscreen.png')});
  await page.keyboard.press('Escape');
  await expect(board).toHaveCount(0);
  expect(await page.evaluate(()=>document.getElementById('__next').inert)).toBe(false);
  await expect(page.getByRole('button',{name:'Full-screen dashboard',exact:true})).toBeFocused();
  await page.getByRole('button',{name:'Full-screen dashboard',exact:true}).click();
  await board.getByRole('button',{name:'Deep analysis',exact:true}).click();
  await expect(board).toHaveCount(0);
  await expect(page.getByRole('navigation',{name:'Outbreak sections'}).getByRole('button',{name:'Sitrep',exact:true})).toHaveAttribute('aria-pressed','true');
  expect(errors).toEqual([]);
});
