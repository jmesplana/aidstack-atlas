import { overviewSlideDeck, burdenSlideDeck, caseTrendSlideDeck } from './dashboardBriefing.js';
import { reportingSlideDeck, BRIEFING_MODES } from './reportingBriefing.js';
import { responseRingModel } from './responseRings.js';
import { monitoringSettings, MONITORING_CONFIG } from './monitoring.js';

export const COORDINATION_SECTIONS=[
  ['overview','Situation overview and response rings'],
  ['burden','High burden and movement'],
  ['trends','Case trend assessment'],
  ['availability','Surveillance visibility'],
  ['sustained','Sustained reported increases'],
  ['lost','Visibility lost after an increase']
];
const number=value=>Number.isFinite(value)?Number(value.toFixed(1)).toLocaleString('en-US'):'Unavailable';
const sourceName=d=>d?.url||d?.source||d?.label||'Source not specified';

// Build once from captured input. Export never refreshes sources or recomputes
// against changing dashboard filters midway through a presentation.
export function coordinationBriefing(input,{province='',sections=COORDINATION_SECTIONS.map(([id])=>id),curveWeeks=3,includeAppendix=false}={}) {
  const settings=monitoringSettings(input.settings),scoped={...input,province,location:'',settings,horizonWeeks:curveWeeks};
  const ringModel=responseRingModel({...input,settings:input.ringSettings});
  const overview=overviewSlideDeck({...scoped,ringModel});
  const areaRows=(input.model?.rows||[]).filter(r=>!province||r.province===province);
  const observed=areaRows.filter(r=>r.hasHistory);
  // Include all histories in the full briefing, including incomparable and
  // revised observations. Detailed appendices must not silently drop them.
  const trendRows=[...observed].sort((a,b)=>(a.province||'').localeCompare(b.province||'')||a.location.localeCompare(b.location));
  const detailedChapters=[];
  for(const [id,label] of COORDINATION_SECTIONS){
    if(!sections.includes(id))continue;
    let deck;
    if(id==='overview')deck=overview;
    else if(id==='burden')deck=burdenSlideDeck(scoped);
    else if(id==='trends')deck=input.model?caseTrendSlideDeck(trendRows,{grouped:true}):{pages:[{kind:'empty'}]};
    else deck=input.model?reportingSlideDeck(areaRows,{mode:id,grouped:true,summaryOnly:id==='availability'}):{pages:[{kind:'empty'}]};
    detailedChapters.push({id,label,type:BRIEFING_MODES[id]?'reporting':'dashboard',view:id,mode:id,deck});
  }
  // The presentation has a fixed seven evidence pages, regardless of the
  // number of zones. Detail is opt-in and never changes the summary totals.
  const overviewPages=overview.snapshot?[
    {kind:'situation'},
    {kind:'curve',points:overview.curve.points.slice(-8)},
    {kind:'response-rings'}
  ]:[{kind:'empty'}];
  const burden=burdenSlideDeck({...scoped,settings:{...settings,topZones:5}});
  const surveillance={total:areaRows.length,recent:0,older:0,missing:0,provinces:[]};
  const groups=new Map();
  for(const row of areaRows){
    const category=row.age===null?'missing':row.age>MONITORING_CONFIG.maximumReportGapDays?'older':'recent';
    surveillance[category]++;
    const name=row.province||'Unassigned source locations';
    const group=groups.get(name)||{name,total:0,recent:0,older:0,missing:0};
    group.total++;group[category]++;groups.set(name,group);
  }
  surveillance.provinces=[...groups.values()].sort((a,b)=>(b.older+b.missing)-(a.older+a.missing)||a.name.localeCompare(b.name));
  const priorities={
    sustained:areaRows.filter(r=>r.sustainedIncrease).sort((a,b)=>(b.lastTrend?.observations.at(-1)?.rate||0)-(a.lastTrend?.observations.at(-1)?.rate||0)||a.location.localeCompare(b.location)),
    lost:areaRows.filter(r=>r.visibilityLost).sort((a,b)=>b.age-a.age||a.location.localeCompare(b.location))
  };
  const coreChapters=[
    {id:'overview',label:'Situation, reported changes and response rings',type:'dashboard',view:'overview',deck:{...overview,pages:overviewPages}},
    {id:'burden',label:'Five areas with highest reported burden',type:'dashboard',view:'burden',deck:{...burden,pages:burden.pages.slice(0,1)}},
    {id:'trends',label:'Case trend assessment',type:'dashboard',view:'trends',deck:input.model?{pages:caseTrendSlideDeck(trendRows).pages.slice(0,1)}:{pages:[{kind:'empty'}]}},
    {id:'surveillance',label:'Surveillance gaps by province',type:'coordination',deck:{pages:[{kind:'coordination-surveillance'}]}},
    {id:'priorities',label:'Priority verification follow-up',type:'coordination',deck:{pages:[{kind:'coordination-priorities'}]}}
  ];
  const appendixChapters=detailedChapters.map(c=>({...c,appendix:true,deck:{...c.deck,pages:c.deck.pages.filter(p=>!['situation','curve','response-rings','trend-summary','empty'].includes(p.kind))}})).filter(c=>c.deck.pages.length);
  const chapters=[...coreChapters,...(includeAppendix?appendixChapters:[])];
  const g=overview.glance;
  const week=(metric,label)=>metric?.recent===null?`${label}: a valid seven-day comparison is unavailable.`:`${label}: ${number(metric.recent)} reported during ${metric.start}–${metric.end}; ${metric.paired}/${metric.areas} areas paired${metric.paired<metric.areas?' (partial sum)':''}.`;
  const findings=g?[
    week(g.cases,'Confirmed cases, latest reported week'),
    week(g.deaths,'Confirmed deaths, latest reported week'),
    `Cumulative reported totals at ${g.date}: ${number(g.cases.total)} confirmed cases; ${number(g.deaths.total)} confirmed deaths. Case coverage ${g.cases.reported}/${g.cases.areas}; death coverage ${g.deaths.reported}/${g.deaths.areas}.`,
    `Affected health zones: ${number(g.healthZones.affected)} / ${number(g.healthZones.total)} (${number(g.healthZones.percent)}%) in ${g.healthZones.scope}. ${g.healthZones.missing} zones without reports; the affected share is a known minimum when reporting is incomplete.`,
    input.model?`Verification priorities: ${areaRows.filter(r=>r.sustainedIncrease).length} zones with sustained reported increases; ${areaRows.filter(r=>r.visibilityLost).length} with visibility lost after an increase. These reporting signals require local verification.`:'Comparable monitoring history is unavailable.'
  ]:['No eligible case observations at this reporting cut-off.'];
  const sources=[input.epi?.dataset,...(input.datasets||[]).filter(d=>d.status==='ready'&&d.metricId==='cumulative_confirmed_deaths'&&d.level===input.epi?.dataset.level),...(includeAppendix&&sections.includes('burden')&&input.movement?[input.movement]:[])].filter(Boolean);
  const sourceRegister=[...new Map(sources.map(d=>[sourceName(d),{name:d.label||'Movement observations',source:sourceName(d),retrieved:d.fetchedAt||null}])).values()];
  const availability=g?`Source data available through: cases ${g.cases.sourceDate||'unavailable'}; deaths ${g.deaths.sourceDate||'unavailable'}. Dashboard cut-off ${input.asOf}.`:`Reporting cut-off ${input.asOf}; source dates unavailable.`;
  return {chapters,coreChapters,appendixChapters,includeAppendix,surveillance,priorities,monitoringAvailable:!!input.model,overview,ringModel,trendRows,scopeTotal:observed.length,findings,sourceRegister,availability,province,scope:province||'All loaded provinces',settings,
    title:input.operationTitle||'Outbreak coordination briefing',asOf:input.asOf,visualCount:chapters.reduce((sum,c)=>sum+c.deck.pages.length,0),curveWeeks,
    methods:[
      'Seven-day figures end on the latest available source date for each metric and use exact cumulative endpoint observations. They are changes in reports, not onset-based incidence.',
      'Missing, ambiguous and revised comparisons are excluded. Local sums may be partial; missing reports are not zero cases. CFR uses only paired confirmed case and death observations.',
      `Case trend history: ${settings.historyWeeks} weeks; sustained-decline threshold ${settings.threshold}% per comparison. Overview chart: ${curveWeeks} reporting weeks. Main briefing: top five areas by ${settings.burdenMetric}; appendix ranking: top ${settings.topZones}.`,
      'Summary totals use every area in the province scope. The main deck shows five burden areas, up to six provinces with the most older or missing reports, and four zones per verification group. Remaining detail is available in the optional appendix.',
      'The surveillance visibility appendix summarizes eight provinces per slide, retaining every zone in recent, older and unavailable-report counts. It does not paginate individual zones. Full zone histories remain available in the dashboard.',
      'Response rings always cover all loaded provinces. Automatic classifications are planning suggestions, not official transmission classifications; dated coordinator overrides take precedence.',
      'Historical mobility informs preparedness. It does not identify current travel, exposure or transmission. No new source data was fetched during export.'
    ]};
}
