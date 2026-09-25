import config from './monitoringConfig.json' with {type:'json'};
import { validDate, zoneName, formatValue } from './data.js';
import { observationIndex } from './comparison.js';
import { districtRoutes } from './mobility.js';

export const MONITORING_CONFIG = config;
const day = 86400000;
const shift = (date,n) => new Date(Date.parse(date)+n*day).toISOString().slice(0,10);
const distance = (start,end) => Math.round((Date.parse(end)-Date.parse(start))/day);
export function monitoringSettings(value={}) {
  value=value&&typeof value==='object'?value:{};
  return {
    view:['overview','burden','reporting','trends'].includes(value.view)?value.view:'overview',
    historyWeeks:config.historyWeeks.includes(Number(value.historyWeeks))?Number(value.historyWeeks):config.defaultHistoryWeeks,
    horizonWeeks:config.horizonWeeks.includes(Number(value.horizonWeeks))?Number(value.horizonWeeks):26,
    threshold:Number.isFinite(Number(value.threshold)) && Number(value.threshold)>=1 && Number(value.threshold)<=100?Number(value.threshold):config.defaultThreshold,
    reportingMode:value.reportingMode==='quiet'?'quiet':'gaps',
    onlyFlagged:value.onlyFlagged===true,
    burdenMetric:value.burdenMetric==='recent'?'recent':'cumulative',
    topZones:[5,10,20].includes(Number(value.topZones))?Number(value.topZones):10
  };
}

// One common set of actual reporting intervals for all areas. Prefer exact weeks,
// then 6–8 day intervals. Compare accumulation per day when durations differ.
function reportingPeriods(dates,end) {
  const available=new Set(dates);
  function chain(date,remaining) {
    if(!remaining)return [date];
    for(const days of config.weeklyIntervalDays) {
      const previous=shift(date,-days);
      if(!available.has(previous))continue;
      const rest=chain(previous,remaining-1);
      if(rest)return [...rest,date];
    }
    return null;
  }
  const endpoints=chain(end,3);
  return endpoints?endpoints.slice(1).map((end,i)=>({start:endpoints[i],end,days:distance(endpoints[i],end)})):[];
}

function percent(before,after) {return Number.isFinite(before)&&Number.isFinite(after)&&before>0?(after-before)/before*100:null;}
function trendFor(history,periods,valueAt,location,stale,threshold) {
  const observations=periods.map(period=>{
    const start=valueAt(location,period.start),end=valueAt(location,period.end);
    // Intermediate revisions or explicit missing reports also invalidate a decline.
    const inside=history.filter(r=>r.date>=period.start&&r.date<=period.end);
    const revision=inside.some((r,i)=>i>0&&Number.isFinite(r.value)&&Number.isFinite(inside[i-1].value)&&r.value<inside[i-1].value);
    const missing=inside.some(r=>!Number.isFinite(r.value));
    const delta=start===null||end===null?null:end-start;
    return {...period,delta,rate:delta===null?null:delta/period.days,revision:revision||delta<0,missing};
  });
  const invalid=observations.length!==3||observations.some(r=>r.delta===null||r.missing);
  const changes=observations.length===3?[percent(observations[0].rate,observations[1].rate),percent(observations[1].rate,observations[2].rate)]:[null,null];
  let status='unknown';
  if(!history.some(r=>Number.isFinite(r.value)))status='unknown';
  else if(stale)status='stale';
  else if(observations.some(r=>r.revision))status='revision';
  else if(!invalid) {
    const rates=observations.map(r=>r.rate);
    if(changes.every(p=>p!==null&&p<=-threshold+1e-9))status='declining';
    else if(rates[2]>rates[1]+1e-9)status='rising';
    else if(rates[2]<rates[1]-1e-9)status='falling';
    else if(rates.every(r=>Math.abs(r-rates[0])<1e-9))status='unchanged';
    else status='mixed';
  }
  return {status,observations,changes};
}

export function areaMonitoring(epi,geometry,boundaryLevel,asOf,settings={}) {
  if(epi?.dataset?.kind!=='cumulative'||epi.dataset.level!==boundaryLevel||['national','site'].includes(boundaryLevel)||!validDate(asOf)||!validDate(epi.date))return null;
  const options=monitoringSettings(settings);
  const nonGeographic=new Set((epi.dataset.locationMatching?.locations||[]).filter(r=>r.status==='Non-geographic source total').map(r=>r.source));
  const records=epi.dataset.records.filter(r=>validDate(r.date)&&r.date<=asOf&&!nonGeographic.has(r.location));
  const valueAt=observationIndex(records),byLocation=new Map();
  for(const r of records) {
    const dates=byLocation.get(r.location)||new Set();dates.add(r.date);byLocation.set(r.location,dates);
  }
  const boundaries=new Map((geometry?.features||[]).map(f=>[zoneName(f),f.properties?.province||'']));
  const locations=[...new Set([...boundaries.keys(),...byLocation.keys()])];
  const periods=reportingPeriods([...new Set(records.map(r=>r.date))],epi.date);
  const windows=Array.from({length:options.historyWeeks},(_,i)=>{
    const end=shift(asOf,-7*(options.historyWeeks-i-1));return {start:shift(end,-6),end};
  });
  const rows=locations.map(location=>{
    const history=[...(byLocation.get(location)||[])].sort().map(date=>({date,value:valueAt(location,date)}));
    const latest=history.filter(r=>r.value!==null).at(-1);
    const age=latest?distance(latest.date,asOf):null;
    const stale=!latest||age>config.maximumReportGapDays||history.at(-1)?.value===null;
    let quietStart=latest?.date||null;
    if(!stale)for(let i=history.length-2;i>=0;i--) {
      if(history[i].value!==latest.value||distance(history[i].date,quietStart)>config.maximumReportGapDays)break;
      quietStart=history[i].date;
    }
    const quietDays=!stale?distance(quietStart,latest.date):null;
    const gapStatus=age===null?'unknown':age>=42?'gap6':age>=21?'gap3':'recent';
    const quietStatus=!latest?'unknown':stale?'stale':quietDays>=42?'quiet6':quietDays>=21?'quiet3':'recent';
    const timeline=windows.map(window=>{
      const entries=history.filter(r=>r.date>=window.start&&r.date<=window.end),valid=entries.filter(r=>r.value!==null);
      const prior=history.filter(r=>r.date<window.start).at(-1);
      let status='missing',delta=null;
      if(valid.length) {
        status='reported';
        const paired=prior&&prior.value!==null&&entries.every(r=>r.value!==null)&&distance(prior.date,entries[0].date)<=config.maximumReportGapDays;
        if(paired) {
          delta=valid.at(-1).value-prior.value;
          const values=[prior,...entries];
          status=values.some((r,i)=>i>0&&r.value<values[i-1].value)?'revision':delta>0?'increase':'quiet';
        }
      }
      return {...window,status,delta,date:valid.at(-1)?.date||null};
    });
    return {location,province:boundaries.get(location)||null,matched:boundaries.has(location),hasHistory:history.length>0,lastReport:latest?.date||null,value:latest?.value??null,age,quietStart,quietDays,gapStatus,quietStatus,timeline,...trendFor(history,periods,valueAt,location,stale,options.threshold)};
  });
  return {asOf,date:epi.date,periods,windows,rows,settings:options,unmapped:rows.filter(r=>r.hasHistory&&!r.matched).length};
}

export function highBurdenMovements(epi,data,asOf,settings={}) {
  const options=monitoringSettings(settings),key=options.burdenMetric==='recent'?'delta':'value';
  return (epi?.zones||[]).filter(z=>z[key]>0).sort((a,b)=>b[key]-a[key]||a.location.localeCompare(b.location)).slice(0,options.topZones).map(z=>({...z,
    outgoing:districtRoutes(data,z.location,'outflow',asOf).filter(r=>r.value>0).slice(0,3),
    incoming:districtRoutes(data,z.location,'inflow',asOf).filter(r=>r.value>0).slice(0,3)
  }));
}

export function monitoringHighlights(model) {
  if(!model)return [];
  const rows=model.rows.filter(r=>r.matched&&r.hasHistory),named=items=>items.slice(0,3).map(r=>r.location).join(', ');
  const down=rows.filter(r=>r.status==='declining'),up=rows.filter(r=>r.status==='rising');
  const gaps=rows.filter(r=>r.age>=21),longGaps=gaps.filter(r=>r.age>=42);
  const quiet=rows.filter(r=>r.quietDays>=21),longQuiet=quiet.filter(r=>r.quietDays>=42);
  const assessed=rows.filter(r=>['declining','falling','rising','mixed','unchanged'].includes(r.status));
  const period=model.periods.length?`${model.periods[0].start}–${model.periods.at(-1).end}`:'weekly comparison dates unavailable';
  return [
    {view:'trends',text:`Reported case trends (${period}): ${up.length} rising${up.length?` (${named(up)})`:''}; ${down.length} with a decline of at least ${model.settings.threshold}% in each of two successive weekly comparisons${down.length?` (${named(down)})`:''}. ${assessed.length}/${rows.length} mapped areas with history can be assessed.`},
    {view:'reporting',text:`Reporting review at ${model.asOf}: ${gaps.length} areas have no valid case report for at least 3 weeks, including ${longGaps.length} for at least 6 weeks. Separately, ${quiet.length} have continued reports with unchanged cumulative totals for at least 3 weeks, including ${longQuiet.length} for 6 weeks; this does not establish absence of transmission.`}
  ];
}

const rounded=value=>Number.isFinite(value)?formatValue(Math.round(value*100)/100):'Unknown';
// A zero starting rate has no percentage change; say what happened instead.
function rateChange(change,before,after) {
  if(change!==null)return `${change>0?'+':''}${rounded(change)}%`;
  if(before===0&&after===0)return 'No change';
  if(before===0&&after>0)return 'New increase from zero';
  return 'Not comparable';
}
export const rateChanges=row=>row.changes.map((c,i)=>rateChange(c,row.observations[i]?.rate??null,row.observations[i+1]?.rate??null));

// Plain-language reading of a zone's trend: each comparison with its rates, why the
// assessment was given, and a caveat when a rate rise comes only from a shorter period.
export function trendExplanation(row,threshold) {
  const obs=row.observations;
  const steps=row.changes.map((c,i)=>({label:`Week ${i+1} → ${i+2}`,change:rateChange(c,obs[i]?.rate??null,obs[i+1]?.rate??null),from:obs[i]?.rate??null,to:obs[i+1]?.rate??null}));
  const [,prev,last]=obs,rate=v=>`${rounded(v)}/day`;
  const reasons={
    rising:prev&&last?`Week 3 daily rate (${rate(last.rate)}) is higher than week 2 (${rate(prev.rate)}). Any increase counts as rising.`:'',
    declining:`Daily rate fell by at least ${threshold}% in both comparisons.`,
    falling:prev&&last?`Week 3 daily rate (${rate(last.rate)}) is lower than week 2 (${rate(prev.rate)}), but not by at least ${threshold}% in both comparisons.`:'',
    mixed:'Week 3 daily rate is the same as week 2, but earlier weeks differed.',
    unchanged:'Same daily rate in all three weeks.',
    revision:'A downward revision of the cumulative total means this trend cannot be assessed.',
    stale:'No recent valid report, so this trend cannot be assessed.',
    unknown:'Not enough reports to compare three weeks.'
  };
  const shorterOnly=row.status==='rising'&&prev&&last&&last.delta<=prev.delta&&last.days<prev.days;
  const caveat=shorterOnly?`Reported cases did not increase (${rounded(prev.delta)} then ${rounded(last.delta)}); the rate is higher only because week 3 is ${last.days} days instead of ${prev.days}.`:'';
  return {steps,reason:reasons[row.status]||'',caveat};
}

// Spreadsheet-safe cell: quotes delimiters and neutralises formula prefixes in text.
function csvCell(value) {
  if(value===null||value===undefined)return '';
  if(typeof value==='number')return Number.isFinite(value)?String(Math.round(value*10000)/10000):'';
  let text=String(value);
  if(/^[=+@\t\r]|^-(?![\d.])/.test(text))text=`'${text}`;
  return /[",\n\r]/.test(text)?`"${text.replace(/"/g,'""')}"`:text;
}

// Rows as shown in the comparisons table. Missing values stay blank, never zero.
export function trendComparisonCsv(rows,model,categories) {
  const periods=model.periods.map(p=>`${p.start}_to_${p.end}`);
  const header=['health_zone','province',...periods.flatMap(p=>[`reported_change_${p}`,`rate_per_day_${p}`]),'rate_change_1_pct','rate_change_2_pct','rate_change_summary','assessment','assessment_reason','caveat','last_valid_report','reporting_cutoff','decline_threshold_pct'];
  const lines=rows.map(r=>[r.location,r.province||(!r.matched?'Unmapped':''),...model.periods.flatMap((_,i)=>[r.observations[i]?.delta??null,r.observations[i]?.rate??null]),r.changes[0]??null,r.changes[1]??null,rateChanges(r).join(' → '),categories[r.status]?.label||r.status,...(({reason,caveat})=>[reason,caveat])(trendExplanation(r,model.settings.threshold)),r.lastReport,model.asOf,model.settings.threshold]);
  return [header,...lines].map(line=>line.map(csvCell).join(',')).join('\n')+'\n';
}
