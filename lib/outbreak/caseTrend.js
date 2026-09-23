import { observationIndex, comparisonBaseline } from './comparison.js';
import { dailyComparison, nationalEvidence, formatValue } from './data.js';

const shift=(date,days)=>new Date(Date.parse(date)+days*86400000).toISOString().slice(0,10);
const isCases=d=>d.purpose==='cases'||/^(national_)?(new|cumulative)_confirmed_cases$/.test(d.metricId||'');

// Use one source at a time; counts of comparable areas are not national totals.
export function caseTrend({datasets=[],epi,asOf}) {
  const daily=datasets.filter(d=>d.status==='ready'&&d.kind==='daily'&&isCases(d)&&d.level!=='site');
  const national=daily.filter(d=>d.level==='national');
  const candidates=national.length?national:daily.filter(d=>!epi?.dataset||d.level===epi.dataset.level);
  if(candidates.length===1) {
    const dataset=candidates[0],rows=dailyComparison(dataset.records,asOf);
    const paired=rows.filter(r=>r.reported===14);
    const dates=`${shift(asOf,-6)}–${asOf} versus ${shift(asOf,-13)}–${shift(asOf,-7)}`;
    if(paired.length&&dataset.level==='national'&&rows.length===1) {
      const row=paired[0],direction=row.current>row.previous?'increased':row.current<row.previous?'decreased':'were unchanged';
      return `${dataset.label||'Reported cases'} for ${row.location} ${direction}: ${formatValue(row.current)} versus ${formatValue(row.previous)} ${dataset.unit||'cases'} over comparable seven-day periods (${dates}).`;
    }
    if(paired.length&&dataset.level!=='national') {
      const up=paired.filter(r=>r.current>r.previous).length,down=paired.filter(r=>r.current<r.previous).length;
      return `${dataset.label||'Reported daily cases'}: seven-day totals increased in ${up}, decreased in ${down} and were unchanged in ${paired.length-up-down} areas (${dates}); ${paired.length}/${rows.length} areas have all 14 daily observations. This describes comparable areas only.`;
    }
  }
  const nationalCases=datasets.filter(d=>d.status==='ready'&&d.level==='national'&&d.kind==='cumulative'&&isCases(d));
  const facts=nationalEvidence(nationalCases,asOf);
  if(nationalCases.length===1&&facts.length===1) {
    const fact=facts[0];
    const change=fact.delta===null?'A previous comparable total is unavailable.':fact.delta<0?`The total was revised downward by ${formatValue(-fact.delta)} since ${fact.since}; this does not establish a decline in new cases.`:`The reported cumulative total ${fact.delta===0?'was unchanged':`increased by ${formatValue(fact.delta)}`} since ${fact.since}.`;
    const records=nationalCases[0].records;
    const location=records.find(r=>r.date===fact.date&&r.value===fact.value)?.location;
    const valueAt=observationIndex(records);
    const interval=comparisonBaseline(valueAt,[location],fact.date,true);
    const prior=valueAt(location,interval.start),current=valueAt(location,fact.date);
    const delta=prior!==null&&current!==null?current-prior:null;
    const weekly=delta===null
      ? 'Recent comparison unavailable: no valid paired national totals six, seven or eight days apart. The available change between reports does not establish whether weekly new cases are rising or falling.'
      : `Over ${interval.days} days (${interval.start}–${interval.end}), the reported cumulative total ${delta<0?`was revised downward by ${formatValue(-delta)}`:delta===0?'was unchanged':`increased by ${formatValue(delta)}`}.${interval.days!==7?' A nearby report date is used because the seven-day comparison is unavailable.':''} Cumulative totals may include backlogs and revisions; these changes do not establish new-case incidence.`;
    const label=(nationalCases[0].label||'cumulative confirmed cases').replace(/^National\s+/i,'');
    return `${formatValue(fact.value)} ${label} reported nationally on ${fact.date}. ${change} ${weekly}`;
  }
  const paired=epi?.growth.filter(z=>Number.isFinite(z.delta))||[];
  if(paired.length) {
    const up=paired.filter(z=>z.delta>0).length,down=paired.filter(z=>z.delta<0).length;
    const coverage=`${paired.length}/${epi.zones?.length||paired.length} areas have paired observations`;
    const direction=up?`Reported cumulative case totals increased in ${up} areas`:`No positive ${epi.comparisonDays && epi.comparisonDays !== 7 ? `${epi.comparisonDays}-day` : 'seven-day'} changes in reported cumulative totals were observed`;
    const revisions=down?`; ${down} had downward revisions`:'';
    const unchanged=paired.length-up-down?`; ${paired.length-up-down} were unchanged`:'';
    return `${direction}${revisions}${unchanged} (${epi.baseline}–${epi.date}; ${coverage}${epi.absent?`; ${epi.absent} previously reporting areas are absent`:''}). This does not establish weekly case direction.`;
  }
  return epi?'Seven-day comparisons are unavailable; the overall case trend cannot be assessed from the loaded observations.':'There is not enough case evidence to assess the overall trend. Load a dated case series with comparable reporting periods.';
}
