import test from 'node:test';
import assert from 'node:assert/strict';
import {keyMessage} from '../lib/outbreak/keyMessage.js';
import {caseTrend} from '../lib/outbreak/caseTrend.js';

const asOf='2026-09-11';
test('irregular national reports explain the missing weekly endpoint while retaining the observed increase',()=>{
  const dataset={id:'national',purpose:'cases',status:'ready',kind:'cumulative',level:'national',records:[
    {location:'DRC',date:'2026-09-07',value:6757},
    {location:'DRC',date:'2026-09-19',value:7672},
    {location:'DRC',date:'2026-09-21',value:7773}
  ]};
  const text=caseTrend({datasets:[dataset],asOf:'2026-09-23'});
  assert.match(text,/increased by 101 since 2026-09-19/);
  assert.match(text,/Recent comparison unavailable.*six, seven or eight days/);
  assert.match(text,/does not establish whether weekly new cases are rising or falling/);
  const complete=caseTrend({datasets:[{...dataset,records:[...dataset.records,{location:'DRC',date:'2026-09-14',value:7300}]}],asOf:'2026-09-23'});
  assert.doesNotMatch(complete,/total is missing/);
  assert.match(complete,/backlogs and revisions/);
  for (const [date,value,days,delta] of [['2026-09-15',7404,6,369],['2026-09-13',7258,8,515]]) {
    const nearby=caseTrend({datasets:[{...dataset,records:[...dataset.records,{location:'DRC',date,value}]}],asOf:'2026-09-23'});
    assert.ok(nearby.includes(`Over ${days} days (${date}–2026-09-21)`));
    assert.ok(nearby.includes(`increased by ${delta}`));
    assert.match(nearby,/nearby report date/);
  }

});
const epi={date:'2026-09-08',baseline:'2026-09-01',growth:[{location:'Origin',delta:8}],burden:[{location:'Origin',value:20}],affected:[{location:'Origin'}]};
const mobility={start:'2026-04-01',end:'2026-04-30',unit:'estimated relocations',routes:[{origin:'Origin',destination:'Receiver',value:100}]};

test('opening summary leads with trend, then geography and up to two operational actions',()=>{
  const message=keyMessage({asOf,epi,mobility,mining:{byZone:new Map([['Origin',4]])},security:{byZone:new Map([['Origin',{events:2}]]),start:'2026-08-01',end:'2026-08-28'}});
  for(const part of ['Origin (+8)','2026-09-01–2026-09-08','Receiver','2026-04-01–2026-04-30','cumulative case reports','2026-08-01–2026-08-28']) assert.ok(message.text.includes(part),part);
  const paragraphs=message.text.split('\n\n');
  assert.match(paragraphs[0],/^Reported cumulative case totals increased/);
  assert.match(paragraphs[1],/Origin \(\+8\)/);
  assert.match(paragraphs[2],/^Assess surveillance readiness/);
  assert.ok(!message.text.includes('Verify active mines'));
  assert.equal(message.origin,'Summary from loaded data');
});
test('mining remains an action when security context is unavailable',()=>{
  assert.match(keyMessage({asOf,epi,mining:{byZone:new Map([['Origin',4]])}}).text,/Verify active mines.*historical observations/);
});

const daily=(current=2,previous=4,level='national',location='Country')=>({
  id:'daily',label:'Reported confirmed cases',metricId:'new_confirmed_cases',purpose:'cases',kind:'daily',level,status:'ready',unit:'cases',
  records:Array.from({length:14},(_,i)=>({location,date:new Date(Date.parse(asOf)-i*86400000).toISOString().slice(0,10),value:i<7?current:previous}))
});
test('complete weekly reports distinguish increases, decreases and unchanged totals, including zero',()=>{
  for(const [current,previous,word] of [[4,2,'increased'],[2,4,'decreased'],[2,2,'were unchanged'],[0,0,'were unchanged'],[1,0,'increased']]) {
    const trend=caseTrend({datasets:[daily(current,previous)],asOf});
    assert.ok(trend.includes(word),trend);
    assert.ok(trend.includes(`${current*7} versus ${previous*7} cases`),trend);
    assert.match(trend,/2026-09-05–2026-09-11 versus 2026-08-29–2026-09-04/);
  }
});
test('missing or null daily values prevent a weekly direction; future data cannot fill the gap',()=>{
  for(const records of [daily().records.slice(1),daily().records.map((r,i)=>i===0?{...r,value:null}:r)]) {
    const dataset={...daily(),records:[...records,{location:'Country',date:'2026-09-12',value:999}]};
    assert.match(caseTrend({datasets:[dataset],asOf}),/not enough case evidence/);
  }
});
test('daily area comparisons disclose incomplete coverage and never sum overlapping locations',()=>{
  const dataset=daily(2,4,'district','A');
  dataset.records.push(...daily(4,2,'district','B').records,...daily(2,2,'district','C').records.slice(1));
  const trend=caseTrend({datasets:[dataset],asOf});
  assert.match(trend,/increased in 1, decreased in 1 and were unchanged in 0 areas/);
  assert.match(trend,/2\/3 areas have all 14 daily observations/);
  assert.match(trend,/comparable areas only/);
});
test('ambiguous sources and non-case indicators cannot supply the opening weekly trend',()=>{
  for(const datasets of [[daily(),{...daily(),id:'another'}],[{...daily(),purpose:'deaths',metricId:'new_confirmed_deaths'}]]) {
    assert.match(caseTrend({datasets,asOf,epi}),/^Reported cumulative case totals/);
  }
});
test('overall weekly decline precedes local increases and verified province context',()=>{
  const message=keyMessage({asOf,datasets:[daily()],epi:{...epi,zones:[{location:'Origin',province:'Province B'}]}});
  const parts=message.text.split('\n\n');
  assert.match(parts[0],/decreased/);
  assert.match(parts[1],/Province B — Origin \(\+8\)/);
  assert.match(parts[1],/largest reported cumulative burden/);
  assert.match(parts[2],/review case investigations/);
  assert.ok(!keyMessage({asOf,epi}).text.includes('Province'));
});
test('cumulative revisions and incomplete area coverage do not become an improving outbreak trend',()=>{
  const local={...epi,growth:[{location:'Origin',delta:-2}],zones:[{location:'Origin'},{location:'Missing'}],absent:1};
  const text=caseTrend({epi:local,asOf});
  assert.match(text,/1 had downward revisions/);
  assert.match(text,/1\/2 areas have paired observations; 1 previously reporting areas are absent/);
  assert.match(text,/does not establish weekly case direction/);
  const dataset={...daily(),kind:'cumulative',records:[{location:'Country',date:'2026-09-01',value:30},{location:'Country',date:'2026-09-08',value:25}]};
  assert.match(caseTrend({datasets:[dataset],asOf}),/revised downward by 5.*does not establish a decline/);
});
test('future mobility and links from origins without case reports cannot become priorities',()=>{
  for(const data of [{...mobility,end:'2026-09-20'},{...mobility,routes:[{origin:'Unknown',destination:'Receiver',value:500}]}]) {
    assert.ok(!keyMessage({asOf,epi,mobility:data}).text.includes('Receiver'));
  }
});
test('missing comparisons and observed nonpositive changes have different wording',()=>{
  assert.match(keyMessage({asOf,epi:{...epi,growth:[]}}).text,/comparisons are unavailable/);
  assert.match(keyMessage({asOf,epi:{...epi,growth:[{location:'Origin',delta:0}]}}).text,/No positive seven-day changes.*paired observations/);
  assert.match(keyMessage({asOf}).text,/not enough case evidence/);
});
test('coordinator message takes precedence without automatic additions; blank restores data summary',()=>{
  assert.deepEqual(keyMessage({asOf,epi,override:'  Confirm staffing before deployment.  '}),{text:'Confirm staffing before deployment.',origin:'Coordinator message'});
  assert.equal(keyMessage({asOf,epi,override:' '}).origin,'Summary from loaded data');
});
test('reported zero is distinct from missing evidence, including national-only data',()=>{
  assert.match(keyMessage({asOf,epi:{...epi,growth:[],burden:[],affected:[],zones:[{location:'Origin',value:0}]}}).text,/No positive cumulative case counts/);
  const dataset={id:'cases',metricId:'national_cumulative_confirmed_cases',status:'ready',level:'national',kind:'cumulative',records:[{location:'DRC',date:'2026-09-08',value:0},{location:'DRC',date:'2026-09-20',value:90}]};
  assert.match(keyMessage({asOf,datasets:[dataset]}).text,/0 cumulative confirmed cases.*2026-09-08/);
});
