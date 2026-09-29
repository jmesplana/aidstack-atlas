import { validDate, zoneName } from './data.js';
import { observationIndex } from './comparison.js';
import { areaActivity } from './areaHistory.js';
import { areaMonitoring, highBurdenMovements, MONITORING_CONFIG } from './monitoring.js';

const day=86400000;
const shift=(date,n)=>new Date(Date.parse(date)+n*day).toISOString().slice(0,10);
const days=(a,b)=>Math.round((Date.parse(b)-Date.parse(a))/day);
const weekStart=date=>shift(date,-((new Date(date).getUTCDay()+6)%7));
const byLocation=records=>{const groups=new Map();for(const r of records){if(!groups.has(r.location))groups.set(r.location,[]);groups.get(r.location).push(r);}return groups;};
const sum=values=>values.length?values.reduce((n,v)=>n+v,0):null;
export const DASHBOARD_BRIEFING_TITLES={overview:'Situation overview',burden:'Burden and movement',trends:'Case trend assessment'};

// Missing values, duplicates and intermediate revisions invalidate a comparison,
// even when both endpoint totals exist. Never bridge an arbitrary long gap.
export function sourceInterval(records,valueAt,location,start,end) {
  if(!validDate(start)||!validDate(end))return {delta:null,rate:null,reason:'No comparison dates'};
  const duration=days(start,end),before=valueAt(location,start),after=valueAt(location,end);
  const inside=records.filter(r=>r.location===location&&r.date>=start&&r.date<=end);
  const dates=[...new Set(inside.map(r=>r.date))].sort();
  const values=dates.map(date=>valueAt(location,date));
  const revision=values.some((v,i)=>i>0&&v!==null&&values[i-1]!==null&&v<values[i-1]);
  const invalid=before===null||after===null||values.some(v=>v===null||v<0);
  const comparable=[6,7,8].includes(duration);
  const delta=!invalid&&!revision&&comparable?after-before:null;
  return {start,end,days:duration,delta,rate:delta===null?null:delta/duration,revision,reason:revision?'Revision':invalid?'Missing or ambiguous observations':!comparable?'Not a 6–8 day interval':''};
}

export function dashboardSnapshot({epi,geometry,boundaryLevel,asOf,province='',location='',alertDays=7}) {
  if(!epi?.dataset||!validDate(epi.date)||epi.date>asOf)return null;
  const nonGeographic=new Set((epi.dataset.locationMatching?.locations||[]).filter(r=>r.status==='Non-geographic source total').map(r=>r.source));
  const records=epi.dataset.records.filter(r=>validDate(r.date)&&r.date<=asOf&&!nonGeographic.has(r.location));
  const assignments=new Map();
  for(const f of epi.dataset.level===boundaryLevel?geometry?.features||[]:[]){
    const name=zoneName(f);if(!name||nonGeographic.has(name))continue;
    const existing=assignments.get(name)||new Set();existing.add(f.properties?.province||'');assignments.set(name,existing);
  }
  const names=[...new Set([...assignments.keys(),...records.map(r=>r.location)])];
  const valueAt=observationIndex(records),histories=byLocation(records);
  const rows=names.map(name=>{
    const groups=assignments.get(name),areaProvince=groups?.size===1?[...groups][0]:'';
    const history=histories.get(name)||[];
    const value=valueAt(name,epi.date),interval=sourceInterval(history,valueAt,name,epi.baseline,epi.date);
    const availableDates=[...new Set(history.filter(r=>valueAt(name,r.date)!==null).map(r=>r.date))].sort();
    return {location:name,province:areaProvince,matched:assignments.has(name),value:value!==null&&value>=0?value:null,date:epi.date,baseline:epi.baseline,lastReport:availableDates.at(-1)||null,...interval};
  }).filter(r=>(!province||r.province===province)&&(!location||r.location===location));
  const included=new Set(rows.map(r=>r.location)),scopedRecords=records.filter(r=>included.has(r.location));
  const current=rows.filter(r=>r.value!==null),paired=rows.filter(r=>r.delta!==null);
  const alerts=areaActivity({kind:epi.dataset.kind,records:scopedRecords},epi.date,shift(epi.date,-alertDays)).firstReports;
  return {rows,records:scopedRecords,date:epi.date,baseline:epi.baseline,comparisonDays:days(epi.baseline,epi.date),total:sum(current.map(r=>r.value)),change:sum(paired.map(r=>r.delta)),available:current.length,paired:paired.length,positive:current.filter(r=>r.value>0).length,unavailable:rows.length-current.length,revisions:rows.filter(r=>r.revision).length,unmapped:rows.filter(r=>!r.matched).length,alerts,alertDays};
}

// Use the same locations across the entire displayed series. A changing reporting
// cohort must not masquerade as a changing outbreak. Empty cohorts stay unknown.
export function reportingCurve(snapshot,horizonWeeks=6) {
  const dates=[...new Set(snapshot.records.map(r=>r.date).filter(date=>date<=snapshot.date))].sort();
  if(!dates.length)return {points:[],cohort:[],total:snapshot.rows.length,max:1};
  const latest=weekStart(snapshot.date),first=weekStart(dates[0]);
  const count=Math.min([3,6,26].includes(horizonWeeks)?horizonWeeks:6,Math.max(0,days(first,latest)/7));
  const byWeek=new Map(),valueAt=observationIndex(snapshot.records),coverage=new Map();
  for(const date of dates){
    const week=weekStart(date),available=snapshot.rows.filter(r=>valueAt(r.location,date)!==null).length;
    if(!coverage.has(week)||available>=coverage.get(week)){byWeek.set(week,date);coverage.set(week,available);}
  }
  const intervals=Array.from({length:count},(_,i)=>{
    const endWeek=shift(latest,-7*(count-i-1));
    return {start:byWeek.get(shift(endWeek,-7))||null,end:byWeek.get(endWeek)||null,week:endWeek};
  });
  const histories=byLocation(snapshot.records);
  const observations=new Map(snapshot.rows.map(row=>[row.location,intervals.map(p=>sourceInterval(histories.get(row.location)||[],valueAt,row.location,p.start,p.end))]));
  const cohort=snapshot.rows.filter(r=>intervals.length&&observations.get(r.location).every(o=>o.delta!==null)).map(r=>r.location);
  const points=intervals.map((p,i)=>{
    const delta=sum(cohort.map(name=>observations.get(name)[i].delta));
    const duration=p.start&&p.end?days(p.start,p.end):null;
    return {...p,days:duration,delta,rate:delta!==null?delta/duration:null};
  });
  return {points,cohort,total:snapshot.rows.length,max:Math.max(1,...points.map(p=>p.rate??0))};
}
const partition=(rows,size)=>Array.from({length:Math.ceil(rows.length/size)},(_,i)=>rows.slice(i*size,i*size+size));
export function reportedCfr(input,snapshot=dashboardSnapshot(input)) {
  const base={percent:null,cases:null,deaths:null,paired:0,available:snapshot?.available||0,date:snapshot?.date||null,source:null};
  const metric=input.epi?.dataset?.metricId||(input.epi?.dataset?.id==='insp:cumulative_confirmed_cases'?'cumulative_confirmed_cases':null);
  if(!snapshot||metric!=='cumulative_confirmed_cases')return {...base,reason:'The selected case series must identify cumulative confirmed cases.'};
  const candidates=(input.datasets||[]).filter(d=>d.status==='ready'&&d.metricId==='cumulative_confirmed_deaths'&&d.kind==='cumulative'&&d.level===input.epi.dataset.level);
  if(candidates.length!==1)return {...base,reason:candidates.length?'Multiple confirmed-death sources need reconciliation.':'A matching cumulative confirmed-death series is not available.'};
  const dataset=candidates[0],valueAt=observationIndex(dataset.records),pairs=[];
  const source=dataset.url||dataset.source||dataset.label;
  for(const row of snapshot.rows){
    if(row.value===null)continue;
    const deaths=valueAt(row.location,snapshot.date);
    if(deaths===null)continue;
    if(!Number.isSafeInteger(deaths)||!Number.isSafeInteger(row.value)||deaths<0||deaths>row.value)return {...base,source,reason:'Case and death counts are inconsistent; reconcile them before calculating CFR.'};
    pairs.push({cases:row.value,deaths});
  }
  if(!pairs.length)return {...base,source,reason:'No case and death observations match on this source date.'};
  const cases=sum(pairs.map(p=>p.cases)),deaths=sum(pairs.map(p=>p.deaths));
  return {...base,cases,deaths,paired:pairs.length,source,percent:cases>0?100*deaths/cases:null,reason:cases>0?'':'CFR is undefined when the confirmed-case denominator is zero.'};
}
export function overviewSignals(input,snapshot=dashboardSnapshot(input)) {
  if(!snapshot)return {rows:[],windows:[],eligible:0,available:false};
  const model=areaMonitoring({...input.epi,dataset:{...input.epi.dataset,records:snapshot.records}},input.geometry,input.boundaryLevel,input.asOf,{historyWeeks:6});
  if(!model)return {rows:[],windows:[],eligible:0,available:false};
  const names=new Set(snapshot.rows.map(r=>r.location));
  const firsts=new Map(areaActivity({kind:'cumulative',records:snapshot.records},input.asOf,shift(input.asOf,-7)).firstReports.filter(r=>r.priorZero).map(r=>[r.location,r]));
  const candidates=model.rows.filter(r=>names.has(r.location)).flatMap(row=>{
    const first=firsts.get(row.location),latest=row.lastTrend?.observations.at(-1);
    const fresh=row.age!==null&&row.age<=MONITORING_CONFIG.maximumReportGapDays&&row.quietStatus!=='stale';
    let signal=null;
    // A single newly positive zone must not wait for three comparison intervals.
    if(first&&fresh&&row.value>0&&row.lastTrend?.status!=='revision')signal='new';
    else if(fresh&&row.lastTrend?.status==='rising')signal='rise';
    else if(row.visibilityLost&&row.lastReport>=model.windows[0].start)signal='gap';
    return signal?[{...row,signal,first,latest}]:[];
  });
  const order={new:0,rise:1,gap:2};
  candidates.sort((a,b)=>order[a.signal]-order[b.signal]||Number(b.sustainedIncrease)-Number(a.sustainedIncrease)||b.lastReport.localeCompare(a.lastReport)||(b.latest?.delta??0)-(a.latest?.delta??0)||a.location.localeCompare(b.location));
  // Preserve one representative of every signal type before filling the five
  // slots. This is a briefing selection, not a validated severity score.
  const selected=new Set(['new','rise','gap'].map(type=>candidates.find(r=>r.signal===type)).filter(Boolean));
  for(const row of candidates){if(selected.size===5)break;selected.add(row);}
  return {rows:candidates.filter(r=>selected.has(r)),windows:model.windows,eligible:candidates.length,available:true};
}
export function overviewSlideDeck(input) {
  const snapshot=dashboardSnapshot(input);if(!snapshot)return {pages:[{kind:'empty'}],snapshot:null};
  const curve=reportingCurve(snapshot,input.horizonWeeks),names=new Set(snapshot.rows.map(r=>r.location));
  const evidence=(input.model?.rows||[]).filter(r=>names.has(r.location));
  const signals=overviewSignals(input,snapshot);
  const pages=[{kind:'situation'}];
  for(const points of partition(curve.points,8))pages.push({kind:'curve',points});
  if(!curve.points.length)pages.push({kind:'curve',points:[]});
  pages.push({kind:'zone-signals'});
  for(const rows of partition(snapshot.alerts,6))pages.push({kind:'first-reports',rows});
  pages.push({kind:'verification',sustained:evidence.filter(r=>r.sustainedIncrease),lost:evidence.filter(r=>r.visibilityLost)});
  return {snapshot,curve,signals,cfr:reportedCfr(input,snapshot),pages,monitoringAvailable:!!input.model};
}
export function burdenSlideDeck(input) {
  const snapshot=dashboardSnapshot({...input,location:''});if(!snapshot)return {pages:[{kind:'empty'}],snapshot:null};
  const data=input.movement;
  const movementEligible=validDate(data?.start)&&validDate(data?.end)&&data.start<=data.end&&data.end<=input.asOf;
  const ranked=highBurdenMovements({zones:snapshot.rows},movementEligible?data:null,input.asOf,input.settings);
  const pages=partition(ranked,6).map((rows,i)=>({kind:'burden-rank',rows,start:i*6}));
  if(!pages.length)pages.push({kind:'burden-rank',rows:[],start:0});
  const focus=[...ranked].sort((a,b)=>(b.location===input.location)-(a.location===input.location));
  for(const row of focus)pages.push({kind:'movement',row,routes:(input.direction==='inflow'?row.incoming:row.outgoing).filter(r=>Number.isFinite(r.value)&&r.value>0)});
  return {snapshot,ranked,pages,movementEligible,metric:input.settings?.burdenMetric==='recent'?'delta':'value'};
}
export function caseTrendSlideDeck(rows,{grouped=true}={}) {
  const counts=Object.entries(MONITORING_CONFIG.trendCategories).map(([status,style])=>({status,...style,count:rows.filter(r=>r.status===status).length}));
  const pages=[{kind:'trend-summary',counts,total:rows.length}];
  const provinceOf=r=>r.province||(r.matched?'Province unavailable':'Unmapped source locations');
  const provinces=[...new Set(rows.map(provinceOf))].sort();
  for(const province of grouped?provinces:[''])for(const members of partition(rows.filter(r=>!grouped||provinceOf(r)===province),3))pages.push({kind:'trend-detail',rows:members,province});
  return {pages};
}
