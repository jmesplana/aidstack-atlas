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
  await expect(mobility.getByRole('combobox')).toHaveCount(3);
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
const monitorDeaths={id:'insp:cumulative_confirmed_deaths',metricId:'cumulative_confirmed_deaths',label:'Confirmed deaths',purpose:'other',status:'ready',kind:'cumulative',level:'health_zone',records:[{location:'Declining',date:'2026-09-21',value:27},{location:'Rising',date:'2026-09-21',value:19},{location:'Quiet',date:'2026-09-21',value:0}]};
async function openMonitoring(page){
  await openOutbreak(page,monitorBoundaries,route=>{const kind=new URL(route.request().url()).searchParams.get('kind');return route.fulfill({json:kind==='indicators'?{datasets:[monitorCases,monitorDeaths]}:kind==='mines'?{data:[]}:kind==='relocations'?monitorMovement:{products:[]}});});
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
  await expect(board.getByRole('complementary',{name:'Recommended actions',exact:true})).toBeHidden();
  const mapWidth=(await board.getByRole('region',{name:'Decision map',exact:true}).boundingBox()).width;
  await board.getByRole('button',{name:'Recommended actions',exact:true}).click();
  expect((await board.getByRole('region',{name:'Decision map',exact:true}).boundingBox()).width).toBeLessThan(mapWidth);
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
  await board.getByRole('button',{name:'Hide recommended actions',exact:true}).click();
  await expect(rail).toBeHidden();
  await board.getByRole('button',{name:'Recommended actions',exact:true}).click();
  await expect(rail.getByRole('button',{name:'In response plan ✓',exact:true})).toBeDisabled();
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

test('full-screen filters clear across views and maps retain space across screen sizes',async({page},testInfo)=>{
  await page.setViewportSize({width:1920,height:1080});
  await openOutbreak(page,boundaries,route=>{
    const kind=new URL(route.request().url()).searchParams.get('kind');
    return route.fulfill({json:kind==='indicators'?{datasets:[dataset()]}:kind==='mines'?{data:[]}:kind==='relocations'?movement:{products:[]}});
  });
  await page.evaluate(()=>{Element.prototype.requestFullscreen=()=>Promise.reject(new Error('Test responsive fallback'));});
  await page.getByRole('button',{name:'Full-screen dashboard',exact:true}).click();
  const board=page.getByRole('dialog',{name:'Decision dashboard',exact:true});
  const filter=board.getByLabel('Dashboard area filter');
  const clear=filter.getByRole('button',{name:'Clear filters',exact:true});
  await expect(clear).toBeDisabled();
  await board.getByRole('region',{name:'Decision province coverage',exact:true}).getByRole('button',{name:'Province One',exact:true}).click();
  await expect(filter).toContainText('Province One');
  await clear.click();
  await expect(filter).toContainText('All areas');
  await board.getByRole('button',{name:'A',exact:true}).click();
  await expect(filter).toContainText('Province One / A');
  await board.getByRole('navigation',{name:'Dashboard views'}).getByRole('button',{name:'Case trends',exact:true}).click();
  await clear.click();
  await expect(clear).toBeDisabled();
  await board.getByRole('navigation',{name:'Dashboard views'}).getByRole('button',{name:'Overview',exact:true}).click();
  await expect(board.getByLabel('Health-zone map callout')).toHaveCount(0);
  const contextMap=board.getByRole('region',{name:'Decision map',exact:true});
  await expect(contextMap.getByLabel('Admin labels for Reported cumulative cases',{exact:true})).toHaveValue('all');
  await expect(contextMap.locator('text[data-admin="B"]')).toBeVisible();
  await contextMap.getByLabel('Admin labels for Reported cumulative cases',{exact:true}).selectOption('none');
  await expect(contextMap.locator('text[data-admin]')).toHaveCount(0);
  await contextMap.getByLabel('Admin labels for Reported cumulative cases',{exact:true}).selectOption('all');
  await expect(contextMap.locator('path[data-country="Uganda"]')).toHaveCount(1);
  await contextMap.getByRole('button',{name:'Regional view',exact:true}).click();
  await expect(contextMap.locator('text[data-country-label="Uganda"]')).toBeVisible();
  await contextMap.getByLabel('Country basemap for Reported cumulative cases',{exact:true}).uncheck();
  await expect(contextMap.locator('path[data-country]')).toHaveCount(0);
  await contextMap.getByLabel('Country basemap for Reported cumulative cases',{exact:true}).check();
  await contextMap.getByRole('button',{name:'Reset view',exact:true}).click();
  for(const [width,height] of [[1366,768],[1920,1080],[2560,1440],[3440,1440],[3840,2160]]){
    await page.setViewportSize({width,height});
    const map=board.getByRole('region',{name:'Decision map',exact:true});
    await expect.poll(async()=> (await map.getByRole('img',{name:'Reported cumulative cases map',exact:true}).boundingBox()).height).toBeGreaterThan(180);
    const layout=await board.evaluate(el=>{
      const screen=el.firstElementChild;
      return {width:screen.clientWidth,scroll:screen.scrollWidth,title:parseFloat(getComputedStyle(screen.querySelector('h1')).fontSize)};
    });
    expect(layout.scroll).toBeLessThanOrEqual(layout.width+1);
    expect(layout.title).toBeLessThanOrEqual(24);
    for(const name of ['Decision province coverage','Decision health-zone trends']){
      const region=board.getByRole('region',{name,exact:true});
      expect((await region.boundingBox()).height).toBeGreaterThanOrEqual(180);
    }
    await page.screenshot({path:testInfo.outputPath(`responsive-${width}.png`)});
  }
  await board.getByRole('button',{name:'Exit full-screen dashboard'}).click();
  await expect(page.getByLabel('Health zone',{exact:true})).toHaveValue('');
  await expect(page.getByLabel('Province filter',{exact:true})).toHaveValue('');
});

test('reporting history includes unavailable zones, collapses provinces and links map and status counts',async({page})=>{
  const grouped=monitorBoundaries.map((area,i)=>({...area,properties:{...area.properties,province:i%2?'East province':'West province'}}));
  await openOutbreak(page,grouped,route=>{const kind=new URL(route.request().url()).searchParams.get('kind');return route.fulfill({json:kind==='indicators'?{datasets:[monitorCases]}:kind==='mines'?{data:[]}:kind==='relocations'?monitorMovement:{products:[]}});});
  await page.getByLabel('Reporting cut-off',{exact:true}).fill('2026-09-21');
  await page.getByRole('navigation',{name:'Dashboard views'}).getByRole('button',{name:'Reporting history',exact:true}).click();
  const history=page.getByRole('region',{name:'Horizontal reporting history',exact:true});
  const panel=page.getByRole('region',{name:'Reporting timeline',exact:true});
  await expect(history.locator('button[aria-expanded="true"]')).toHaveCount(1);
  await panel.getByRole('button',{name:'Expand all',exact:true}).click();
  for(const name of ['Rising','Declining','Quiet','Gap6','Never'])await expect(history.getByRole('button',{name,exact:true})).toBeVisible();
  await panel.getByRole('button',{name:'Collapse all',exact:true}).click();
  await expect(history.getByRole('button',{name:'Rising',exact:true})).toHaveCount(0);
  await panel.getByRole('button',{name:'Expand all',exact:true}).click();
  const statuses=page.getByRole('group',{name:'Filter reporting history by status',exact:true});
  await statuses.getByRole('button',{name:/Last available ≥42 days ago/}).click();
  await expect(history.getByRole('button',{name:'Gap6',exact:true})).toBeVisible();
  await expect(history.getByRole('button',{name:'Rising',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Clear status filter',exact:true}).click();
  const map=page.getByRole('region',{name:'Reporting status map',exact:true});
  await map.locator('text[data-admin="Gap6"]').click();
  await expect(history.getByRole('button',{name:'Gap6',exact:true})).toBeVisible();
  await expect(page.getByLabel('Selected reporting status',{exact:true})).toContainText('3 of 3 displayed weeks have no report available');
  await expect(page.getByLabel('Selected reporting status',{exact:true})).toContainText('Check for newer source publications');
  await page.getByRole('button',{name:'Full-screen dashboard',exact:true}).click();
  const board=page.getByRole('dialog',{name:'Decision dashboard',exact:true});
  await expect(board.getByRole('region',{name:'Horizontal reporting history',exact:true}).getByRole('button',{name:'Gap6',exact:true})).toBeVisible();
  await expect(board.getByLabel('Selected reporting status',{exact:true})).toContainText('Gap6');
});

test('reporting history switches between cards and compact heatmap without losing selection',async({page},testInfo)=>{
  await openMonitoring(page);
  await page.getByRole('navigation',{name:'Dashboard views'}).getByRole('button',{name:'Reporting history',exact:true}).click();
  const panel=page.getByRole('region',{name:'Reporting timeline',exact:true});
  const display=panel.getByRole('group',{name:'Reporting history display',exact:true});
  const history=panel.getByRole('region',{name:'Horizontal reporting history',exact:true});
  await expect(display.getByRole('button',{name:'Heatmap',exact:true})).toHaveAttribute('aria-pressed','true');
  await display.getByRole('button',{name:'Cards',exact:true}).click();
  const cell=history.getByRole('button',{name:/Rising: Reported increase/}).first();
  const cardHeight=(await cell.boundingBox()).height;
  await display.getByRole('button',{name:'Heatmap',exact:true}).click();
  await expect(panel.getByLabel('Reporting heatmap legend')).toBeVisible();
  await expect(history.getByRole('columnheader').nth(1)).toContainText('W37');
  await expect(history.getByRole('columnheader').nth(2)).toContainText('W38');
  await expect(history.getByRole('columnheader').nth(3)).toContainText('W39*');
  await expect(cell).toHaveAttribute('data-heat-band','+6–20');
  const larger=history.getByRole('button',{name:/Declining: Reported increase/}).first();
  await expect(larger).toHaveAttribute('data-heat-band','+51–100');
  expect(await cell.evaluate(el=>getComputedStyle(el).backgroundColor)).not.toBe(await larger.evaluate(el=>getComputedStyle(el).backgroundColor));
  expect((await cell.boundingBox()).height).toBeLessThan(cardHeight);
  const province=history.getByRole('button',{name:/Test province ·/});
  await province.click();
  await expect(history.getByRole('button',{name:'Rising',exact:true})).toHaveCount(0);
  await province.click();
  await cell.click();
  await expect(panel.getByLabel('Selected reporting week')).toContainText('Rising: Reported increase');
  await expect(page.getByLabel('Selected reporting status',{exact:true})).toContainText('Rising');
  await display.getByRole('button',{name:'Cards',exact:true}).click();
  await expect(cell).toContainText('Reported increase');
  await expect(history.getByRole('row').filter({has:page.getByRole('button',{name:'Rising',exact:true})})).toHaveAttribute('aria-selected','true');
  await display.getByRole('button',{name:'Heatmap',exact:true}).click();
  await page.getByRole('combobox',{name:'History window',exact:true}).selectOption('6');
  await expect(history.getByRole('columnheader')).toHaveCount(8);
  await expect(history.getByRole('button',{name:/Gap6: No report available/}).first()).toHaveText('×');
  await page.getByRole('button',{name:'Full-screen dashboard',exact:true}).click();
  const board=page.getByRole('dialog',{name:'Decision dashboard',exact:true});
  await expect(board.getByRole('group',{name:'Reporting history display'}).getByRole('button',{name:'Heatmap',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.setViewportSize({width:1920,height:1440});
  await board.getByRole('button',{name:'Focus Reporting timeline',exact:true}).click();
  const focused=page.getByRole('dialog',{name:'Reporting timeline',exact:true});
  const focusedHistory=focused.getByRole('region',{name:'Horizontal reporting history',exact:true});
  expect((await focusedHistory.boundingBox()).height).toBeGreaterThan(640);
  const focusBox=await focused.boundingBox(),historyBox=await focusedHistory.boundingBox();
  expect(focusBox.y+focusBox.height-historyBox.y-historyBox.height).toBeLessThan(180);
  await expect(focused.getByRole('columnheader').nth(1)).toContainText('W34');
  await page.screenshot({path:testInfo.outputPath('reporting-heatmap-focused.png')});
  await focused.getByRole('button',{name:'Return from Reporting timeline',exact:true}).click();
  await page.screenshot({path:testInfo.outputPath('reporting-heatmap.png')});
  await board.getByRole('button',{name:'Exit full-screen dashboard'}).click();
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});

test('reporting trend filter applies to map and both history displays',async({page})=>{
  await openMonitoring(page);
  await page.getByRole('navigation',{name:'Dashboard views'}).getByRole('button',{name:'Reporting history',exact:true}).click();
  const trend=page.getByRole('combobox',{name:'Health-zone trend',exact:true});
  const history=page.getByRole('region',{name:'Horizontal reporting history',exact:true});
  const map=page.getByRole('region',{name:'Reporting status map',exact:true});
  await trend.selectOption('rising');
  await expect(history.getByRole('button',{name:'Rising',exact:true})).toBeVisible();
  await expect(history.getByRole('button',{name:'Declining',exact:true})).toHaveCount(0);
  await expect(map.locator('path[data-admin="Rising"]')).not.toHaveAttribute('data-filtered-out','true');
  await expect(map.locator('path[data-admin="Declining"]')).toHaveAttribute('data-filtered-out','true');
  await history.getByRole('button',{name:'Rising',exact:true}).click();
  await trend.selectOption('declining');
  await expect(history.getByRole('button',{name:'Rising',exact:true})).toHaveCount(0);
  await expect(history.getByRole('button',{name:'Declining',exact:true})).toBeVisible();
  await expect(map.getByLabel('Selected reporting status',{exact:true})).not.toContainText('Rising');
  await page.getByRole('group',{name:'Reporting history display'}).getByRole('button',{name:'Heatmap',exact:true}).click();
  await trend.selectOption('steady');
  await expect(history.getByRole('button',{name:'Quiet',exact:true})).toBeVisible();
  await expect(map.locator('path[data-admin="Quiet"]')).not.toHaveAttribute('data-filtered-out','true');
  await expect(map.locator('text[data-admin="Declining"]')).toHaveCount(0);
  await page.getByLabel('Only zones with at least 3 weeks',{exact:true}).check();
  await expect(history.getByRole('button',{name:'Quiet',exact:true})).toHaveCount(0);
  await expect(map.locator('path[data-admin="Quiet"]')).toHaveAttribute('data-filtered-out','true');
  await page.getByLabel('Only zones with at least 3 weeks',{exact:true}).uncheck();
  await page.getByRole('button',{name:'Full-screen dashboard',exact:true}).click();
  const board=page.getByRole('dialog',{name:'Decision dashboard',exact:true});
  await expect(board.getByRole('combobox',{name:'Health-zone trend',exact:true})).toHaveValue('steady');
  await expect(board.getByRole('region',{name:'Horizontal reporting history',exact:true}).getByRole('button',{name:'Quiet',exact:true})).toBeVisible();
  await board.getByRole('combobox',{name:'Health-zone trend',exact:true}).selectOption('all');
  await expect(board.getByRole('region',{name:'Reporting status map',exact:true}).locator('[data-filtered-out="true"]')).toHaveCount(0);
});

test('reporting map hover repeats the weekly card observations and distinguishes the unchanged run',async({page})=>{
  await openMonitoring(page);
  await page.getByRole('navigation',{name:'Dashboard views'}).getByRole('button',{name:'Reporting history',exact:true}).click();
  await page.getByRole('combobox',{name:'Reporting measure',exact:true}).selectOption('quiet');
  const map=page.getByRole('region',{name:'Reporting status map',exact:true});
  const history=page.getByRole('region',{name:'Horizontal reporting history',exact:true});
  await page.getByLabel(/Show \d+ zones with only unchanged or missing weeks/).check();
  for(const weeks of ['3','6']){
    await page.getByRole('combobox',{name:'History window',exact:true}).selectOption(weeks);
    for(const zone of ['Quiet','Rising','Gap6']){
      const tooltip=await map.locator(`path[data-admin="${zone}"] > title`).textContent();
      expect(tooltip).toContain(`${weeks} epi weeks`);
      const cells=history.getByRole('button',{name:new RegExp(`^${zone}: `)});
      await expect(cells).toHaveCount(Number(weeks));
      for(const cell of await cells.all())expect(tooltip).toContain(await cell.getAttribute('aria-label'));
    }
  }
  await expect(map.locator('path[data-admin="Quiet"] > title')).toContainText('Unchanged for 42 days');
  await expect(map.locator('path[data-admin="Rising"] > title')).toContainText('Case trend: Rising reported rate');
  await page.getByRole('group',{name:'Reporting history display'}).getByRole('button',{name:'Heatmap',exact:true}).click();
  const cell=history.getByRole('button',{name:/^Rising: Reported increase/}).first();
  const text=await cell.getAttribute('aria-label');
  await cell.click();
  await expect(page.getByLabel('Selected reporting week')).toHaveText(text);
  await expect(map.locator('path[data-admin="Rising"] > title')).toContainText(text);
});

test('surveillance briefing exports a widescreen PNG and preserves filters and selection',async({page},testInfo)=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize({width:1440,height:900});
  await openMonitoring(page);
  await page.getByRole('navigation',{name:'Dashboard views'}).getByRole('button',{name:'Reporting history',exact:true}).click();
  const map=page.getByRole('region',{name:'Reporting status map',exact:true});
  await expect(map.getByRole('heading',{name:'Surveillance visibility',exact:true})).toBeVisible();
  await expect(map.locator('[data-reporting-signal="Rising"]')).toHaveCount(1);
  await expect(map.locator('[data-reporting-signal="Gap6"]')).toHaveCount(0);
  await expect(map.locator('path[data-admin="Never"]')).toHaveAttribute('fill',/url\(#unknown-/);
  await expect(map.getByLabel('Source follow-up priorities').locator('article').first()).toContainText('Gap6');
  await page.getByRole('button',{name:'Slide view · 16:9',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Reporting slide view',exact:true});
  const svg=dialog.getByRole('img',{name:'Surveillance visibility briefing slide',exact:true});
  await expect(svg).toHaveAttribute('viewBox','0 0 1600 900');
  await expect(dialog).toContainText('Slide 1 of 2');
  await expect(svg).toContainText('1. Gap6');
  await expect(svg).toContainText('42 days');
  const box=await svg.boundingBox();expect(box.width/box.height).toBeCloseTo(16/9,2);
  const bounds=await dialog.evaluate(el=>({scroll:el.scrollHeight,height:el.clientHeight}));
  expect(bounds.scroll).toBeLessThanOrEqual(bounds.height+1);
  await svg.screenshot({path:testInfo.outputPath('surveillance-slide.png')});
  const pending=page.waitForEvent('download');
  await dialog.getByRole('button',{name:'Download PNG · 1920 × 1080',exact:true}).click();
  const file=await pending;
  expect(file.suggestedFilename()).toBe('surveillance-visibility_2026-09-21_1.png');
  const destination=testInfo.outputPath('exported-slide.png');await file.saveAs(destination);
  const bytes=require('node:fs').readFileSync(destination);
  expect(bytes.subarray(1,4).toString()).toBe('PNG');expect(bytes.readUInt32BE(16)).toBe(1920);expect(bytes.readUInt32BE(20)).toBe(1080);
  await dialog.getByRole('button',{name:'Next',exact:true}).click();
  await expect(svg).toContainText('1. Receiver');
  await page.setViewportSize({width:1280,height:720});
  const smaller=await svg.boundingBox();expect(smaller.width/smaller.height).toBeCloseTo(16/9,2);
  expect((await dialog.boundingBox()).height).toBeLessThanOrEqual(720);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Slide view · 16:9',exact:true})).toBeFocused();
  const history=page.getByRole('region',{name:'Horizontal reporting history',exact:true});
  await page.getByRole('combobox',{name:'History window',exact:true}).selectOption('6');
  await history.getByRole('button',{name:'Rising',exact:true}).click();
  await page.getByRole('button',{name:'Full-screen dashboard',exact:true}).click();
  const board=page.getByRole('dialog',{name:'Decision dashboard',exact:true});
  await board.getByRole('button',{name:'Slide view · 16:9',exact:true}).click();
  await expect(svg).toContainText('W34');
  await svg.screenshot({path:testInfo.outputPath('surveillance-six-week-slide.png')});
  await expect(svg).toContainText('1. Rising');
  await page.keyboard.press('Escape');await expect(board).toBeVisible();
  await board.getByRole('combobox',{name:'Health-zone trend',exact:true}).selectOption('rising');
  await board.getByRole('button',{name:'Slide view · 16:9',exact:true}).click();
  await expect(dialog).toContainText('Slide 1 of 1');await expect(svg).toContainText('1 zone in scope');
  await expect(svg).not.toContainText('Gap6');
  expect(errors).toEqual([]);
});

test('province briefings distinguish sustained increases from old rising signals and export dated evidence',async({page},testInfo)=>{
  const names=['East 1','East 2','East 3','East 4','East 5','West fresh','East lost','West lost','East spike','No history'];
  const geo=names.map((nom,i)=>({...monitorBoundaries[0],id:nom,name:nom,properties:{...monitorBoundaries[0].properties,nom,province:nom.startsWith('East')?'East province':nom.startsWith('West')?'West province':'South province'},geometry:{type:'Polygon',coordinates:[[[25+i%5,1+Math.floor(i/5)],[26+i%5,1+Math.floor(i/5)],[26+i%5,2+Math.floor(i/5)],[25+i%5,2+Math.floor(i/5)],[25+i%5,1+Math.floor(i/5)]]]}}));
  const records=(location,values,dates=monitorDates)=>values.map((value,i)=>({location,value,date:dates[i]}));
  const cases={...dataset(),records:[...names.slice(0,5).flatMap((name,i)=>records(name,[0,10,30,70+i])),...records('West fresh',[0,0,1,4]),...records('East spike',[0,30,40,60]),...records('East lost',[0,40,50,80],['2026-07-20','2026-07-27','2026-08-03','2026-08-10']),...records('West lost',[0,10,30,70],['2026-07-27','2026-08-03','2026-08-10','2026-08-17'])]};
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize({width:1440,height:900});
  await openOutbreak(page,geo,route=>{const kind=new URL(route.request().url()).searchParams.get('kind');return route.fulfill({json:kind==='indicators'?{datasets:[cases]}:kind==='mines'?{data:[]}:kind==='relocations'?{...movement,routes:[]}:{products:[]}});});
  await page.getByLabel('Reporting cut-off',{exact:true}).fill('2026-09-21');
  await page.getByRole('navigation',{name:'Dashboard views'}).getByRole('button',{name:'Reporting history',exact:true}).click();
  // The province briefing uses its own criteria even when an outside trend filter
  // would exclude every old signal. The dashboard filter itself stays unchanged.
  await page.getByRole('combobox',{name:'Health-zone trend',exact:true}).selectOption('rising');
  await page.getByRole('button',{name:'Slide view · 16:9',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Reporting slide view',exact:true});
  const modes=dialog.getByRole('group',{name:'Briefing view',exact:true});
  await modes.getByRole('button',{name:'Sustained increases',exact:true}).click();
  await expect(dialog.getByRole('checkbox',{name:'Group slides by province',exact:true})).toBeChecked();
  const summary=dialog.getByRole('img',{name:'Province surveillance summary slide',exact:true});
  await expect(summary).toContainText('6 qualifying zones / 10 in scope');
  await expect(dialog).toContainText('Slide 1 of 4');
  expect((await summary.getByLabel('Province summary for East province').locator('text').allTextContents()).slice(1)).toEqual(['7','5','1','0']);
  expect((await summary.getByLabel('Province summary for West province').locator('text').allTextContents()).slice(1)).toEqual(['2','1','1','0']);
  await summary.screenshot({path:testInfo.outputPath('province-summary.png')});
  const exportSummary=page.waitForEvent('download');
  await dialog.getByRole('button',{name:'Download PNG · 1920 × 1080',exact:true}).click();
  const summaryFile=await exportSummary;expect(summaryFile.suggestedFilename()).toBe('sustained-increases_2026-09-21_1.png');
  await summaryFile.saveAs(testInfo.outputPath('province-summary-export.png'));
  await dialog.getByRole('button',{name:'Next',exact:true}).click();
  const slide=dialog.getByRole('img',{name:'Surveillance visibility briefing slide',exact:true});
  await expect(slide).toContainText('Province briefing · East province');
  await expect(slide.locator('[aria-label^="Interval evidence"]')).toHaveCount(4);
  await expect(slide).not.toContainText('East spike');await expect(slide).not.toContainText('West fresh');
  await expect(slide).toContainText('2026-08-31 → 2026-09-07');
  await expect(slide).toContainText('+10 reported · 1.43/day');
  await slide.screenshot({path:testInfo.outputPath('sustained-province-slide.png')});
  await dialog.getByRole('button',{name:'Next',exact:true}).click();await expect(slide.locator('[aria-label^="Interval evidence"]')).toHaveCount(1);
  await dialog.getByRole('button',{name:'Next',exact:true}).click();
  await expect(slide).toContainText('Province briefing · West province');
  await expect(slide).toContainText('from zero; % undefined');await expect(slide).toContainText('+3 reported');
  await modes.getByRole('button',{name:'Visibility lost',exact:true}).click();
  await expect(summary).toContainText('2 qualifying zones / 10 in scope');
  await expect(dialog).toContainText('Slide 1 of 3');
  await dialog.getByRole('button',{name:'Next',exact:true}).click();
  await expect(slide).toContainText('East lost');await expect(slide).toContainText('42 days old · 2026-08-10');
  await expect(slide).toContainText('2026-07-20 → 2026-07-27');await expect(slide).toContainText('I1 → I2 -75% · I2 → I3 +200%');
  const exportDetail=page.waitForEvent('download');await dialog.getByRole('button',{name:'Download PNG · 1920 × 1080',exact:true}).click();
  const detailFile=await exportDetail;expect(detailFile.suggestedFilename()).toBe('visibility-lost_2026-09-21_2.png');
  await detailFile.saveAs(testInfo.outputPath('visibility-lost-export.png'));
  await dialog.getByRole('combobox',{name:'Slide province',exact:true}).selectOption('West province');
  await expect(summary).toContainText('1 qualifying zone / 2 in scope');
  await dialog.getByRole('button',{name:'Next',exact:true}).click();await expect(slide).toContainText('West lost');await expect(slide).not.toContainText('East lost');
  await dialog.getByRole('combobox',{name:'Slide province',exact:true}).selectOption('South province');
  await expect(summary).toContainText('0 qualifying zones / 1 in scope');await expect(dialog.getByRole('button',{name:'Next',exact:true})).toBeDisabled();
  await dialog.getByRole('checkbox',{name:'Group slides by province',exact:true}).uncheck();
  await expect(slide).toContainText('No zones meet these criteria');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('combobox',{name:'Health-zone trend',exact:true})).toHaveValue('rising');
  // Advancing the cut-off moves formerly fresh increases into the historical view.
  await page.getByLabel('Reporting cut-off',{exact:true}).fill('2026-10-01');
  await page.getByRole('button',{name:'Slide view · 16:9',exact:true}).click();
  await modes.getByRole('button',{name:'Sustained increases',exact:true}).click();await expect(summary).toContainText('0 qualifying zones / 10 in scope');
  await modes.getByRole('button',{name:'Visibility lost',exact:true}).click();await expect(summary).toContainText('9 qualifying zones / 10 in scope');
  await page.setViewportSize({width:1280,height:720});
  const box=await summary.boundingBox();expect(box.width/box.height).toBeCloseTo(16/9,2);
  expect((await dialog.boundingBox()).height).toBeLessThanOrEqual(720);
  expect(errors).toEqual([]);
});

test('overview slides show scoped dated totals, a fixed reporting cohort and export from full screen',async({page},testInfo)=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize({width:1440,height:900});await openMonitoring(page);
  await page.getByRole('button',{name:'Slide view · 16:9',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Situation overview slide view',exact:true});
  let slide=dialog.getByRole('img',{name:'Situation at a glance slide',exact:true});
  await expect(slide).toContainText('376');await expect(slide).toContainText('3/7 areas have values on 2026-09-21');await expect(slide).toContainText('+131');
  await expect(slide).toContainText('12.2%');await expect(slide).toContainText('46 deaths / 376 cases');
  await expect(slide).toContainText('DRC Ebola');await slide.screenshot({path:testInfo.outputPath('overview-situation.png')});
  await dialog.getByRole('button',{name:'Next',exact:true}).click();
  const curve=dialog.getByRole('img',{name:'Reported changes over time slide',exact:true});
  await expect(curve).toContainText('Same 3 areas');await expect(curve).toContainText('cohort includes 3/3 areas');
  await expect(curve).toContainText('131 in 7 days');await curve.screenshot({path:testInfo.outputPath('overview-curve.png')});
  await dialog.getByRole('button',{name:'Next',exact:true}).click();
  const signals=dialog.getByRole('img',{name:'Health zones to investigate slide',exact:true});
  await expect(signals).toContainText('Zones selected: 1');
  await expect(signals.getByLabel('Priority history for Rising',{exact:true})).toContainText('+50');
  await expect(signals.getByLabel('Priority history for Rising',{exact:true})).toContainText('Two successive rate increases');
  await expect(signals.getByLabel('Priority history for Quiet',{exact:true})).toHaveCount(0);
  await expect(signals.getByLabel('Priority history for Declining',{exact:true})).toHaveCount(0);
  await signals.screenshot({path:testInfo.outputPath('overview-signals.png')});
  const signalsPending=page.waitForEvent('download');await dialog.getByRole('button',{name:'Download PNG · 1920 × 1080',exact:true}).click();
  await (await signalsPending).saveAs(testInfo.outputPath('overview-signals-export.png'));
  await dialog.getByRole('button',{name:'Next',exact:true}).click();
  const verification=dialog.getByRole('img',{name:'Priorities for verification slide',exact:true});
  await expect(verification).toContainText('Reported case fatality ratio');await expect(verification).toContainText('12.2%');await expect(verification).toContainText('46 confirmed deaths / 376 confirmed cases');await expect(verification).not.toContainText('Source coverage to clarify');
  await verification.screenshot({path:testInfo.outputPath('overview-cfr.png')});
  await dialog.getByRole('combobox',{name:'Slide trend window',exact:true}).selectOption('6');
  await dialog.getByRole('button',{name:'Next',exact:true}).click();await expect(curve).toContainText('Same 1 areas');await expect(curve).toContainText('cohort includes 1/3 areas');
  await page.keyboard.press('Escape');
  await page.getByLabel('Health zone',{exact:true}).selectOption('Rising');
  await page.getByRole('button',{name:'Slide view · 16:9',exact:true}).click();await expect(slide).toContainText('1/1 areas have values');await expect(slide).toContainText('95');await expect(slide).not.toContainText('376');
  await expect(slide).toContainText('20.0%');await expect(slide).toContainText('19 deaths / 95 cases');
  await page.keyboard.press('Escape');await page.getByRole('button',{name:'Full-screen dashboard',exact:true}).click();
  const board=page.getByRole('dialog',{name:'Decision dashboard',exact:true});
  await board.getByRole('button',{name:'Slide view · 16:9',exact:true}).click();
  const pending=page.waitForEvent('download');await dialog.getByRole('button',{name:'Download PNG · 1920 × 1080',exact:true}).click();
  const file=await pending;expect(file.suggestedFilename()).toBe('overview-briefing_2026-09-21_1.png');await file.saveAs(testInfo.outputPath('overview-export.png'));
  const bytes=require('node:fs').readFileSync(testInfo.outputPath('overview-export.png'));expect(bytes.readUInt32BE(16)).toBe(1920);expect(bytes.readUInt32BE(20)).toBe(1080);
  await page.keyboard.press('Escape');await expect(board).toBeVisible();
  expect(errors).toEqual([]);
});

test('burden slides honor metric and movement direction without treating historical links as exposure',async({page},testInfo)=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewportSize({width:1440,height:900});await openMonitoring(page);
  await page.getByRole('navigation',{name:'Dashboard views'}).getByRole('button',{name:'High burden & movement',exact:true}).click();
  await page.getByRole('combobox',{name:'Rank zones by',exact:true}).selectOption('recent');
  await page.getByRole('button',{name:'Slide view · 16:9',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Burden and movement slide view',exact:true});
  const ranking=dialog.getByRole('img',{name:'Where reported burden is concentrated slide',exact:true});
  await expect(ranking).toContainText('2026-09-14–2026-09-21');await expect(ranking).toContainText('2 priority areas');await expect(ranking.getByLabel('Ranked area Declining')).toContainText('81');
  await ranking.screenshot({path:testInfo.outputPath('burden-ranking.png')});
  await dialog.getByRole('button',{name:'Next',exact:true}).click();
  const movementSlide=dialog.getByRole('img',{name:'Movement context · Declining slide',exact:true});
  await expect(movementSlide).toContainText('Historical outflow from Declining');await expect(movementSlide).toContainText('2026-04-01–2026-04-30');
  await expect(movementSlide.getByLabel('Declining to Receiver')).toContainText('50 estimated relocations');await expect(movementSlide).toContainText('does not identify exposure');
  const pending=page.waitForEvent('download');await dialog.getByRole('button',{name:'Download PNG · 1920 × 1080',exact:true}).click();const file=await pending;await file.saveAs(testInfo.outputPath('movement-export.png'));
  await page.keyboard.press('Escape');
  await page.getByRole('combobox',{name:'Movement direction',exact:true}).selectOption('inflow');
  await page.getByRole('button',{name:'Slide view · 16:9',exact:true}).click();await dialog.getByRole('button',{name:'Next',exact:true}).click();
  await expect(movementSlide.getByLabel('Receiver to Declining')).toContainText('20 estimated relocations');await expect(movementSlide).toContainText('Historical inflow to Declining');
  await page.setViewportSize({width:1280,height:720});const box=await movementSlide.boundingBox();expect(box.width/box.height).toBeCloseTo(16/9,2);
  expect(errors).toEqual([]);
});

test('case trend slides retain assessment filters, thresholds and dated evidence',async({page},testInfo)=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewportSize({width:1440,height:900});await openMonitoring(page);
  await page.getByRole('navigation',{name:'Dashboard views'}).getByRole('button',{name:'Case trends',exact:true}).click();
  await page.getByRole('button',{name:'Slide view · 16:9',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Case trend assessment slide view',exact:true});
  const summary=dialog.getByRole('img',{name:'How reported case rates are changing slide',exact:true});
  await expect(summary).toContainText('2 areas in the dashboard comparison selection');await expect(summary).toContainText('10% threshold');await summary.screenshot({path:testInfo.outputPath('case-trend-summary.png')});
  await dialog.getByRole('button',{name:'Next',exact:true}).click();
  const detail=dialog.getByRole('img',{name:'Case trend evidence · Test province slide',exact:true});
  await expect(detail.getByLabel('Trend evidence for Rising')).toContainText('+50 reported');await expect(detail.getByLabel('Trend evidence for Declining')).toContainText('-10%');await detail.screenshot({path:testInfo.outputPath('case-trend-evidence.png')});
  const pending=page.waitForEvent('download');await dialog.getByRole('button',{name:'Download PNG · 1920 × 1080',exact:true}).click();const file=await pending;await file.saveAs(testInfo.outputPath('case-trend-export.png'));
  await page.keyboard.press('Escape');await page.getByLabel('Sustained decline threshold (%)',{exact:true}).fill('11');
  await page.getByRole('group',{name:'Filter comparisons by assessment',exact:true}).getByRole('button',{name:/Declining \/ not sustained/}).click();
  await page.getByRole('button',{name:'Slide view · 16:9',exact:true}).click();await expect(summary).toContainText('1 areas in the dashboard comparison selection');await expect(summary).toContainText('11% threshold');
  await dialog.getByRole('button',{name:'Next',exact:true}).click();await expect(detail).not.toContainText('Trend evidence for Rising');await expect(detail).toContainText('Declining / not sustained');
  await page.keyboard.press('Escape');await page.getByRole('button',{name:'Full-screen dashboard',exact:true}).click();const board=page.getByRole('dialog',{name:'Decision dashboard',exact:true});await board.getByRole('button',{name:'Slide view · 16:9',exact:true}).click();await expect(summary).toBeVisible();await page.keyboard.press('Escape');await expect(board).toBeVisible();
  expect(errors).toEqual([]);
});
