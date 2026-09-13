import { dailyComparison, nationalEvidence, formatValue } from './data.js';

const shift=(date,days)=>new Date(Date.parse(date)+days*86400000).toISOString().slice(0,10);
const isCases=d=>d.purpose==='cases'||/^(national_)?(new|cumulative)_confirmed_cases$/.test(d.metricId||'');
const basis=(dataset,period,coverage)=>dataset?{sourceId:dataset.id,label:dataset.label||'Case data',source:dataset.source||dataset.url||dataset.file||'Source not supplied',url:/^https?:\/\//.test(dataset.url||dataset.source||'')?(dataset.url||dataset.source):null,period,coverage}:null;
export function areaCaseBasis(epi) {
  return epi?.dataset?basis(epi.dataset,`${epi.baseline}–${epi.date}`,`${epi.growth.length}/${epi.zones.length} areas have paired observations${epi.absent?`; ${epi.absent} previously reporting areas absent`:''}`):null;
}
const result=(text,evidence)=>({text,basis:evidence?[evidence]:[]});

// Use one source at a time; counts of comparable areas are not national totals.
export function caseTrendDetails({datasets=[],epi,asOf}) {
  const daily=datasets.filter(d=>d.status==='ready'&&d.kind==='daily'&&isCases(d)&&d.level!=='site');
  const national=daily.filter(d=>d.level==='national');
  const candidates=national.length?national:daily.filter(d=>!epi?.dataset||d.level===epi.dataset.level);
  let incompleteBasis=null;
  if(candidates.length===1) {
    const dataset=candidates[0],rows=dailyComparison(dataset.records,asOf);
    const paired=rows.filter(r=>r.reported===14);
    const dates=`${shift(asOf,-6)}–${asOf} versus ${shift(asOf,-13)}–${shift(asOf,-7)}`;
    const evidence=basis(dataset,dates,`${paired.length}/${rows.length} ${dataset.level==='national'?'national series':'areas'} have all 14 daily observations`);
    incompleteBasis=evidence;
    if(paired.length&&dataset.level==='national'&&rows.length===1) {
      const row=paired[0],direction=row.current>row.previous?'increased':row.current<row.previous?'decreased':'were unchanged';
      return result(`${dataset.label||'Reported cases'} for ${row.location} ${direction}: ${formatValue(row.current)} versus ${formatValue(row.previous)} ${dataset.unit||'cases'} over comparable seven-day periods (${dates}).`,evidence);
    }
    if(paired.length&&dataset.level!=='national') {
      const up=paired.filter(r=>r.current>r.previous).length,down=paired.filter(r=>r.current<r.previous).length;
      return result(`${dataset.label||'Reported daily cases'}: seven-day totals increased in ${up}, decreased in ${down} and were unchanged in ${paired.length-up-down} areas (${dates}); ${paired.length}/${rows.length} areas have all 14 daily observations. This describes comparable areas only.`,evidence);
    }
  }
  const nationalCases=datasets.filter(d=>d.status==='ready'&&d.level==='national'&&d.kind==='cumulative'&&isCases(d));
  const facts=nationalEvidence(nationalCases,asOf);
  if(nationalCases.length===1&&facts.length===1) {
    const fact=facts[0];
    const change=fact.delta===null?'A previous comparable total is unavailable.':fact.delta<0?`The total was revised downward by ${formatValue(-fact.delta)} since ${fact.since}; this does not establish a decline in new cases.`:`The reported cumulative total ${fact.delta===0?'was unchanged':`increased by ${formatValue(fact.delta)}`} since ${fact.since}; weekly case direction is not established.`;
    return result(`${formatValue(fact.value)} ${nationalCases[0].label||'cumulative confirmed cases'} reported nationally on ${fact.date}. ${change}`,basis(nationalCases[0],fact.since?`${fact.since}–${fact.date}`:fact.date,`${fact.location}: ${fact.since?'2 comparable observations':'no previous comparable observation'}`));
  }
  const paired=epi?.growth.filter(z=>Number.isFinite(z.delta))||[];
  if(paired.length) {
    const up=paired.filter(z=>z.delta>0).length,down=paired.filter(z=>z.delta<0).length;
    const coverage=`${paired.length}/${epi.zones?.length||paired.length} areas have paired observations`;
    const direction=up?`Reported cumulative case totals increased in ${up} areas`:'No positive seven-day changes in reported cumulative totals were observed';
    const revisions=down?`; ${down} had downward revisions`:'';
    const unchanged=paired.length-up-down?`; ${paired.length-up-down} were unchanged`:'';
    return result(`${direction}${revisions}${unchanged} (${epi.baseline}–${epi.date}; ${coverage}${epi.absent?`; ${epi.absent} previously reporting areas are absent`:''}). This does not establish weekly case direction.`,areaCaseBasis(epi));
  }
  return result(epi?'Seven-day comparisons are unavailable; the overall case trend cannot be assessed from the loaded observations.':'There is not enough case evidence to assess the overall trend. Load a dated case series with comparable reporting periods.',areaCaseBasis(epi)||incompleteBasis);
}

export function caseTrend(input) { return caseTrendDetails(input).text; }
