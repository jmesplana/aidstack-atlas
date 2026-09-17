const { test, expect } = require('@playwright/test');
const { readFileSync } = require('node:fs');
const XLSX = require('xlsx');

const areas=[{id:'A',name:'A',properties:{nom:'A'},geometry:{type:'Polygon',coordinates:[[[29,1],[30,1],[30,2],[29,2],[29,1]]]}}];
test('daily briefing retains separate snapshots, action evidence and the chosen comparison in exports',async({page},testInfo)=>{
  await openOutbreak(page,areas);
  await page.getByLabel('Reporting cut-off',{exact:true}).fill('2026-09-08');
  await upload(page,'zone,date,completed\nA,2026-09-01,5\nA,2026-09-08,10\n');
  await page.getByLabel('Indicator label',{exact:true}).fill('Area cases');
  await page.getByRole('combobox',{name:'Measure type',exact:true}).selectOption('cumulative');
  await page.getByRole('combobox',{name:'Analysis role',exact:true}).selectOption('cases');
  await page.getByRole('button',{name:'Confirm mapped import',exact:true}).click();
  await page.getByRole('button',{name:'Situation',exact:true}).click();
  await page.getByRole('button',{name:'Add to response plan',exact:true}).first().click();
  await page.getByRole('button',{name:/Save snapshot/}).click();
  await expect(page.getByLabel('Saved snapshots').locator('option')).toHaveCount(2);
  await page.getByRole('button',{name:'Use open snapshot as baseline'}).click();
  await expect(page.getByRole('region',{name:'Changes since comparison brief'})).toContainText('Since last brief');
  await page.getByRole('button',{name:'3. Assign response actions'}).click();
  await page.getByLabel('Owner',{exact:true}).fill('Response coordinator');
  await page.getByLabel('Due date',{exact:true}).fill('2026-09-09');
  await page.getByRole('combobox',{name:'Status',exact:true}).selectOption('Approved');
  await page.getByRole('button',{name:'4. Review and export brief'}).click();
  await expect(page.getByRole('region',{name:'Changes since comparison brief'})).toContainText('Proposed → Approved');
  await expect(page.getByRole('region',{name:'Briefing evidence readiness'})).not.toBeVisible();
  for(const button of ['Export briefing Markdown','Export briefing HTML with visuals']){
    const pending=page.waitForEvent('download');await page.getByRole('button',{name:button,exact:true}).click();
    const download=await pending,file=testInfo.outputPath(`without-dates-${button.endsWith('Markdown')?'md':'html'}`);await download.saveAs(file);
    expect(readFileSync(file,'utf8')).not.toContain('Evidence dates and gaps');
  }
  await page.getByLabel('Include evidence dates and gaps in the exported report').check();
  await page.getByLabel('I have reviewed this snapshot and its evidence for sharing.').check();
  await page.getByRole('button',{name:/Save snapshot/}).click();
  await expect(page.getByLabel('Saved snapshots').locator('option')).toHaveCount(3);
  await page.getByLabel('Saved snapshots').selectOption({index:1});
  await expect(page.getByText('Reviewed by user',{exact:true})).toBeVisible();
  await expect(page.getByLabel('Include evidence dates and gaps in the exported report')).toBeChecked();
  await expect(page.getByRole('region',{name:'Changes since comparison brief'})).toContainText('Proposed → Approved');
  for(const [button,extension] of [['Export briefing Markdown','md'],['Export briefing HTML with visuals','html']]){
    const pending=page.waitForEvent('download');await page.getByRole('button',{name:button,exact:true}).click();
    const download=await pending,file=testInfo.outputPath(`daily-brief.${extension}`);await download.saveAs(file);
    const text=readFileSync(file,'utf8');expect(text).toContain('Response coordinator');expect(text).toContain('Proposed → Approved');expect(text).toContain('2026-09-09');expect(text).toContain('Evidence dates and gaps');
  }
  await page.getByLabel('Saved snapshots').selectOption({index:2});
  await page.getByRole('button',{name:'Response & decisions',exact:true}).click();
  await expect(page.getByLabel('Owner',{exact:true})).toHaveValue('');
  await expect(page.getByRole('combobox',{name:'Status',exact:true})).toHaveValue('Proposed');
});
test('key message leads with weekly trend, then province focus, and retains that flow in exports',async({page},testInfo)=>{
  const cutOff='2026-09-11';
  const datasets=[
    {id:'area-cases',metricId:'cumulative_confirmed_cases',purpose:'cases',label:'Area confirmed cases',unit:'people',kind:'cumulative',level:'health_zone',status:'ready',source:'Fixture cases',records:[{location:'A',date:'2026-09-04',value:12},{location:'A',date:cutOff,value:20}]},
    {id:'national-daily',metricId:'national_new_confirmed_cases',purpose:'cases',label:'Reported confirmed cases',unit:'cases',kind:'daily',level:'national',status:'ready',source:'Fixture national reports',records:Array.from({length:14},(_,i)=>({location:'Country',date:new Date(Date.parse(cutOff)-i*86400000).toISOString().slice(0,10),value:i<7?2:4}))}
  ];
  await openOutbreak(page,[{...areas[0],properties:{nom:'A',province:'Province B'}}],route=>{
    const kind=new URL(route.request().url()).searchParams.get('kind');
    return route.fulfill({json:kind==='indicators'?{datasets}:kind==='mines'?{data:[],url:'https://example.test/mines'}:kind==='relocations'?{routes:[],start:'2026-08-01',end:'2026-08-31',unit:'people',source:'Fixture'}:{products:[]}});
  });
  await page.getByLabel('Reporting cut-off',{exact:true}).fill(cutOff);
  await page.getByRole('button',{name:'Data & uploads',exact:true}).click();
  await dataTask(page,'Connected sources');
  await page.getByLabel('Optional public source preset').selectOption('drc');
  await expect(page.getByRole('button',{name:'Refresh data',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'Situation',exact:true}).click();
  const key=page.getByRole('region',{name:'Key message',exact:true});
  await expect(key.locator(':scope > p').nth(0)).toContainText('decreased: 14 versus 28 cases');
  await expect(key.locator(':scope > p').nth(1)).toContainText('Province B — A (+8)');
  await expect(key.locator(':scope > p').nth(2)).toContainText('review case investigations');
  const wording=(await key.locator(':scope > p').allTextContents()).join('\n\n');
  await page.getByRole('button',{name:'Briefing',exact:true}).click();
  await expect(key.locator(':scope > p').nth(0)).toContainText('decreased: 14 versus 28 cases');
  for(const [button,format] of [['Export briefing Markdown','md'],['Export briefing HTML with visuals','html']]) {
    const downloadPromise=page.waitForEvent('download');
    await page.getByRole('button',{name:button,exact:true}).click();
    const download=await downloadPromise;
    const file=testInfo.outputPath(`trend-first.${format}`);
    await download.saveAs(file);
    const contents=readFileSync(file,'utf8');
    expect(contents.indexOf('decreased: 14 versus 28 cases')).toBeLessThan(contents.indexOf('Province B — A (+8)'));
    if(format==='md')expect(contents).toContain(wording);
  }
  await page.getByLabel('Bottom line for decision-makers',{exact:false}).fill('Coordinator decision: confirm staffing.');
  await expect(key.locator(':scope > p')).toHaveCount(1);
  await expect(key.locator(':scope > p')).toHaveText('Coordinator decision: confirm staffing.');
});
test('uploaded mining history and case replacements survive refresh and saved snapshots',async({page})=>{
  const sourceId='insp:cumulative_confirmed_cases';
  const seed=[{...areas[0],properties:{nom:'A',insp_sitrep:{cumulative_confirmed_cases:{_date:'2026-09-08',cumulative_confirmed_cases:3}}}}];
  let mineRequests=0;
  await openOutbreak(page,seed,route=>{
    const kind=new URL(route.request().url()).searchParams.get('kind');
    if(kind==='mines')mineRequests++;
    const data=kind==='indicators'?{datasets:[{id:sourceId,metricId:'cumulative_confirmed_cases',purpose:'cases',origin:'public',status:'ready',level:'health_zone',kind:'cumulative',label:'Public cases',unit:'people',records:[{location:'A',date:'2026-09-08',value:3}]}]}:kind==='mines'?{origin:'public',data:[{id:'public-mine',name:'Public mine',date:'2026-01-01',latitude:1.2,longitude:29.2}],url:'https://example.test/ipis'}:kind==='relocations'?{origin:'public',routes:[],start:'2026-08-01',end:'2026-08-31',unit:'people',source:'Fixture'}:{products:[]};
    return route.fulfill({json:data});
  });
  await page.getByLabel('Reporting cut-off',{exact:true}).fill('2026-09-08');
  await expect(page.getByRole('region',{name:'Overall snapshot'})).toContainText('3');
  await page.getByRole('button',{name:'Data & uploads',exact:true}).click();
  const workbook=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook,XLSX.utils.json_to_sheet([{note:'Choose Visits'}]),'Notes');
  XLSX.utils.book_append_sheet(workbook,XLSX.utils.json_to_sheet([{code:'uploaded-mine',visited:46267,lat:1.3,lon:29.3,label:'Older visit'},{code:'uploaded-mine',visited:46276,lat:1.7,lon:29.7,label:'Later visit'}]),'Visits');
  const mining=page.getByRole('region',{name:'Mining data upload'});
  await dataTask(page,'Maps & context');
  await mining.getByLabel('IPIS workbook or CSV').setInputFiles({name:'new-mines.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:XLSX.write(workbook,{type:'buffer',bookType:'xlsx'})});
  await mining.getByRole('combobox',{name:'Mining worksheet',exact:true}).selectOption('Visits');
  for(const [name,column] of [['Mine ID','code'],['Mine visit date','visited'],['Mine latitude','lat'],['Mine longitude','lon'],['Mine name (optional)','label']])await mining.getByRole('combobox',{name,exact:true}).selectOption(column);
  await expect(mining).toContainText('2 validated visits; 1 eligible unique sites');
  await expect(mining).toContainText('1 added, 0 changed, 1 removed');
  await mining.getByRole('button',{name:/Use uploaded mining data/}).click();
  await expect(mining).toContainText('Active source: new-mines.xlsx · worksheet Visits');
  await dataTask(page,'Numeric data');
  await page.getByRole('combobox',{name:'Import mode',exact:true}).selectOption(sourceId);
  await upload(page,'zone,date,completed\nA,2026-09-01,50\nA,2026-09-08,70\n');
  await page.getByLabel('Indicator label',{exact:true}).fill('Uploaded confirmed cases');
  await page.getByRole('combobox',{name:'Measure type',exact:true}).selectOption('cumulative');
  await page.getByRole('combobox',{name:'Analysis role',exact:true}).selectOption('cases');
  await expect(page.getByText('1 observations added, 1 changed, 0 removed.',{exact:false})).toBeVisible();
  await page.getByRole('button',{name:'Confirm mapped import',exact:true}).click();
  await page.getByRole('button',{name:'Situation',exact:true}).click();
  await expect(page.getByRole('region',{name:'Key message',exact:true})).toContainText('A (+20)');
  await page.getByText('Explore an area',{exact:true}).click();
  const map=page.getByRole('img',{name:'Uploaded confirmed cases map',exact:true});
  await expect(map.locator('[data-ipis-site="uploaded-mine"] title')).toHaveText(/Older visit/);
  await page.getByLabel('Reporting cut-off',{exact:true}).fill('2026-09-12');
  await expect(map.locator('[data-ipis-site="uploaded-mine"] title')).toHaveText(/Later visit/);
  const requestsBefore=mineRequests;
  await page.getByRole('button',{name:'Refresh data',exact:true}).click();
  await expect(page.getByRole('button',{name:'Refresh data',exact:true})).toBeEnabled();
  expect(mineRequests).toBe(requestsBefore);
  await expect(page.getByRole('region',{name:'Key message',exact:true})).toContainText('A (+20)');
  await expect(map.locator('[data-ipis-site="uploaded-mine"]')).toHaveCount(1);
  await page.getByRole('button',{name:/Save snapshot/}).click();
  await expect(page.getByText('Snapshot saved in this browser workspace.')).toBeVisible();
  await page.getByRole('button',{name:'Data & uploads',exact:true}).click();
  await dataTask(page,'Maps & context');
  await mining.getByLabel('IPIS workbook or CSV').setInputFiles({name:'replacement-mines.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:XLSX.write(workbook,{type:'buffer',bookType:'xlsx'})});
  await expect(mining.getByRole('combobox',{name:'Mining worksheet',exact:true})).toHaveValue('Visits');
  await expect(mining.getByRole('combobox',{name:'Mine ID',exact:true})).toHaveValue('code');
  await mining.getByRole('button',{name:/Use uploaded mining data/}).click();
  page.once('dialog',d=>d.accept());
  await page.getByLabel('Saved snapshots').selectOption({index:1});
  await expect(mining).toContainText('Active source: new-mines.xlsx');
  await page.getByRole('button',{name:'Situation',exact:true}).click();
  await page.getByLabel('Reporting cut-off',{exact:true}).fill('2026-09-08');
  await expect(map.locator('[data-ipis-site="uploaded-mine"] title')).toHaveText(/Older visit/);
});
test('mobility maps share IPIS and ACLED toggles through directions, briefing, export and snapshot',async({page},testInfo)=>{
  const seed=[{...areas[0],properties:{nom:'A',insp_sitrep:{cumulative_confirmed_cases:{_date:'2026-09-08',cumulative_confirmed_cases:3}},flowminder:{inflow_20260901:{inflow_20260901:5},outflow_20260901:{outflow_20260901:8}}}},
    {id:'B',name:'B',properties:{nom:'B'},geometry:{type:'Polygon',coordinates:[[[30,1],[31,1],[31,2],[30,2],[30,1]]]}}];
  const mine={id:'mine-1',name:'Recorded mine',date:'2026-08-01',latitude:1.4,longitude:29.4};
  const event={event_id:'event-1',event_date:'2026-09-01',latitude:1.6,longitude:29.6,fatalities:0,event_type:'Protests'};
  await openOutbreak(page,seed,route=>{
    const kind=new URL(route.request().url()).searchParams.get('kind');
    const data=kind==='mines'?{data:[mine,{...mine,id:'future-mine',date:'2099-01-01'}],url:'https://example.test/ipis'}:kind==='relocations'?{routes:[{origin:'A',destination:'B',value:20},{origin:'B',destination:'A',value:10}],start:'2026-08-01',end:'2026-08-31',unit:'estimated relocations',source:'Fixture mobility'}:kind==='indicators'?{datasets:[]}:{products:[]};
    return route.fulfill({json:data});
  },[event,{...event,event_id:'old-event',event_date:'2020-01-01'}]);
  await page.getByLabel('Reporting cut-off',{exact:true}).fill('2026-09-08');
  await expect(page.getByRole('img',{name:'Outflow from A map',exact:true})).toBeVisible();
  await expect(page.getByRole('img',{name:'Outflow from A map',exact:true}).locator('xpath=ancestor::details')).toHaveCount(0);
  await page.getByRole('button',{name:'Inflow map',exact:true}).click();
  await expect(page.getByRole('img',{name:'Inflow to A map',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Outflow map',exact:true}).click();
  await page.getByText('Explore an area',{exact:true}).click();
  const controls=page.getByRole('group',{name:'Overlays for Outflow from A',exact:true});
  await expect(controls.getByRole('checkbox',{name:'IPIS mining sites',exact:true})).toBeEnabled();
  await controls.getByRole('checkbox',{name:'IPIS mining sites',exact:true}).check();
  const outflow=page.getByRole('img',{name:'Outflow from A map',exact:true});
  await expect(outflow.locator('[data-ipis-site]')).toHaveCount(1);
  await expect(outflow.locator('[data-acled-event]')).toHaveCount(1);
  await controls.getByRole('checkbox',{name:'ACLED security events',exact:true}).uncheck();
  await expect(outflow.locator('[data-acled-event]')).toHaveCount(0);
  await page.getByRole('combobox',{name:'Route direction',exact:true}).selectOption('inflow');
  const inflow=page.getByRole('img',{name:'Inflow to A map',exact:true});
  await expect(inflow.locator('[data-ipis-site]')).toHaveCount(1);
  await expect(inflow.locator('[data-acled-event]')).toHaveCount(0);
  await page.getByText('Additional comparisons and mobility indicators',{exact:true}).click();
  const cohort=page.getByRole('group',{name:/Overlays for Outflow —/});
  await expect(cohort.getByRole('checkbox',{name:'IPIS mining sites',exact:true})).toBeChecked();
  await cohort.getByRole('checkbox',{name:'ACLED security events',exact:true}).check();
  await expect(inflow.locator('[data-acled-event]')).toHaveCount(1);
  await page.getByRole('combobox',{name:'Movement direction',exact:true}).selectOption('inflow');
  const cohortMap=page.getByRole('img',{name:/^Inflow —.* map$/});
  await expect(cohortMap.locator('[data-ipis-site]')).toHaveCount(1);
  await expect(cohortMap.locator('[data-acled-event]')).toHaveCount(1);
  await page.getByRole('button',{name:'Briefing',exact:true}).click();
  await expect(inflow.locator('[data-ipis-site]')).toHaveCount(1);
  await page.getByRole('button',{name:'Outflow map',exact:true}).click();
  await expect(page.getByRole('img',{name:'Outflow from A map',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Inflow map',exact:true}).click();
  await expect(inflow.locator('[data-acled-event]')).toHaveCount(1);
  await inflow.screenshot({path:testInfo.outputPath('mobility-overlays.png')});
  await page.getByRole('checkbox',{name:'Include detailed evidence and extra maps in this briefing and exports'}).check();
  const appendix=page.getByRole('region',{name:'Evidence appendix'});
  await expect(appendix.getByRole('img',{name:/^Inflow —.* map$/}).locator('[data-ipis-site]')).toHaveCount(1);
  await appendix.getByRole('checkbox',{name:'IPIS mining sites',exact:true}).first().uncheck();
  await expect(page.locator('[data-ipis-site]')).toHaveCount(0);
  const exportEvent=page.waitForEvent('download');
  await page.getByRole('button',{name:'Export briefing HTML with visuals'}).click();
  const html=readFileSync(await (await exportEvent).path(),'utf8');
  expect(html).toContain('data-acled-event="event-1"');
  expect(html).toContain('ACLED: 2026-08-05–2026-09-01');
  expect(html).not.toContain('data-ipis-site');
  expect(html).not.toContain('Overlays for');
  await page.getByRole('button',{name:/Save snapshot/}).click();
  await page.getByRole('button',{name:'Situation',exact:true}).click();
  await page.getByRole('group',{name:'Overlays for Inflow to A',exact:true}).getByRole('checkbox',{name:'IPIS mining sites',exact:true}).check();
  page.once('dialog',dialog=>dialog.accept());
  await page.getByLabel('Saved snapshots').selectOption({index:1});
  await expect(page.getByRole('group',{name:'Overlays for Inflow to A',exact:true}).getByRole('checkbox',{name:'IPIS mining sites',exact:true})).not.toBeChecked();
});
async function openOutbreak(page, boundaries=[], sourceHandler=null, acledData=[]) {
  await page.route('**/api/**',route=>route.fulfill({json:route.request().url().includes('/gdacs')?[]:{reports:[],mapFeatures:[]}}));
  await page.route(/^https?:\/\/(?!127\.0\.0\.1|localhost).*$/,route=>route.abort());
  if(sourceHandler)await page.route('**/api/outbreak-data?*',sourceHandler);
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
  const card=page.locator('article').filter({has:page.getByRole('heading',{name:'Outbreak Response',exact:true})});
  await card.getByRole('button',{name:'Install app',exact:true}).click();
  await card.getByRole('button',{name:'Open',exact:true}).click();
  await expect(page.getByRole('region',{name:'Outbreak response'})).toBeVisible();
}
async function dataTask(page,name) {
  await page.getByRole('navigation',{name:'Data tasks'}).getByRole('button',{name:new RegExp('^'+name)}).click();
}
async function upload(page,text) {
  await page.getByRole('button',{name:'Data & uploads',exact:true}).click();
  await dataTask(page,'Numeric data');
  await page.getByLabel('Dataset file').setInputFiles({name:'sdb.csv',mimeType:'text/csv',buffer:Buffer.from(text)});
  await page.getByRole('combobox',{name:'Location column',exact:true}).selectOption('zone');
  await page.getByRole('combobox',{name:'Reporting date column',exact:true}).selectOption('date');
  await page.getByRole('combobox',{name:'Value column',exact:true}).selectOption('completed');
  await page.getByLabel('Indicator label').fill('SDB completed');
  await page.getByLabel('Unit (people, requests, teams…)').fill('burials');
}

test('upload, map, chart, evidence validation, decisions and snapshot reopen',async({page},testInfo)=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await openOutbreak(page,areas);
  await page.getByLabel('Reporting cut-off').fill('2026-09-02');
  await upload(page,'zone,date,completed\nA,2026-09-01,12\nA,2026-09-02,0\nB,2026-09-02,ND\n');
  await expect(page.getByText('3 validated observations; 1 missing values. No data has been imported yet.')).toBeVisible();
  await page.getByRole('button',{name:'Confirm mapped import'}).click();
  await page.getByRole('button',{name:'Situation',exact:true}).click();
  await expect(page.getByRole('img',{name:'SDB completed trend for A'})).toBeVisible();
  await expect(page.getByRole('img',{name:'SDB completed map'})).toBeVisible();
  await expect(page.getByText('1 unmatched locations (not mapped): B')).toBeVisible();
  await expect(page.getByRole('cell',{name:'Not reported',exact:true})).toBeVisible();
  const svgDownload=page.waitForEvent('download');
  await page.getByRole('button',{name:'Export map SVG'}).click();
  expect((await svgDownload).suggestedFilename()).toBe('outbreak-map.svg');
  await page.getByRole('button',{name:'Response & decisions',exact:true}).click();
  await page.getByRole('button',{name:'Add decision / action'}).click();
  await page.getByLabel('Owner',{exact:true}).fill('Coordinator');
  await page.getByLabel('Action, rationale and decision requested').fill('Verify team availability with zone focal point.');
  await page.getByRole('button',{name:'Briefing',exact:true}).click();
  // New leadership-facing sections: response status rollup and coordinator calls to action.
  await expect(page.getByRole('region',{name:'Response status'}).first()).toBeVisible();
  await expect(page.getByRole('heading',{name:'Calls to action / decisions requested'})).toBeVisible();
  await expect(page.getByText('SDB completed: 0 burials reported for A (health_zone) on 2026-09-02.',{exact:false}).first()).toBeVisible();
  // A bogus AI reference must never replace the verified narrative.
  await page.route('**/api/outbreak-briefing',route=>route.fulfill({json:{ids:['invented']}}));
  await page.getByRole('button',{name:'Use AI to select leadership messages'}).click();
  await expect(page.getByRole('region',{name:'Outbreak response'}).getByRole('alert')).toContainText('unsupported evidence');
  await expect(page.getByRole('region',{name:'Outbreak response'}).getByRole('img')).toHaveCount(1);
  const appendix=page.getByRole('checkbox',{name:'Include detailed evidence and extra maps in this briefing and exports'});
  await appendix.check();
  await expect(page.getByRole('region',{name:'Evidence appendix'})).toBeVisible();
  await appendix.uncheck();
  await expect(page.getByRole('region',{name:'Evidence appendix'})).toHaveCount(0);
  await page.getByRole('checkbox',{name:'I have reviewed this snapshot and its evidence for sharing.'}).check();
  await page.getByRole('button',{name:/Save snapshot/}).click();
  await expect(page.getByText('Snapshot saved in this browser workspace.')).toBeVisible();
  const evidenceDownload=page.waitForEvent('download');
  await page.getByRole('button',{name:'Export evidence JSON'}).click();
  expect((await evidenceDownload).suggestedFilename()).toBe('outbreak-evidence.json');
  const htmlDownload=page.waitForEvent('download');
  await page.getByRole('button',{name:'Export briefing HTML with visuals'}).click();
  const html=readFileSync(await (await htmlDownload).path(),'utf8');
  expect(html).toContain('<svg');expect(html).not.toContain('Use AI to select');
  expect(html).toContain('Verify team availability with zone focal point.');
  const printable=await page.context().newPage();
  await printable.setContent(html);
  await expect(printable.getByRole('img',{name:'SDB completed map'})).toBeVisible();
  await printable.pdf({path:testInfo.outputPath('outbreak-briefing.pdf'),format:'A4',printBackground:true});
  await printable.screenshot({path:testInfo.outputPath('outbreak-printable.png'),fullPage:true});
  await printable.close();
  await page.screenshot({path:testInfo.outputPath('outbreak-briefing.png'),fullPage:true});
  await page.getByRole('button',{name:'Close apps',exact:true}).click();
  await page.getByRole('button',{name:'Workspace apps',exact:true}).click();
  await page.locator('article').filter({has:page.getByRole('heading',{name:'Outbreak Response',exact:true})}).getByRole('button',{name:'Open',exact:true}).click();
  await page.getByLabel('Saved snapshots').selectOption({index:1});
  await page.getByRole('button',{name:'Briefing',exact:true}).click();
  await expect(page.getByText('Reviewed by user',{exact:true})).toBeVisible();
  await expect(page.getByText('Verify team availability with zone focal point.',{exact:true})).toBeVisible();
  expect(errors).toEqual([]);
});

test('Excel dates, multiple worksheets and JSON aggregates import without date or precision loss',async({page})=>{
  await openOutbreak(page);
  await page.getByRole('button',{name:'Data & uploads',exact:true}).click();
  const workbook=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([['ignore'],['other data']]),'Other');
  XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([['zone','date','completed'],['A',46267,0.0001]]),'Observations');
  // Excel serial 46267 is 2026-09-02 in the 1900 date system.
  await dataTask(page,'Numeric data');
  await page.getByLabel('Dataset file').setInputFiles({name:'sdb.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:XLSX.write(workbook,{type:'buffer',bookType:'xlsx'})});
  await page.getByRole('combobox',{name:'Worksheet',exact:true}).selectOption('Observations');
  await page.getByRole('combobox',{name:'Location column',exact:true}).selectOption('zone');
  await page.getByRole('combobox',{name:'Reporting date column',exact:true}).selectOption('date');
  await page.getByRole('combobox',{name:'Value column',exact:true}).selectOption('completed');
  await page.getByLabel('Indicator label').fill('Example fractional measure');
  await page.getByLabel('Unit (people, requests, teams…)').fill('units');
  await page.getByRole('button',{name:'Confirm mapped import'}).click();
  await page.getByRole('button',{name:'Situation',exact:true}).click();
  await expect(page.getByRole('cell',{name:'2026-09-02',exact:true})).toBeVisible();
  await expect(page.getByRole('cell',{name:'0.0001',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Data & uploads',exact:true}).click();
  await dataTask(page,'Numeric data');
  await page.getByLabel('Dataset file').setInputFiles({name:'aggregate.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify([{zone:'B',date:'2026-09-02',completed:3}]))});
  await page.getByRole('combobox',{name:'Location column',exact:true}).selectOption('zone');
  await page.getByRole('combobox',{name:'Reporting date column',exact:true}).selectOption('date');
  await page.getByRole('combobox',{name:'Value column',exact:true}).selectOption('completed');
  await page.getByLabel('Indicator label').fill('Teams');
  await page.getByLabel('Unit (people, requests, teams…)').fill('teams');
  await page.getByRole('button',{name:'Confirm mapped import'}).click();
  await page.getByRole('button',{name:'Situation',exact:true}).click();
  await expect(page.getByRole('cell',{name:'3',exact:true})).toBeVisible();
});

test('no-boundary global analysis rejects malformed uploads and fits mobile',async({page},testInfo)=>{
  await page.setViewportSize({width:390,height:844});
  await openOutbreak(page);
  await page.getByRole('button',{name:'New outbreak',exact:true}).click();
  await page.getByLabel('Outbreak / operational scope').fill('Synthetic global outbreak');
  await upload(page,'zone,date,completed\nCountry A,2026-09-01,17-\n');
  await expect(page.getByRole('button',{name:'Confirm mapped import'})).toBeDisabled();
  await expect(page.getByText(/Invalid non-negative number: 17-/)).toBeVisible();
  await upload(page,'zone,date,completed\nCountry A,2026-09-01,5\n');
  await page.getByRole('combobox',{name:'Geographic level',exact:true}).selectOption('national');
  await page.getByRole('button',{name:'Confirm mapped import'}).click();
  await page.getByRole('button',{name:'Situation',exact:true}).click();
  await expect(page.getByRole('img',{name:'SDB completed trend for Country A'})).toBeVisible();
  await expect(page.getByText(/Upload administrative polygons in the main app/)).toBeVisible();
  expect(await page.locator('dialog').evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);
  await page.screenshot({path:testInfo.outputPath('outbreak-mobile.png'),fullPage:true});
  page.once('dialog',d=>d.dismiss());
  await page.getByRole('button',{name:'Close apps',exact:true}).click();
  await expect(page.getByRole('region',{name:'Outbreak response'})).toBeVisible();
});

test('district selection shows directional arcs and missing routes stay missing',async({page},testInfo)=>{
  const second={id:'B',name:'B',properties:{nom:'B'},geometry:{type:'Polygon',coordinates:[[[30,1],[31,1],[31,2],[30,2],[30,1]]]}};
  await openOutbreak(page,[...areas,second]);
  await page.getByLabel('Reporting cut-off').fill('2026-09-02');
  await page.getByRole('button',{name:'Data & uploads',exact:true}).click();
  await dataTask(page,'Maps & context');
  await page.getByLabel('Mobility CSV',{exact:true}).setInputFiles({name:'routes.csv',mimeType:'text/csv',buffer:Buffer.from('origin,destination,value\nA,B,25\nB,A,12\n')});
  await page.getByLabel('Mobility period start').fill('2026-04-01');
  await page.getByLabel('Mobility period end').fill('2026-04-30');
  await page.getByLabel('Mobility units').fill('estimated relocations');
  await page.getByRole('button',{name:'Import mobility routes',exact:true}).click();
  await page.getByRole('button',{name:'Situation',exact:true}).click();
  await page.getByRole('combobox',{name:'District connections',exact:true}).selectOption('A');
  await expect(page.locator('[data-mobility-route="A → B"]')).toHaveCount(1);
  // Inflow is a first-class view: switching direction re-orients the arc and recolours it.
  const outflowStroke=await page.locator('[data-mobility-route="A → B"]').getAttribute('stroke');
  await page.getByRole('combobox',{name:'Route direction',exact:true}).selectOption('inflow');
  await expect(page.getByRole('img',{name:'Inflow to A map'})).toBeVisible();
  await expect(page.locator('[data-mobility-route="B → A"]')).toHaveCount(1);
  const inflowStroke=await page.locator('[data-mobility-route="B → A"]').getAttribute('stroke');
  expect(inflowStroke).not.toBe(outflowStroke);
  await page.getByRole('combobox',{name:'Route direction',exact:true}).selectOption('outflow');
  const view=page.getByRole('img',{name:'Outflow from A map'}).locator('[data-map-viewport]');
  const before=await view.getAttribute('viewBox');
  await page.getByRole('img',{name:'Outflow from A map'}).scrollIntoViewIfNeeded();
  const box=await page.getByRole('img',{name:'Outflow from A map'}).boundingBox();
  const x=box.x+box.width*.5,y=box.y+box.height*.45;
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+70,y+20,{steps:5});await page.mouse.up();
  const dragged=(await view.getAttribute('viewBox')).split(' ').map(Number);
  const original=before.split(' ').map(Number);
  expect(Math.abs(dragged[0]-original[0])).toBeGreaterThan(original[2]*.025);
  await page.mouse.wheel(0,-150);
  await expect.poll(async()=>Number((await view.getAttribute('viewBox')).split(' ')[2])).toBeLessThan(dragged[2]);
  const beforePinch=Number((await view.getAttribute('viewBox')).split(' ')[2]);
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:2});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x-30,y},{x:x+30,y}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-60,y},{x:x+60,y}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await expect.poll(async()=>Number((await view.getAttribute('viewBox')).split(' ')[2])).toBeLessThan(beforePinch*.8);
  await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:false});
  await cdp.detach();


  await page.getByRole('button',{name:'Zoom in Outflow from A map',exact:true}).click();
  expect(await view.getAttribute('viewBox')).not.toBe(before);
  await page.getByRole('combobox',{name:'Route direction',exact:true}).selectOption('inflow');
  await expect(page.locator('[data-mobility-route="B → A"]')).toHaveCount(1);
  await expect(page.locator('[data-mobility-route="A → B"]')).toHaveCount(0);
  await page.getByLabel('Admin labels for Inflow to A',{exact:true}).selectOption('all');
  await expect(page.getByRole('img',{name:'Inflow to A map'}).locator('text[data-admin]')).toHaveCount(2);
  await page.setViewportSize({width:1440,height:1400});
  await page.getByRole('img',{name:'Inflow to A map'}).screenshot({path:testInfo.outputPath('district-mobility.png')});
  await page.getByRole('button',{name:'Save snapshot *',exact:true}).click();
  await page.getByRole('button',{name:'Briefing',exact:true}).click();
  await expect(page.getByRole('img',{name:'Inflow to A map'})).toBeVisible();

});


test('connected source refreshes on opening, summary precedes detail, failed refresh retains dated evidence',async({page},testInfo)=>{
  let calls=0,fail=false;
  const seed=[{...areas[0],properties:{nom:'A',insp_sitrep:{cumulative_confirmed_cases:{_date:'2026-09-01',cumulative_confirmed_cases:3}}}}];
  const datasets=[{id:'insp:cumulative_confirmed_cases',metricId:'cumulative_confirmed_cases',purpose:'cases',status:'ready',origin:'public',kind:'cumulative',unit:'people',level:'health_zone',label:'Confirmed cases (cumulative)',source:'Fixture source',records:[{location:'A',date:'2026-09-03',value:10},{location:'A',date:'2026-09-10',value:20}]}];
  await openOutbreak(page,seed,route=>{
    if(route.request().url().includes('kind=indicators')){calls++;return fail?route.fulfill({status:502,json:{error:'Source unavailable'}}):route.fulfill({json:{datasets}});}
    if(route.request().url().includes('kind=relocations'))return route.fulfill({json:{routes:[],start:'2026-03-01',end:'2026-04-30',unit:'estimated relocations',source:'Fixture mobility'}});
    if(route.request().url().includes('kind=mines'))return route.fulfill({json:{data:[],url:'https://example.test/mines'}});
    return route.fulfill({json:{products:[]}});
  });
  await expect(page.getByRole('region',{name:'Overall snapshot'})).toContainText('20');
  await expect(page.getByRole('region',{name:'Overall snapshot'})).toContainText('2026-09-10');
  expect(calls).toBe(1);
  await page.setViewportSize({width:1440,height:1200});
  await page.getByRole('region',{name:'Overall snapshot'}).screenshot({path:testInfo.outputPath('overall-snapshot.png')});
  const headings=await page.getByRole('region',{name:'Outbreak response'}).locator('h3:visible').allTextContents();
  expect(headings.slice(0,7)).toEqual(['Key message','Prepare daily response brief','Since last brief','Overall snapshot','Trends','Areas to review','Suggested actions']);
  const message=page.getByRole('region',{name:'Key message',exact:true});
  await expect(message).toContainText('A (+10)');
  const messageBox=await message.boundingBox();
  const cutoffBox=await page.getByLabel('Reporting cut-off',{exact:true}).boundingBox();
  expect(messageBox.y).toBeLessThan(cutoffBox.y);
  await message.screenshot({path:testInfo.outputPath('opening-key-message.png')});
  await page.setViewportSize({width:390,height:844});
  await expect(message).toBeVisible();
  expect(await message.evaluate(node=>node.scrollWidth<=node.clientWidth+1)).toBe(true);
  await message.screenshot({path:testInfo.outputPath('opening-key-message-mobile.png')});
  await page.setViewportSize({width:1440,height:1200});
  await message.getByText('Edit key message',{exact:true}).click();
  await page.getByLabel('Coordinator key message',{exact:true}).fill('Confirm receiving-area readiness with the field team.');
  await message.getByRole('button',{name:'Open briefing',exact:true}).click();
  await expect(page.getByRole('region',{name:'Key message',exact:true})).toContainText('Confirm receiving-area readiness with the field team.');
  const keyMessageDownload=page.waitForEvent('download');
  await page.getByRole('button',{name:'Export briefing Markdown',exact:true}).click();
  expect(readFileSync(await (await keyMessageDownload).path(),'utf8')).toContain('Confirm receiving-area readiness with the field team.');
  await page.getByRole('button',{name:'Situation',exact:true}).click();
  await expect(page.getByRole('region',{name:'Suggested actions'})).toContainText('+10');
  await page.getByRole('region',{name:'Suggested actions'}).getByRole('button',{name:'Add to response plan'}).first().click();
  await expect(page.getByRole('button',{name:'Situation',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(page.getByRole('button',{name:'✓ Selected for response plan',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Response & decisions',exact:true}).click();
  await expect(page.getByLabel('Action, rationale and decision requested')).toHaveValue(/A: \+10/);
  await page.getByLabel('Action, rationale and decision requested').fill('Discuss staffing with the district team.');
  await page.getByRole('button',{name:'Situation',exact:true}).click();
  await expect(page.getByRole('button',{name:'✓ Selected for response plan',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Response & decisions',exact:true}).click();
  await expect(page.getByLabel('Action, rationale and decision requested')).toHaveCount(1);
  await page.getByRole('button',{name:'Remove action',exact:true}).click();
  await page.getByRole('button',{name:'Situation',exact:true}).click();
  await expect(page.getByRole('region',{name:'Suggested actions'}).getByRole('button',{name:'Add to response plan'}).first()).toBeEnabled();
  fail=true;
  await page.getByRole('button',{name:'Refresh data',exact:true}).click();
  await page.locator('summary').filter({hasText:/Sources checked|Source refresh details|Source refresh needs attention/}).click();
  await expect(page.getByText(/Some sources could not refresh/)).toBeVisible();
  await expect(page.getByRole('region',{name:'Overall snapshot'})).toContainText('20');
  await expect(page.getByRole('region',{name:'Overall snapshot'})).toContainText('2026-09-10');
});


test('data coverage points to missing sources without claiming they were analysed',async({page})=>{
  await openOutbreak(page,areas);
  await page.getByRole('button',{name:'Data & uploads',exact:true}).click();
  await dataTask(page,'Connected sources');
  const coverage=page.getByRole('region',{name:'Data coverage'});
  for(const title of ['ACLED / security','GDACS disaster alerts','Mining sites','Safe and dignified burial','Community engagement / RCCE','Logistics and supplies'])await expect(coverage.getByText(title,{exact:true})).toBeVisible();
  await expect(coverage.getByRole('button',{name:'Open main app'}).first()).toBeVisible();
  await coverage.getByRole('button',{name:'Add data'}).last().click();
  await expect(page.getByRole('heading',{name:'Upload operational data'})).toBeVisible();
});

test('national multi-series chart shows an in-chart legend, connects weekly points and switches to epi weeks',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  // Weekly (7-day) national series with one missing value in recoveries, to prove the line
  // connects across the weekly cadence and breaks only on the null.
  const weekly=(id,label,base,step,gap)=>{const records=[];let v=base;for(let i=0;i<12;i++){const d=new Date(Date.parse('2026-04-20')+i*7*86400000).toISOString().slice(0,10);v+=step*7;records.push({location:'DRC',date:d,value:gap&&i===6?null:v});}return {id,metricId:id,purpose:id.includes('confirmed_cases')?'cases':'other',status:'ready',origin:'public',kind:'cumulative',unit:'people',level:'national',label,source:'Fixture national series',records};};
  const datasets=[
    weekly('national_cumulative_confirmed_cases','National cumulative confirmed cases',120,26,false),
    weekly('national_cumulative_confirmed_deaths','National cumulative confirmed deaths',48,10,false),
    weekly('national_cumulative_recovered_cases','National cumulative recoveries',20,12,true)
  ];
  await openOutbreak(page,areas,route=>{
    const url=route.request().url();
    if(url.includes('kind=indicators'))return route.fulfill({json:{datasets}});
    if(url.includes('kind=relocations'))return route.fulfill({json:{routes:[],start:'2026-03-01',end:'2026-04-30',unit:'x',source:'f'}});
    if(url.includes('kind=mines'))return route.fulfill({json:{data:[],url:'https://example.test/mines'}});
    return route.fulfill({json:{products:[]}});
  });
  await page.getByRole('button',{name:'Data & uploads',exact:true}).click();
  await dataTask(page,'Connected sources');
  await page.getByLabel('Optional public source preset').selectOption('drc');
  await expect(page.getByRole('region',{name:'Outbreak response'})).toContainText('National cumulative confirmed cases');
  await page.getByRole('button',{name:'Situation',exact:true}).click();
  const chart=page.getByRole('img',{name:'National cumulative indicators trend'});
  await expect(chart).toBeVisible();
  // In-chart legend names each series inside the SVG (survives export).
  await expect(chart.getByText('Confirmed cases')).toBeVisible();
  await expect(chart.getByText('Recoveries')).toBeVisible();
  // Weekly points connect: each series is drawn as few polylines, not one per gap.
  const cases=await chart.locator('polyline').count();
  expect(cases).toBeLessThan(6);
  // Epi-week axis relabels ticks as Wnn.
  await page.getByRole('combobox',{name:'National trend x-axis'}).selectOption('epiweek');
  await expect(chart.getByText(/^W\d{2}$/).first()).toBeVisible();
  await expect(chart.getByText(/epi weeks/)).toBeVisible();
  expect(errors).toEqual([]);
});

test('RCCE Office text is reviewed, saved and exported with reporting cut-off',async({page},testInfo)=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const JSZip=require('jszip');
  const doc=new JSZip();
  doc.file('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Community &amp; feedback</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Need translated materials</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>');
  const ppt=new JSZip();
  ppt.file('ppt/presentation.xml','<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId2"/><p:sldId id="257" r:id="rId1"/></p:sldIdLst><p:extLst><p:ext><p14:sectionLst xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main"><p14:section><p14:sldIdLst><p14:sldId id="256"/></p14:sldIdLst></p14:section></p14:sectionLst></p:ext></p:extLst></p:presentation>');
  ppt.file('ppt/_rels/presentation.xml.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="slides/slide1.xml"/><Relationship Id="rId2" Target="slides/slide2.xml"/></Relationships>');
  for(const [i,text] of [[1,'Second slide'],[2,'First slide']])ppt.file(`ppt/slides/slide${i}.xml`,`<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:p><a:r><a:t>${text}</a:t></a:r></a:p></p:sld>`);
  await openOutbreak(page,areas);
  await page.getByLabel('Reporting cut-off',{exact:true}).fill('2026-09-16');
  await page.getByRole('button',{name:'Data & uploads',exact:true}).click();
  const input=page.getByLabel('RCCE document file');
  // A small real PDF checks the browser worker, text extraction and page labels.
  const stream='BT /F1 12 Tf 40 200 Td (Community feedback needs follow-up.) Tj ET';
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
  let pdf='%PDF-1.4\n';const offsets=[0];
  objects.forEach((object,i)=>{offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${object}\nendobj\n`;});
  const xref=Buffer.byteLength(pdf);
  pdf+=`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset=>`${String(offset).padStart(10,'0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  await input.setInputFiles({name:'report.pdf',mimeType:'application/pdf',buffer:Buffer.from(pdf)});
  await expect(page.getByLabel('Extracted RCCE text')).toHaveValue('Page 1\nCommunity feedback needs follow-up.');
  await page.getByRole('button',{name:'Cancel RCCE import',exact:true}).click();
  await input.setInputFiles({name:'slides.pptx',mimeType:'application/octet-stream',buffer:await ppt.generateAsync({type:'nodebuffer'})});
  await expect(page.getByLabel('Extracted RCCE text')).toHaveValue('Slide 1\nFirst slide\n\nSlide 2\nSecond slide');
  await page.getByRole('button',{name:'Cancel RCCE import',exact:true}).click();
  await input.setInputFiles({name:'broken.docx',mimeType:'application/octet-stream',buffer:Buffer.from('invalid')});
  await expect(page.getByLabel('Extracted RCCE text')).toHaveCount(0);
  await expect(page.getByRole('region',{name:'RCCE document upload'}).getByRole('alert')).toBeVisible();
  await input.setInputFiles({name:'feedback.docx',mimeType:'application/octet-stream',buffer:await doc.generateAsync({type:'nodebuffer'})});
  await expect(page.getByLabel('Extracted RCCE text')).toHaveValue('Community & feedback\nNeed translated materials');
  await page.getByRole('button',{name:'Confirm RCCE report',exact:true}).click();
  await expect(page.getByRole('region',{name:'RCCE document upload'}).getByRole('alert')).toContainText('reporting date');
  await page.getByLabel('RCCE report title').fill('Listening session');
  await page.getByLabel('RCCE source / reporting organization').fill('Engagement team');
  await page.getByLabel('RCCE location / scope').fill('Area A');
  await page.getByLabel('RCCE reporting date').fill('2026-09-15');
  await page.getByLabel('RCCE summary for briefing').fill('Community requests translated materials.');
  await page.getByRole('button',{name:'Confirm RCCE report',exact:true}).click();
  await dataTask(page,'Connected sources');
  await expect(page.getByRole('region',{name:'Data coverage'})).toContainText('1 qualitative reports within cut-off; 0 numeric indicators');
  await dataTask(page,'Reports');
  await page.getByRole('button',{name:'Briefing',exact:true}).click();
  await expect(page.getByRole('region',{name:'RCCE qualitative reports'})).toContainText('Community requests translated materials.');
  await page.getByRole('button',{name:/Save snapshot/}).click();
  await expect(page.getByLabel('Saved snapshots').locator('option')).toHaveCount(2);
  for(const [button,extension] of [['Export briefing Markdown','md'],['Export briefing HTML with visuals','html'],['Export evidence JSON','json']]){
    const pending=page.waitForEvent('download');await page.getByRole('button',{name:button,exact:true}).click();
    const file=testInfo.outputPath(`rcce.${extension}`);await (await pending).saveAs(file);
    const contents=readFileSync(file,'utf8');expect(contents).toContain('Community requests translated materials.');expect(contents).toContain('Engagement team');
    if(extension==='json'){const saved=JSON.parse(contents);expect(saved.rcceDocuments[0].text).toContain('Need translated materials');expect(saved.datasets).toHaveLength(0);}
  }
  await page.getByLabel('Reporting cut-off',{exact:true}).fill('2026-09-14');
  await expect(page.getByRole('region',{name:'RCCE qualitative reports'})).toHaveCount(0);
  page.on('dialog',dialog=>dialog.accept());
  await page.getByRole('button',{name:'New outbreak',exact:true}).click();
  await page.getByLabel('Saved snapshots').selectOption({index:1});
  await expect(page.getByRole('region',{name:'RCCE qualitative reports'})).toContainText('Listening session');
  await page.getByRole('button',{name:'Data & uploads',exact:true}).click();
  await page.locator('summary').filter({hasText:'Listening session'}).click();
  await page.getByRole('button',{name:'Remove RCCE report: Listening session',exact:true}).click();
  await dataTask(page,'Connected sources');
  await expect(page.getByRole('region',{name:'Data coverage'})).toContainText('Upload an RCCE document');
  await dataTask(page,'Reports');
  expect(errors).toEqual([]);
});

test('report workspace keeps long AI reviews manageable and preserves drafts across views',async({page},testInfo)=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await openOutbreak(page,areas);
  await page.getByRole('button',{name:'Data & uploads',exact:true}).click();
  const upload=page.getByRole('region',{name:'RCCE document upload'});
  await expect(upload.getByRole('heading',{name:'Upload RCCE feedback and reports'})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Sources and freshness'})).not.toBeVisible();
  await page.getByRole('heading',{name:'What would you like to add?'}).evaluate(el=>el.scrollIntoView({block:'start'}));
  await page.screenshot({path:testInfo.outputPath('data-workspace-desktop.png'),fullPage:true});
  const passages=Array.from({length:12},(_,i)=>`Area A feedback ${i+1}: community members request translated guidance and a follow-up meeting.`);
  await page.route('**/api/outbreak-document-insights',route=>route.fulfill({json:{title:'Weekly community listening report',source:'Community engagement team',reportDate:'',summary:'Community members requested translated guidance and follow-up meetings.',hasMore:false,findings:passages.map((quote,i)=>({kind:'request',themes:[i%2?'Follow-up':'Translation'],summary:`Community feedback ${i+1} asks for translated guidance and follow-up.`,quote,location:'Area A',country:'',province:'',geographicLevel:'health_zone',startDate:'',endDate:'',metricLabel:'',value:null,unit:'',population:'',purpose:'',limitations:''}))}}));
  await upload.getByLabel('RCCE document file').setInputFiles({name:'community-feedback.txt',mimeType:'text/plain',buffer:Buffer.from(passages.join('\n'))});
  await upload.getByRole('button',{name:'Analyze report with AI',exact:true}).click();
  await expect(upload.getByText('12 findings extracted',{exact:false})).toBeVisible();
  await expect(upload.getByLabel('Map location for finding 1',{exact:true})).not.toBeVisible();
  await expect(upload.getByLabel('Extracted RCCE text')).not.toBeVisible();
  await expect(upload.getByLabel('RCCE report title')).toHaveValue('Weekly community listening report');
  await upload.getByLabel('RCCE summary for briefing').fill('Reviewed summary preserved while navigating.');
  await dataTask(page,'Connected sources');
  await expect(page.getByRole('region',{name:'Data coverage'})).toBeVisible();
  await dataTask(page,'Reports');
  await page.getByRole('button',{name:'Situation',exact:true}).click();
  await page.getByRole('button',{name:'Data & uploads',exact:true}).click();
  await expect(upload.getByLabel('RCCE summary for briefing')).toHaveValue('Reviewed summary preserved while navigating.');
  await upload.getByLabel('RCCE report title').evaluate(el=>el.scrollIntoView({block:'center'}));
  await page.screenshot({path:testInfo.outputPath('report-review-desktop.png'),fullPage:true});
  await upload.locator('summary').filter({hasText:'Review extracted findings'}).click();
  await expect(upload.getByText('1–5 of 12',{exact:true})).toBeVisible();
  await upload.getByRole('button',{name:'Next findings',exact:true}).click();
  await expect(upload.getByText('6–10 of 12',{exact:true})).toBeVisible();
  await upload.getByLabel('Search findings').fill('feedback 12 ');
  await expect(upload.locator('summary').getByText('Community feedback 12 asks for translated guidance and follow-up.',{exact:true})).toBeVisible();
  await expect(upload.getByRole('button',{name:'Next findings',exact:true})).toHaveCount(0);
  await upload.locator('summary').filter({hasText:'Review extracted findings'}).click();
  await page.setViewportSize({width:390,height:844});
  await upload.getByLabel('RCCE reporting date').scrollIntoViewIfNeeded();
  await expect(upload.getByLabel('RCCE reporting date')).not.toHaveAttribute('required','');
  await expect(upload.getByText('Date unknown? You can import this report', {exact:false})).toBeVisible();
  const dimensions=await page.getByRole('region',{name:'Outbreak response',exact:true}).evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth}));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width+1);
  await page.screenshot({path:testInfo.outputPath('report-review-mobile.png'),fullPage:true});
  await upload.getByRole('button',{name:'Confirm RCCE report',exact:true}).click();
  await expect(upload.getByRole('status')).toContainText('Add a report date to include its summary');
  await page.locator('summary').filter({hasText:'Weekly community listening report'}).click();
  await page.getByRole('button',{name:'Edit report details',exact:true}).click();
  const editor=page.getByRole('region',{name:'Edit details for community-feedback.txt'});
  await editor.getByLabel('Report date').fill('2026-09-15');
  await editor.getByRole('button',{name:'Save report details',exact:true}).click();
  await page.getByRole('button',{name:'Briefing',exact:true}).click();
  await expect(page.getByRole('region',{name:'RCCE qualitative reports'})).toContainText('Reviewed summary preserved while navigating.');
  expect(errors).toEqual([]);
});

test('RCCE confirmation marks missing fields and focuses the first field needing attention',async({page})=>{
  await openOutbreak(page);
  await page.getByLabel('Reporting cut-off',{exact:true}).fill('2026-09-16');
  await page.getByRole('button',{name:'Data & uploads',exact:true}).click();
  const section=page.getByRole('region',{name:'RCCE document upload'});
  await section.getByLabel('RCCE document file').setInputFiles({name:'feedback.txt',mimeType:'text/plain',buffer:Buffer.from('Community requests translated materials.')});
  const date=section.getByLabel('RCCE reporting date');
  const source=section.getByLabel('RCCE source / reporting organization');
  await expect(date).toHaveAttribute('required','');
  await expect(section.locator('label').filter({hasText:'RCCE reporting date'})).toContainText('(required)');
  await section.getByLabel('RCCE location / scope').fill('Area A');
  await section.getByLabel('RCCE summary for briefing').fill('Translation requested.');
  await section.getByRole('button',{name:'Confirm RCCE report',exact:true}).click();
  const error=section.getByRole('alert');
  await expect(error).toContainText('Enter the source / reporting organization');
  await expect(source).toHaveAttribute('aria-invalid','true');
  await expect(date).toHaveAttribute('aria-invalid','true');
  await expect(date).toHaveCSS('border-top-color','rgb(161, 38, 34)');
  await expect(source).toBeInViewport();
  await expect(source).toBeFocused();
  await expect(section.getByLabel('RCCE summary for briefing')).toHaveValue('Translation requested.');
  await source.fill('Engagement team');
  await expect(source).toHaveAttribute('aria-invalid','false');
  await section.getByRole('button',{name:'Confirm RCCE report',exact:true}).click();
  await expect(date).toBeFocused();
  await expect(date).toBeInViewport();
  await expect(date).toHaveAccessibleDescription('Enter a valid reporting date.');
  await date.fill('2026-09-15');
  await expect(date).toHaveAttribute('aria-invalid','false');
  await section.getByRole('button',{name:'Confirm RCCE report',exact:true}).click();
  await expect(section.getByRole('alert')).toHaveCount(0);
  await expect(section.getByRole('status')).toContainText('“feedback.txt” imported.');
  await expect(section.getByRole('status')).toBeInViewport();
  await expect(section.getByRole('status')).toBeFocused();
  await expect(section.getByRole('button',{name:'Confirm RCCE report',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Briefing',exact:true}).click();
  await expect(page.getByRole('region',{name:'RCCE qualitative reports'})).toContainText('Translation requested.');
});

test('RCCE weekly batches preserve review edits, isolate failures and retain separate dated reports',async({page},testInfo)=>{
  await openOutbreak(page);
  await page.getByLabel('Reporting cut-off',{exact:true}).fill('2026-09-06');
  await page.getByRole('button',{name:'Data & uploads',exact:true}).click();
  const section=page.getByRole('region',{name:'RCCE document upload'});
  const input=section.getByLabel('RCCE document file');
  const week17={name:'week17.txt',mimeType:'text/plain',buffer:Buffer.from('Week 17: Community requested translated materials.')};
  const week18={name:'week18.txt',mimeType:'text/plain',buffer:Buffer.from('Week 18: Translated materials distributed.')};
  await input.setInputFiles([week17,week18,{name:'broken.docx',mimeType:'application/octet-stream',buffer:Buffer.from('not a zip')},{...week17,name:'duplicate17.txt'}]);
  const selector=section.getByLabel('Report to review');
  await expect(selector.locator('option')).toHaveCount(2);
  await expect(section.getByRole('alert')).toContainText('broken.docx');
  await expect(section.getByRole('alert')).toContainText('duplicate17.txt: This file is already imported or waiting for review.');
  await section.getByLabel('RCCE summary for briefing').fill('Translation requested.');
  await selector.selectOption({label:'week18.txt'});
  await expect(section.getByLabel('RCCE summary for briefing')).toHaveValue('');
  await section.getByLabel('RCCE report title').fill('WHO week 18');
  await section.getByLabel('RCCE source / reporting organization').fill('WHO');
  await section.getByLabel('RCCE location / scope').fill('Affected provinces');
  await section.getByLabel('RCCE reporting date').fill('2026-09-13');
  await section.getByLabel('RCCE summary for briefing').fill('Translations distributed.');
  // Adding another batch preserves the active report and partially completed forms.
  await input.setInputFiles({name:'week19.txt',mimeType:'text/plain',buffer:Buffer.from('Week 19: Follow-up ongoing.')});
  await expect(selector.locator('option')).toHaveCount(3);
  await expect(section.getByLabel('RCCE summary for briefing')).toHaveValue('Translations distributed.');
  await selector.selectOption({label:'week19.txt'});
  await section.getByRole('button',{name:'Cancel RCCE import',exact:true}).click();
  await expect(selector.locator('option')).toHaveCount(2);
  await expect(section.getByLabel('RCCE summary for briefing')).toHaveValue('Translation requested.');
  await selector.selectOption({label:'week18.txt'});
  await section.getByRole('button',{name:'Confirm RCCE report',exact:true}).click();
  await expect(selector.locator('option')).toHaveCount(1);
  await expect(section.getByLabel('RCCE summary for briefing')).toHaveValue('Translation requested.');
  await section.getByLabel('RCCE report title').fill('WHO week 17');
  await section.getByLabel('RCCE source / reporting organization').fill('WHO');
  await section.getByLabel('RCCE location / scope').fill('Affected provinces');
  await section.getByLabel('RCCE reporting date').fill('2026-09-06');
  await section.getByRole('button',{name:'Confirm RCCE report',exact:true}).click();
  await expect(selector).toHaveCount(0);
  await input.setInputFiles(week17);
  await expect(section.getByRole('alert')).toContainText('already imported');
  await expect(selector).toHaveCount(0);
  await page.getByRole('button',{name:/Save snapshot/}).click();
  await expect(page.getByLabel('Saved snapshots').locator('option')).toHaveCount(2);
  await page.getByRole('button',{name:'Briefing',exact:true}).click();
  const reports=page.getByRole('region',{name:'RCCE qualitative reports'});
  await expect(reports).toContainText('WHO week 17');
  await expect(reports).not.toContainText('WHO week 18');
  const pending=page.waitForEvent('download');
  await page.getByRole('button',{name:'Export evidence JSON',exact:true}).click();
  const file=testInfo.outputPath('weekly-reports.json');await (await pending).saveAs(file);
  const saved=JSON.parse(readFileSync(file,'utf8'));
  expect(saved.rcceDocuments.map(d=>d.date).sort()).toEqual(['2026-09-06','2026-09-13']);
  expect(saved.rcceDocuments.map(d=>d.summary).sort()).toEqual(['Translation requested.','Translations distributed.']);
  expect(saved.datasets).toHaveLength(0);
  await page.getByLabel('Reporting cut-off',{exact:true}).fill('2026-09-13');
  await expect(reports).toContainText('WHO week 18');
  page.on('dialog',dialog=>dialog.accept());
  await page.getByLabel('Saved snapshots').selectOption({index:1});
  await expect(reports).not.toContainText('WHO week 18');
  await page.getByLabel('Reporting cut-off',{exact:true}).fill('2026-09-13');
  await expect(reports).toContainText('WHO week 18');
});

test('AI document findings use editable themes and source-linked maps with separate vaccination measures',async({page},testInfo)=>{
  const second={id:'B',name:'B',properties:{nom:'B'},geometry:{type:'Polygon',coordinates:[[[30,1],[31,1],[31,2],[30,2],[30,1]]]}};
  const cases={id:'cases',purpose:'cases',metricId:'cumulative_confirmed_cases',label:'Confirmed cases',kind:'cumulative',level:'health_zone',unit:'people',source:'Case reports',status:'ready',records:[{location:'A',date:'2026-09-07',value:10},{location:'B',date:'2026-09-07',value:2}]};
  await openOutbreak(page,[...areas,second],route=>{
    const kind=new URL(route.request().url()).searchParams.get('kind');
    return route.fulfill({json:kind==='indicators'?{datasets:[cases]}:kind==='mines'?{data:[{id:'mine',pcode:'mine',name:'Documented mine',latitude:1.5,longitude:29.5,date:'2026-08-01'}],source:'Mining survey'}:kind==='relocations'?{routes:[{origin:'A',destination:'B',value:25},{origin:'B',destination:'A',value:15}],start:'2026-08-01',end:'2026-08-31',unit:'relocations',source:'Movement survey'}:{products:[]}});
  });
  const text='Page 1\nReport dated 2026-09-08. Area A reported a rumor about clinic closures during 2026-09-01 to 2026-09-07. In Area A, 12 health workers received their first dose on 2026-09-07 for pre-deployment preparedness. Further feedback has no stated location or date.';
  const base={themes:[],country:'Example country',province:'',geographicLevel:'health_zone',startDate:'2026-09-01',endDate:'2026-09-07',location:'Area A',metricLabel:'',value:null,unit:'',population:'',purpose:'',limitations:''};
  let requests=0;
  await page.route('**/api/outbreak-document-insights',async route=>{
    requests++;expect(route.request().postDataJSON().text).toBe(text);
    await route.fulfill({json:{title:'Weekly community report',source:'Local reporting team',reportDate:'2026-09-08',summary:'A clinic-closure rumor and worker vaccination were reported.',hasMore:false,findings:[
      {...base,kind:'rumor',themes:['Clinic access'],summary:'A clinic-closure rumor was reported.',quote:'Area A reported a rumor about clinic closures during 2026-09-01 to 2026-09-07.'},
      {...base,kind:'vaccination',themes:['Worker preparedness'],summary:'Twelve health workers received a first dose for deployment preparedness.',quote:'In Area A, 12 health workers received their first dose on 2026-09-07 for pre-deployment preparedness.',startDate:'2026-09-07',metricLabel:'Workers receiving first dose',value:12,unit:'people',population:'Health workers',purpose:'Pre-deployment preparedness'},
      {...base,kind:'concern',themes:['Unspecified follow-up'],summary:'Further feedback was reported without location or date.',quote:'Further feedback has no stated location or date.',location:'',startDate:'',endDate:''}
    ]}});
  });
  await page.getByLabel('Reporting cut-off',{exact:true}).fill('2026-09-08');
  await page.getByRole('button',{name:'Data & uploads',exact:true}).click();
  await dataTask(page,'Connected sources');
  await page.getByLabel('Optional public source preset').selectOption('drc');
  await expect(page.getByRole('button',{name:'Refresh data',exact:true})).toBeEnabled();
  await dataTask(page,'Reports');
  await page.getByLabel('RCCE document file').setInputFiles({name:'changing-layout.txt',mimeType:'text/plain',buffer:Buffer.from(text)});
  const analysis=page.getByRole('region',{name:'AI findings for changing-layout.txt',exact:true});
  await analysis.getByRole('button',{name:'Analyze report with AI',exact:true}).click();
  await expect(analysis.getByText('3 findings extracted', {exact:false})).toBeVisible();
  await analysis.locator('summary').filter({hasText:'Review extracted findings'}).click();
  for(const summary of ['A clinic-closure rumor was reported.','Twelve health workers received a first dose for deployment preparedness.','Further feedback was reported without location or date.'])await analysis.locator('summary').filter({hasText:summary}).click();
  await expect(analysis.getByLabel('Map location for finding 3')).toBeVisible();
  expect(requests).toBe(1);
  await expect(analysis.getByLabel('Map location for finding 1')).toHaveValue('');
  await analysis.getByLabel('Map location for finding 1').selectOption('A');
  await analysis.getByLabel('Map location for finding 2').selectOption('A');
  await page.getByRole('button',{name:'Confirm RCCE report',exact:true}).click();
  await page.getByRole('button',{name:'Situation',exact:true}).click();
  const map=page.getByRole('region',{name:'Document findings map'});
  await expect(map).toContainText('AI-extracted findings may be incomplete or incorrect');
  await expect(map).toContainText('2 findings in the selected period and filters; 2 matched');
  await expect(map).toContainText('1 have unresolved observation dates');
  await expect(map.locator('[data-document-finding]')).toHaveCount(2);
  await expect(map.getByRole('region',{name:'Selected area findings'})).toContainText('Confirmed cases: 10');
  await expect(map.locator('[data-mobility-route]')).toHaveCount(1);
  await map.getByLabel('IPIS mining sites',{exact:true}).check();
  await expect(map.locator('[data-ipis-site]')).toHaveCount(1);
  await map.getByLabel('Evidence area').selectOption('B');
  await expect(map.locator('[data-mobility-route]')).toHaveAttribute('data-mobility-route','B → A');
  await map.getByLabel('Evidence area').selectOption('A');
  await map.getByLabel('Theme filter').selectOption('Clinic access');
  await expect(map.locator('[data-document-finding]')).toHaveCount(1);
  await map.getByLabel('Theme filter').selectOption('');
  await map.getByLabel('Evidence map measure').selectOption({index:1});
  await expect(map.getByRole('img',{name:/Workers receiving first dose/})).toBeVisible();
  await expect(map.getByRole('region',{name:'Selected area findings'})).toContainText('12 people');
  await expect(map.getByRole('region',{name:'Selected area findings'})).toContainText('Pre-deployment preparedness');
  await page.getByRole('button',{name:/Save snapshot/}).click();
  await expect(page.getByLabel('Saved snapshots').locator('option')).toHaveCount(2);
  await page.getByRole('button',{name:'Briefing',exact:true}).click();
  const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Export evidence JSON',exact:true}).click();
  const file=testInfo.outputPath('ai-document-findings.json');await (await pending).saveAs(file);
  const saved=JSON.parse(readFileSync(file,'utf8'));
  expect(saved.rcceDocuments[0].findings).toHaveLength(3);expect(saved.rcceDocuments[0].findings[1].value).toBe(12);expect(saved.rcceDocuments[0].findings[0].reference).toBe('Page 1');
  expect(saved.datasets).toHaveLength(1);expect(saved.datasets[0].records[0].value).toBe(10);
  await page.getByLabel('Saved snapshots').selectOption({index:1});
  await page.getByRole('button',{name:'Situation',exact:true}).click();
  await expect(map.locator('[data-document-finding]')).toHaveCount(2);
  await page.getByLabel('Reporting cut-off',{exact:true}).fill('2026-09-06');
  await expect(map.locator('[data-document-finding]')).toHaveCount(0);
});
