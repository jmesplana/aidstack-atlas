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

const boundaries=['A','B','C'].map((nom,i)=>({id:nom,name:nom,properties:{nom,flowminder:{_date:'2026-09-20',_unit:'source indicator units',outflow:i===0?12:i===1?0:null,inflow:i===0?8:i===1?2:null},province:i<2?'Province One':'Province Two',district:i<2?'District One':'District Two',insp_sitrep:{cumulative_confirmed_cases:{_date:'2026-09-21',cumulative_confirmed_cases:i===0?4:0}}},geometry:{type:'Polygon',coordinates:[[[29+i,1],[30+i,1],[30+i,2],[29+i,2],[29+i,1]]]}}));
function dataset(value=4){return {id:'insp:cumulative_confirmed_cases',metricId:'cumulative_confirmed_cases',purpose:'cases',origin:'public',status:'ready',level:'health_zone',kind:'cumulative',label:'Confirmed cases',unit:'people',records:[{location:'A',date:'2026-09-14',value:0},{location:'B',date:'2026-09-14',value:0},{location:'A',date:'2026-09-21',value},{location:'B',date:'2026-09-21',value:0},{location:'C',date:'2026-09-21',value:null}]};}
const movement={start:'2026-04-01',end:'2026-04-30',unit:'estimated relocations',source:'Fixture movement matrix',routes:[{origin:'A',destination:'B',value:25},{origin:'B',destination:'A',value:12},{origin:'A',destination:'C',value:0},{origin:'C',destination:'A',value:null},{origin:'A',destination:'Unmatched',value:5},{origin:'A',destination:'A',value:100}]};
test('source aliases restore Kisangani map values, province totals and continuous trends',async({page})=>{
  const geo=['Makiso Kisangani','Lubunga (Tshopo)','Lubunga (Kasaï-Central)'].map((nom,i)=>({...boundaries[i],id:nom,name:nom,properties:{...boundaries[i].properties,nom,province:i<2?'Tshopo':'Kasaï-Central'}}));
  const cases={...dataset(),records:[
    {location:'Makiso Kisangani',date:'2026-09-14',value:11},
    {location:'Makiso-Kisangani',date:'2026-09-21',value:22},
    {location:'Lubunga (Tshopo)',date:'2026-09-14',value:1},
    {location:'Lubunga',date:'2026-09-21',value:1},
    {location:'NA',date:'2026-09-14',value:17}
  ]};
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await openOutbreak(page,geo,route=>{const kind=new URL(route.request().url()).searchParams.get('kind');return route.fulfill({json:kind==='indicators'?{datasets:[cases]}:kind==='mines'?{data:[]}:kind==='relocations'?{...movement,routes:[]}:{products:[]}});});
  const matching=page.getByText('Location matching: 2 name variants resolved · 1 unlocated',{exact:true}).filter({visible:true});
  await matching.click();
  await expect(page.getByRole('row').filter({hasText:'Makiso-Kisangani'}).filter({visible:true})).toContainText('Makiso Kisangani');
  await expect(page.getByRole('row').filter({hasText:'Non-geographic source total'}).filter({visible:true})).toContainText('NA');
  await page.getByLabel('Health zone',{exact:true}).selectOption('Makiso Kisangani');
  await expect(page.getByLabel('Selected health zone',{exact:true})).toContainText('Cumulative cases: 22');
  await expect(page.getByLabel('Selected health zone',{exact:true})).toContainText('Reported change: 11');
  await expect(page.getByRole('region',{name:'Dashboard map'}).locator('path[data-admin="Makiso Kisangani"]')).not.toHaveAttribute('fill','#e3e8ed');
  const coverage=page.getByRole('region',{name:'Dashboard province coverage'});
  await expect(coverage.getByRole('row').filter({hasText:'Tshopo'})).toContainText('23');
  await expect(page.getByRole('region',{name:'Dashboard health-zone trends'}).getByRole('img',{name:/Tshopo \/ Makiso Kisangani/}).first()).toBeVisible();
  await page.getByLabel('Health zone',{exact:true}).selectOption('Lubunga (Tshopo)');
  await expect(page.getByLabel('Selected health zone',{exact:true})).toContainText('Cumulative cases: 1');
  await page.getByRole('button',{name:'Clear selection',exact:true}).click();
  await page.getByLabel('Health zone',{exact:true}).selectOption('Lubunga (Kasaï-Central)');
  await expect(page.getByLabel('Selected health zone',{exact:true})).toContainText('Cumulative cases: Unknown');
  expect(errors).toEqual([]);
});
test('dashboard links coverage, first reports, map callouts, trends and sitrep',async({page},testInfo)=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await openOutbreak(page,boundaries,route=>{const kind=new URL(route.request().url()).searchParams.get('kind');return route.fulfill({json:kind==='indicators'?{datasets:[dataset()]}:kind==='mines'?{data:[]}:kind==='relocations'?movement:{products:[]}});});
  await expect(page.getByRole('heading',{name:'Situation dashboard',exact:true})).toBeVisible();
  const coverage=page.getByRole('region',{name:'Dashboard province coverage'});
  await expect(coverage.getByRole('row').filter({hasText:'Province One'})).toContainText('50.0%');
  await expect(coverage.getByRole('row').filter({hasText:'Province Two'})).toHaveCount(0);
  const mobility=page.getByRole('region',{name:'Dashboard mobility'});
  await expect(mobility.getByRole('img',{name:'Outflow from A map',exact:true})).toBeVisible();
  await expect(mobility.locator('[data-mobility-route="A → B"]')).toHaveCount(1);
  await expect(mobility.locator('[data-mobility-route="A → C"]')).toHaveCount(0);
  await expect(mobility.locator('[data-mobility-route="A → A"]')).toHaveCount(0);
  await expect(mobility).toContainText('2026-04-01–2026-04-30');
  await expect(mobility).toContainText('1 connections cannot be mapped');
  await mobility.getByText('Outflow from A · 2 of 2 connections',{exact:true}).click();
  await expect(mobility.getByRole('row').filter({hasText:'Unmatched'})).toContainText('5');
  await mobility.getByText('Outflow from A · 2 of 2 connections',{exact:true}).click();
  await mobility.getByLabel('Movement direction',{exact:true}).selectOption('inflow');
  await expect(mobility.getByRole('img',{name:'Inflow to A map',exact:true})).toBeVisible();
  await expect(mobility.locator('[data-mobility-route="B → A"]')).toHaveCount(1);
  await expect(mobility.locator('[data-mobility-route="A → B"]')).toHaveCount(0);
  await expect(mobility.locator('[data-mobility-route="C → A"]')).toHaveCount(0);
  await mobility.getByLabel('Movement focus',{exact:true}).selectOption('B');
  await expect(page.getByLabel('Health zone',{exact:true})).toHaveValue('B');
  await expect(mobility.getByRole('img',{name:'Inflow to B map',exact:true})).toBeVisible();
  await expect(page.getByRole('region',{name:'Dashboard health-zone trends'}).getByRole('img',{name:/horizon chart — Province Two/})).toHaveCount(0);

  await page.getByRole('region',{name:'First positive reports',exact:true}).getByRole('button',{name:/A ·/}).click();
  await expect(page.getByLabel('Health zone',{exact:true})).toHaveValue('A');
  await expect(page.getByLabel('Selected health zone',{exact:true})).toContainText('Cumulative cases: 4');
  await expect(page.getByLabel('Health-zone map callout',{exact:true})).toBeVisible();
  await expect(page.getByRole('region',{name:'Dashboard health-zone trends'})).toContainText('Province One');
  await page.getByRole('button',{name:'Clear selection',exact:true}).click();
  await page.getByLabel('All zones with data',{exact:true}).check();
  await expect(page.getByRole('region',{name:'Dashboard health-zone trends'})).toContainText('available weekly comparisons');
  await page.getByRole('region',{name:'Dashboard health-zone trends'}).getByRole('img',{name:/Province One \/ B/}).first().waitFor();
  await page.getByLabel('Health zone',{exact:true}).selectOption('A');
  await page.getByRole('region',{name:'Outbreak response',exact:true}).evaluate(el=>el.scrollTop=0);
  await page.screenshot({path:testInfo.outputPath('dashboard-desktop.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});
  const dimensions=await page.getByRole('region',{name:'Outbreak response',exact:true}).evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth}));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width+1);
  await page.getByRole('region',{name:'Outbreak response',exact:true}).evaluate(el=>el.scrollTop=0);
  await page.screenshot({path:testInfo.outputPath('dashboard-mobile.png'),fullPage:true});
  const mobileMap=page.getByRole('region',{name:'Dashboard map'}).getByRole('img',{name:'Reported cumulative cases map',exact:true});
  await mobileMap.scrollIntoViewIfNeeded();
  expect((await mobileMap.boundingBox()).height).toBeGreaterThan(150);
  await page.screenshot({path:testInfo.outputPath('dashboard-mobile-map.png')});
  await page.getByRole('button',{name:'Deep analysis → Sitrep',exact:true}).click();
  await expect(page.getByRole('navigation',{name:'Outbreak sections'}).getByRole('button',{name:'Sitrep',exact:true})).toHaveAttribute('aria-pressed','true');
  expect(errors).toEqual([]);
});

test('timed refresh preserves selection and viewport, retains data on failure and pauses for historical dates',async({page})=>{
  let checks=0,failed=false;
  await openOutbreak(page,boundaries.map(area=>({...area,properties:Object.fromEntries(Object.entries(area.properties).filter(([key])=>key!=='flowminder'))})),route=>{const kind=new URL(route.request().url()).searchParams.get('kind');if(kind==='indicators'){checks++;return failed?route.fulfill({status:502,json:{error:'Fixture offline'}}):route.fulfill({json:{datasets:[dataset(checks===1?4:8)]}});}return route.fulfill({json:kind==='mines'?{data:[]}:kind==='relocations'?{routes:[]}:{products:[]}});});
  await expect(page.getByRole('button',{name:'Refresh data',exact:true})).toBeEnabled();
  await expect(page.getByRole('region',{name:'Dashboard mobility'})).toContainText('No origin–destination movement data is available');
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
    return route.fulfill({json:kind==='mines'?{data:[]}:kind==='relocations'?movement:{products:[]}});
  });
  await expect(page.getByRole('button',{name:'Refresh data',exact:true})).toBeEnabled();
  await page.getByLabel('Auto-refresh',{exact:true}).selectOption('5');
  if(fallback)await page.evaluate(()=>{Element.prototype.requestFullscreen=()=>Promise.reject(new Error('Fullscreen unavailable'));});
  await page.getByRole('button',{name:'Full-screen dashboard',exact:true}).click();
  const board=page.getByRole('dialog',{name:'Decision dashboard',exact:true});
  await expect(board).toBeVisible();
  await expect(page.getByRole('navigation',{name:'Outbreak sections'})).toHaveCount(0);
  const mobility=board.getByRole('region',{name:'Decision mobility'});
  await expect(mobility.getByRole('combobox')).toHaveCount(2);
  await expect(mobility.getByRole('img',{name:'Outflow from A map',exact:true})).toBeVisible();
  await expect(mobility.locator('[data-mobility-route="A → B"]')).toHaveCount(1);
  await mobility.getByLabel('Movement direction',{exact:true}).selectOption('inflow');
  await expect(mobility.locator('[data-mobility-route="B → A"]')).toHaveCount(1);
  await expect(board.getByRole('button',{name:'Export map SVG'})).toHaveCount(0);
  expect(await page.evaluate(()=>document.getElementById('__next').inert)).toBe(true);
  if(!fallback)expect(await board.evaluate(el=>!!document.fullscreenElement&&el.contains(document.fullscreenElement))).toBe(true);
  const dimensions=await board.evaluate(el=>({x:el.getBoundingClientRect().x,y:el.getBoundingClientRect().y,width:el.clientWidth,height:el.clientHeight,viewportWidth:innerWidth,viewportHeight:innerHeight,scrollHeight:el.scrollHeight}));
  expect(dimensions.x).toBe(0);expect(dimensions.y).toBe(0);expect(dimensions.width).toBe(dimensions.viewportWidth);expect(dimensions.height).toBe(dimensions.viewportHeight);
  expect(dimensions.scrollHeight).toBeLessThanOrEqual(dimensions.height+1);
  const boxes=await Promise.all(['Decision map','Decision mobility','Decision province coverage','Decision health-zone trends'].map(name=>board.getByRole('region',{name,exact:true}).boundingBox()));
  expect(Math.abs(boxes[0].width-boxes[1].width)).toBeLessThan(2);
  expect(Math.abs(boxes[2].width-boxes[3].width)).toBeLessThan(2);
  expect(boxes[0].x).toBeLessThan(boxes[1].x);
  expect(boxes[2].y).toBeGreaterThan(boxes[0].y);
  expect(boxes[2].x).toBeLessThan(boxes[3].x);
  expect(Math.abs(boxes[2].y-boxes[3].y)).toBeLessThan(2);
  for(const label of ['Decision map','Decision mobility','Decision province coverage','Decision health-zone trends']){
    await board.getByRole('button',{name:`Focus ${label}`,exact:true}).click();
    const focused=page.getByRole('dialog',{name:label,exact:true});
    await expect(focused).toBeVisible();
    const enlarged=await focused.boundingBox();
    expect(enlarged.width).toBeGreaterThan(boxes[0].width);
    expect(Math.abs(enlarged.x*2+enlarged.width-1920)).toBeLessThan(2);
    await expect(focused.getByRole('button',{name:`Return from ${label}`,exact:true})).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(focused).toHaveCount(0);
    await expect(board).toBeVisible();
    await expect(board.getByRole('button',{name:`Focus ${label}`,exact:true})).toBeFocused();
  }
  const restoredBoxes=await Promise.all(['Decision map','Decision mobility','Decision province coverage','Decision health-zone trends'].map(name=>board.getByRole('region',{name,exact:true}).boundingBox()));
  for(let i=0;i<boxes.length;i++)expect(Math.abs(restoredBoxes[i].height-boxes[i].height)).toBeLessThan(2);
  const map=board.getByRole('region',{name:'Decision map'});
  const svg=map.getByRole('img',{name:'Reported cumulative cases map',exact:true});
  await expect.poll(async()=>svg.evaluate(el=>{
    const box=el.getBoundingClientRect(),view=el.viewBox.baseVal;
    return Math.abs(box.width/box.height-view.width/view.height);
  })).toBeLessThan(.02);
  const viewport=await svg.evaluate(el=>({height:el.viewBox.baseVal.height,plotHeight:Number(el.querySelector('[data-map-viewport]').getAttribute('height'))}));
  expect(viewport.plotHeight).toBeCloseTo(viewport.height,2);
  await board.getByRole('button',{name:'A',exact:true}).click();
  await expect(board.getByLabel('Health-zone map callout')).toBeVisible();
  await page.clock.fastForward(300001);
  await expect(board.getByLabel('Health-zone map callout')).toContainText('Cumulative cases: 8');
  await expect(board.getByRole('region',{name:'Decision health-zone trends'})).toContainText('Province One / A');
  const finalBoxes=await Promise.all(['Decision map','Decision mobility','Decision province coverage','Decision health-zone trends'].map(name=>board.getByRole('region',{name,exact:true}).boundingBox()));
  expect(finalBoxes[2].y).toBeGreaterThanOrEqual(finalBoxes[0].y+finalBoxes[0].height);
  expect(finalBoxes[3].y).toBeGreaterThanOrEqual(finalBoxes[1].y+finalBoxes[1].height);
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


test('dashboard excludes movement observations after the reporting cut-off',async({page})=>{
  await openOutbreak(page,boundaries,route=>{const kind=new URL(route.request().url()).searchParams.get('kind');return route.fulfill({json:kind==='indicators'?{datasets:[dataset()]}:kind==='mines'?{data:[]}:kind==='relocations'?{...movement,start:'2026-09-25',end:'2026-09-30'}:{products:[]}});});
  const mobility=page.getByRole('region',{name:'Dashboard mobility'});
  await expect(mobility).toContainText('after the reporting cut-off');
  await expect(mobility.locator('[data-mobility-route]')).toHaveCount(0);
});


test('equal dashboard columns and section focus preserve map state and work on mobile',async({page},testInfo)=>{
  await page.setViewportSize({width:1920,height:1080});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await openOutbreak(page,boundaries,route=>{const kind=new URL(route.request().url()).searchParams.get('kind');return route.fulfill({json:kind==='indicators'?{datasets:[dataset()]}:kind==='mines'?{data:[]}:kind==='relocations'?movement:{products:[]}});});
  const labels=['Dashboard map','Dashboard mobility','Dashboard province coverage','Dashboard health-zone trends'];
  const boxes=await Promise.all(labels.map(name=>page.getByRole('region',{name,exact:true}).boundingBox()));
  expect(Math.abs(boxes[0].width-boxes[1].width)).toBeLessThan(2);
  expect(Math.abs(boxes[2].width-boxes[3].width)).toBeLessThan(2);
  const map=page.getByRole('region',{name:'Dashboard map'});
  await map.getByRole('button',{name:'Zoom in Reported cumulative cases map',exact:true}).click();
  const width=Number((await map.locator('[data-map-viewport]').getAttribute('viewBox')).split(' ')[2]);
  await map.locator('[data-map-viewport]').evaluate(el=>el.dataset.focusTest='same-map');
  for(const label of labels){
    await page.getByRole('button',{name:`Focus ${label}`,exact:true}).click();
    const focused=page.getByRole('dialog',{name:label,exact:true});
    await expect(focused).toBeVisible();
    const box=await focused.boundingBox();
    expect(box.width).toBeGreaterThan(boxes[0].width);
    expect(Math.abs(box.x*2+box.width-1920)).toBeLessThan(2);
    await expect(focused.getByRole('button',{name:`Return from ${label}`,exact:true})).toBeFocused();
    if(label==='Dashboard mobility'){
      await focused.getByLabel('Movement direction',{exact:true}).selectOption('inflow');
      await expect(focused.locator('[data-mobility-route="B → A"]')).toHaveCount(1);
      await page.screenshot({path:testInfo.outputPath('focused-mobility.png')});
    }
    if(label==='Dashboard province coverage')await focused.getByRole('button',{name:'Province One',exact:true}).click();
    await focused.getByRole('button',{name:`Return from ${label}`,exact:true}).click();
    await expect(focused).toHaveCount(0);
    await expect(page.getByRole('button',{name:`Focus ${label}`,exact:true})).toBeFocused();
    if(label==='Dashboard map'){
      await expect(map.locator('[data-focus-test="same-map"]')).toHaveCount(1);
      expect(Number((await map.locator('[data-map-viewport]').getAttribute('viewBox')).split(' ')[2])).toBe(width);
    }
  }
  await expect(page.getByLabel('Province filter',{exact:true})).toHaveValue('Province One');
  await expect(page.getByRole('region',{name:'Dashboard mobility'}).getByLabel('Movement direction',{exact:true})).toHaveValue('inflow');
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'Focus Dashboard mobility',exact:true}).click();
  const focused=page.getByRole('dialog',{name:'Dashboard mobility',exact:true});
  const dimensions=await focused.evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth,x:el.getBoundingClientRect().x,right:el.getBoundingClientRect().right}));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width+1);
  expect(dimensions.x).toBeGreaterThanOrEqual(0);
  expect(dimensions.right).toBeLessThanOrEqual(390);
  await page.screenshot({path:testInfo.outputPath('focused-mobility-mobile.png')});
  await page.keyboard.press('Escape');
  await expect(focused).toHaveCount(0);
  expect(errors).toEqual([]);
});

const monitorNames=['Declining','Rising','Quiet','Gap3','Gap6','Never','Receiver'];
const monitorBoundaries=monitorNames.map((nom,i)=>({...boundaries[0],id:nom,name:nom,properties:{...boundaries[0].properties,nom,province:'Test province'},geometry:{type:'Polygon',coordinates:[[[25+i,1],[26+i,1],[26+i,2],[25+i,2],[25+i,1]]]}}));
const monitorDates=['2026-08-31','2026-09-07','2026-09-14','2026-09-21'];
const monitorCases={...dataset(),records:[
  ...[0,100,190,271].map((value,i)=>({location:'Declining',date:monitorDates[i],value})),
  ...[0,20,45,95].map((value,i)=>({location:'Rising',date:monitorDates[i],value})),
  ...Array.from({length:7},(_,i)=>({location:'Quiet',date:new Date(Date.parse('2026-08-10')+i*7*86400000).toISOString().slice(0,10),value:10})),
  {location:'Gap3',date:'2026-08-31',value:2},{location:'Gap6',date:'2026-08-10',value:3}
]};
const monitorMovement={...movement,routes:[{origin:'Declining',destination:'Receiver',value:50},{origin:'Receiver',destination:'Declining',value:20}]};
async function openMonitoring(page){
  await openOutbreak(page,monitorBoundaries,route=>{const kind=new URL(route.request().url()).searchParams.get('kind');return route.fulfill({json:kind==='indicators'?{datasets:[monitorCases]}:kind==='mines'?{data:[]}:kind==='relocations'?monitorMovement:{products:[]}});});
  await page.getByLabel('Reporting cut-off',{exact:true}).fill('2026-09-21');
}

test('live decline threshold updates map, key message, presentation and saved snapshot',async({page},testInfo)=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await openMonitoring(page);
  await page.getByRole('navigation',{name:'Dashboard views'}).getByRole('button',{name:'Case trends',exact:true}).click();
  const map=page.getByRole('region',{name:'Case trend map',exact:true});
  await expect(map.locator('path[data-admin="Declining"]')).toHaveAttribute('data-category','declining');
  await expect(map.locator('path[data-admin="Rising"]')).toHaveAttribute('data-category','rising');
  await expect(map.locator('path[data-admin="Never"]')).toHaveAttribute('data-category','unknown');
  await page.getByLabel('Sustained decline threshold (%)',{exact:true}).fill('11');
  await expect(map.locator('path[data-admin="Declining"]')).toHaveAttribute('data-category','falling');
  await expect(page.getByRole('region',{name:'Key message'})).toContainText('at least 11%');
  await page.getByLabel('Sustained decline threshold (%)',{exact:true}).fill('10');
  await page.getByRole('region',{name:'Case trend comparisons'}).getByRole('button',{name:'Declining',exact:true}).click();
  await expect(page.getByLabel('Selected case trend',{exact:true})).toContainText('Sustained decline');
  await page.screenshot({path:testInfo.outputPath('case-trends.png'),fullPage:true});
  await page.getByRole('button',{name:'Full-screen dashboard',exact:true}).click();
  const board=page.getByRole('dialog',{name:'Decision dashboard',exact:true});
  await expect(board.getByLabel('Presentation page')).toHaveValue('trends');
  await board.getByLabel('Sustained decline threshold (%)',{exact:true}).fill('15');
  await expect(board.locator('path[data-admin="Declining"]')).toHaveAttribute('data-category','falling');
  await board.getByRole('button',{name:'Exit full-screen dashboard',exact:true}).click();
  await expect(page.getByLabel('Sustained decline threshold (%)',{exact:true})).toHaveValue('15');
  await page.getByRole('button',{name:/Save snapshot/}).click();
  await expect(page.getByLabel('Saved snapshots').locator('option')).toHaveCount(2);
  await page.getByLabel('Sustained decline threshold (%)',{exact:true}).fill('25');
  await page.getByText('Report settings & saved versions',{exact:true}).click();
  page.once('dialog',dialog=>dialog.accept());
  await page.getByLabel('Saved snapshots').selectOption({index:1});
  await expect(page.getByLabel('Sustained decline threshold (%)',{exact:true})).toHaveValue('15');
  await page.getByRole('navigation',{name:'Outbreak sections'}).getByRole('button',{name:'Sitrep',exact:true}).click();
  await expect(page.getByRole('article',{name:'Sitrep print preview'}).getByLabel('Area monitoring summary',{exact:true})).toContainText('at least 15%');
  expect(errors).toEqual([]);
});

test('reporting pages separate 3/6-week gaps from unchanged reports and link history to map',async({page},testInfo)=>{
  await openMonitoring(page);
  await page.getByRole('navigation',{name:'Dashboard views'}).getByRole('button',{name:'Reporting history',exact:true}).click();
  const map=page.getByRole('region',{name:'Reporting status map',exact:true});
  await expect(map.locator('path[data-admin="Gap3"]')).toHaveAttribute('data-category','gap3');
  await expect(map.locator('path[data-admin="Gap6"]')).toHaveAttribute('data-category','gap6');
  await expect(map.locator('path[data-admin="Quiet"]')).toHaveAttribute('data-category','recent');
  await expect(map.locator('path[data-admin="Never"]')).toHaveAttribute('data-category','unknown');
  await page.getByRole('combobox',{name:'History window',exact:true}).selectOption('6');
  await page.getByLabel('Only zones with at least 6 weeks',{exact:true}).check();
  const history=page.getByRole('region',{name:'Horizontal reporting history',exact:true});
  await expect(history.getByRole('button',{name:'Gap6',exact:true})).toBeVisible();
  await expect(history.getByRole('button',{name:'Gap3',exact:true})).toHaveCount(0);
  await history.getByRole('button',{name:'Gap6',exact:true}).click();
  await expect(page.getByLabel('Selected reporting status',{exact:true})).toContainText('Gap6');
  await page.getByRole('combobox',{name:'Reporting measure',exact:true}).selectOption('quiet');
  await expect(map.locator('path[data-admin="Quiet"]')).toHaveAttribute('data-category','quiet6');
  await expect(map.locator('path[data-admin="Gap6"]')).toHaveAttribute('data-category','stale');
  await history.getByRole('button',{name:'Quiet',exact:true}).click();
  await expect(page.getByLabel('Selected reporting status',{exact:true})).toContainText('42 days');
  await expect(history.getByRole('columnheader')).toHaveCount(8);
  await page.screenshot({path:testInfo.outputPath('reporting-history.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await expect(page.getByRole('region',{name:'Reporting timeline',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});

test('high-burden page connects ranked zones to movement and horizon windows link back to map',async({page},testInfo)=>{
  await openMonitoring(page);
  await page.getByRole('navigation',{name:'Dashboard views'}).getByRole('button',{name:'High burden & movement',exact:true}).click();
  const connections=page.getByRole('region',{name:'High burden connections',exact:true});
  await expect(connections.getByRole('row').filter({hasText:'Declining'})).toContainText('Receiver: 50');
  await connections.getByRole('button',{name:'Declining',exact:true}).click();
  const mobility=page.getByRole('region',{name:'High burden mobility',exact:true});
  await expect(mobility.locator('[data-mobility-route="Declining → Receiver"]')).toHaveCount(1);
  await mobility.getByLabel('Movement direction',{exact:true}).selectOption('inflow');
  await expect(connections.getByRole('row').filter({hasText:'Declining'})).toContainText('Receiver: 20');
  await page.screenshot({path:testInfo.outputPath('burden-movement.png'),fullPage:true});
  await page.getByRole('navigation',{name:'Dashboard views'}).getByRole('button',{name:'Overview',exact:true}).click();
  await page.getByRole('combobox',{name:'Trend history window',exact:true}).selectOption('3');
  const trends=page.getByRole('region',{name:'Dashboard health-zone trends',exact:true});
  await expect(trends).toContainText('last 3 weeks');
  await trends.getByRole('button',{name:'Select Declining on map',exact:true}).click();
  await expect(page.getByLabel('Health zone',{exact:true})).toHaveValue('Declining');
});

test('full-screen actions rail drafts grounded AI actions and adds them to the response plan',async({page},testInfo)=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize({width:1600,height:900});
  await openMonitoring(page);
  let sent=null;
  await page.route('**/api/outbreak-actions',route=>{
    sent=route.request().postDataJSON().evidence;
    const growth=sent.find(e=>e.kind==='growth'&&e.areas[0]==='Rising');
    return route.fulfill({json:{actions:[{id:'ai-1',source:'ai',title:'Investigate rising reports in Rising',pillar:'surveillance',urgency:'24h',confidence:'medium',areas:['Rising'],evidence:[growth.id],action:'Deploy an investigation team within 48 hours.',rationale:'Reported cases rose.',dataNeeded:'Contact follow-up rates'}],dataGaps:['No vaccination indicators are loaded.']}});
  });
  await page.getByRole('button',{name:'Full-screen dashboard',exact:true}).click();
  const board=page.getByRole('dialog',{name:'Decision dashboard',exact:true});
  const rail=board.getByRole('complementary',{name:'Recommended actions',exact:true});
  await expect(rail).toContainText('Rule-based suggestions');
  await expect(rail.getByRole('listitem').first()).toBeVisible();
  await rail.getByRole('button',{name:'Draft with AI',exact:true}).click();
  await expect(rail.getByRole('heading',{name:'Investigate rising reports in Rising'})).toBeVisible();
  expect(sent.some(e=>e.kind==='mobility'&&e.areas.includes('Receiver'))).toBe(true);
  await expect(rail).toContainText('Next 24 hours');
  await expect(rail.getByLabel('Data gaps')).toContainText('No vaccination indicators');
  await rail.getByText(/^Why · 1 evidence item$/).click();
  await expect(rail).toContainText('→ 95');
  await rail.getByRole('button',{name:'Show Rising on map',exact:true}).click();
  await expect(board.getByLabel('Health-zone map callout')).toContainText('Rising');
  await rail.getByRole('button',{name:'Add to response plan',exact:true}).click();
  await expect(rail.getByRole('button',{name:'In response plan ✓',exact:true})).toBeDisabled();
  await expect(rail.getByLabel('Response plan status')).toContainText('1 action');
  await expect(rail).not.toContainText('Data has changed');
  const layout=await board.evaluate(el=>({scroll:el.scrollHeight,height:el.clientHeight}));
  expect(layout.scroll).toBeLessThanOrEqual(layout.height+1);
  await page.screenshot({path:testInfo.outputPath('decision-actions.png')});
  await rail.getByRole('button',{name:'Open plan',exact:true}).click();
  await expect(board).toHaveCount(0);
  await expect(page.getByLabel('Action, rationale and decision requested').first()).toHaveValue(/Investigate rising reports in Rising\..*→ 95.*AI-drafted/);
  expect(errors).toEqual([]);
});

test('case trend comparisons hide zones with no reported change',async({page})=>{
  await openMonitoring(page);
  await page.getByRole('navigation',{name:'Dashboard views'}).getByRole('button',{name:'Case trends',exact:true}).click();
  const table=page.getByRole('region',{name:'Case trend comparisons',exact:true});
  await expect(table.getByRole('button',{name:'Rising',exact:true})).toBeVisible();
  await expect(table.getByRole('button',{name:'Gap6',exact:true})).toHaveCount(0);
  await expect(table.getByRole('button',{name:'Quiet',exact:true})).toHaveCount(0);
  await table.getByLabel(/Show \d+ health zones with no reported change in these weeks/).check();
  await expect(table.getByRole('button',{name:'Gap6',exact:true})).toBeVisible();
  await expect(table.getByRole('row').filter({hasText:'Quiet'})).toContainText('Same daily rate in all three weeks');
});

test('case trend comparisons sort by assessment and filter from the status counts',async({page})=>{
  await openMonitoring(page);
  await page.getByRole('navigation',{name:'Dashboard views'}).getByRole('button',{name:'Case trends',exact:true}).click();
  const table=page.getByRole('region',{name:'Case trend comparisons',exact:true});
  const rows=table.getByRole('row');
  await expect(rows.nth(1)).toContainText('Rising reported rate');
  await expect(rows.nth(2)).toContainText('Sustained decline');
  const filters=page.getByRole('group',{name:'Filter comparisons by assessment',exact:true});
  await filters.getByRole('button',{name:/Rising reported rate/}).click();
  await expect(filters.getByRole('button',{name:/Rising reported rate/})).toHaveAttribute('aria-pressed','true');
  await expect(table.getByRole('button',{name:'Rising',exact:true})).toBeVisible();
  await expect(table.getByRole('button',{name:'Declining',exact:true})).toHaveCount(0);
  await filters.getByRole('button',{name:/Unchanged reported rate/}).click();
  await expect(table.getByRole('button',{name:'Quiet',exact:true})).toBeVisible();
  await table.getByRole('button',{name:'Show all assessments',exact:true}).click();
  await expect(table.getByRole('button',{name:'Declining',exact:true})).toBeVisible();
  await expect(table.getByRole('button',{name:'Quiet',exact:true})).toHaveCount(0);
});

test('case trend comparisons export the filtered, sorted rows as CSV',async({page})=>{
  await openMonitoring(page);
  await page.getByRole('navigation',{name:'Dashboard views'}).getByRole('button',{name:'Case trends',exact:true}).click();
  const table=page.getByRole('region',{name:'Case trend comparisons',exact:true});
  await page.getByRole('group',{name:'Filter comparisons by assessment',exact:true}).getByRole('button',{name:/Rising reported rate/}).click();
  const [file]=await Promise.all([page.waitForEvent('download'),table.getByRole('button',{name:/^Export CSV \(\d+\)$/}).click()]);
  expect(file.suggestedFilename()).toBe('case-trends_2026-09-21_rising.csv');
  const lines=require('fs').readFileSync(await file.path(),'utf8').replace(/^﻿/,'').trim().split('\n');
  expect(lines[0]).toMatch(/^health_zone,province,reported_change_/);
  expect(lines.slice(1).every(l=>l.includes('Rising reported rate'))).toBe(true);
  expect(lines.some(l=>l.startsWith('Rising,'))).toBe(true);
});

test('case trend table explains each comparison and the assessment',async({page},testInfo)=>{
  await openMonitoring(page);
  await page.getByRole('navigation',{name:'Dashboard views'}).getByRole('button',{name:'Case trends',exact:true}).click();
  const table=page.getByRole('region',{name:'Case trend comparisons',exact:true});
  const map=page.getByRole('region',{name:'Case trend map',exact:true});
  await page.setViewportSize({width:1600,height:900});
  const [mapBox,tableBox]=[await map.boundingBox(),await table.boundingBox()];
  expect(tableBox.x).toBeGreaterThan(mapBox.x+mapBox.width-1);
  await table.getByRole('button',{name:'ⓘ How to read',exact:true}).click();
  const guide=page.getByRole('dialog',{name:'How to read these trends',exact:true});
  await expect(guide).toContainText('by any amount');
  await page.keyboard.press('Escape');
  await expect(guide).toHaveCount(0);
  await expect(page.getByRole('region',{name:'How to read these trends'})).toHaveCount(0);
  const row=page.getByRole('region',{name:'Case trend comparisons',exact:true}).getByRole('row').filter({hasText:'Rising'}).first();
  await expect(row).toContainText('Wk 1 → 2');
  await expect(row).toContainText('Wk 2 → 3');
  expect(Math.abs(tableBox.width-mapBox.width)).toBeLessThan(2);
  for(const width of [1280,1440,1600,1900]){
    await page.setViewportSize({width,height:900});
    const wrap=await table.locator('table').evaluate(t=>({need:t.scrollWidth,have:t.parentElement.clientWidth,cols:[...t.rows[1].cells].map(c=>Math.round(c.getBoundingClientRect().width))}));
    expect(wrap.need).toBeLessThanOrEqual(wrap.have+1);
  }
  await expect(row).toContainText('Any increase counts as rising');
  await page.setViewportSize({width:1900,height:1000});
  await page.getByRole('region',{name:'Case trend comparisons',exact:true}).getByRole('button',{name:'Rising',exact:true}).click();
  await expect(page.getByLabel('Selected case trend',{exact:true})).toContainText('Week 2 → 3: +100%');
  await page.setViewportSize({width:1600,height:900});
  await map.scrollIntoViewIfNeeded();
  await page.screenshot({path:testInfo.outputPath('trend-top.png')});
});
