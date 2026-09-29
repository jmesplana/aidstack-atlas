import { MONITORING_CONFIG, reportingPriorities } from './monitoring.js';

export const BRIEFING_MODES={
  availability:{label:'Source availability',title:'Surveillance visibility'},
  sustained:{label:'Sustained increases',title:'Sustained reported increases'},
  lost:{label:'Visibility lost',title:'Visibility lost after an increase'}
};
export const briefingProvince=row=>row.province||(row.matched?'Province unavailable':'Unmapped source locations');
export function briefingCriteria(mode) {
  const days=MONITORING_CONFIG.maximumReportGapDays;
  if(mode==='sustained')return `Daily rate rose twice across three 6–8 day intervals; last observation ≤${days} days old, with no newer missing value.`;
  if(mode==='lost')return `Last observed daily rate was rising; latest available report >${days} days old. This is a historical signal.`;
  return 'Age of the latest available report; source availability does not establish reporting completeness.';
}
export function rateChangeLabel(value,before) {
  return Number.isFinite(value)?`${value>0?'+':''}${Number(value.toFixed(1))}%`:before===0?'from zero; % undefined':'% unavailable';
}

// Build both summary and detail pages from the same scoped rows. No case totals
// are aggregated: each zone's three intervals may have different dates.
export function reportingSlideDeck(rows,{mode='availability',grouped=false,province='',selected=''}={}) {
  const scoped=rows.filter(r=>!province||briefingProvince(r)===province);
  const summaries=new Map();
  for(const row of scoped){
    const name=briefingProvince(row);
    const summary=summaries.get(name)||{province:name,total:0,sustained:0,lost:0,unavailable:0};
    summary.total++;summary.sustained+=row.sustainedIncrease?1:0;summary.lost+=row.visibilityLost?1:0;summary.unavailable+=row.age===null?1:0;
    summaries.set(name,summary);
  }
  const provinces=[...summaries.values()].sort((a,b)=>a.province.localeCompare(b.province));
  const matches=scoped.filter(r=>mode==='sustained'?r.sustainedIncrease:mode==='lost'?r.visibilityLost:true);
  const lastRate=r=>r.lastTrend?.observations.at(-1)?.rate??-1;
  const ordered=mode==='availability'?reportingPriorities(matches):[...matches].sort((a,b)=>(mode==='lost'?b.age-a.age:0)||lastRate(b)-lastRate(a)||a.location.localeCompare(b.location));
  // Keep the selected zone in the availability briefing without promoting it in
  // the epidemiologic views, whose explicit ordering should remain reproducible.
  if(mode==='availability'&&selected){const index=ordered.findIndex(r=>r.location===selected);if(index>0)ordered.unshift(...ordered.splice(index,1));}
  const pages=[],size=mode==='availability'?6:4;
  if(grouped)for(let i=0;i<provinces.length;i+=8)pages.push({kind:'summary',summaries:provinces.slice(i,i+8),start:i});
  const groups=grouped?provinces.map(p=>({province:p.province,rows:ordered.filter(r=>briefingProvince(r)===p.province)})):[{province:'',rows:ordered}];
  for(const group of groups)for(let i=0;i<group.rows.length;i+=size)pages.push({kind:'detail',province:group.province,rows:group.rows.slice(i,i+size),start:i,total:group.rows.length});
  if(!pages.length)pages.push({kind:'detail',province,rows:[],start:0,total:0});
  return {pages,provinces,total:scoped.length,matching:matches.length};
}
