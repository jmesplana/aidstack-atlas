import { ResponseRingSlide, ResponseRingControls } from './ResponseRings';
import { useEffect, useMemo, useRef, useState } from 'react';
import { overviewSlideDeck, burdenSlideDeck, caseTrendSlideDeck, DASHBOARD_BRIEFING_TITLES } from '../../../lib/outbreak/dashboardBriefing';
import { MONITORING_CONFIG, trendExplanation } from '../../../lib/outbreak/monitoring';
import { SlideFrame, SlideMap, SvgText, number, signed, short, downloadSlidePNG } from './BriefingPrimitives';
import styles from './outbreak.module.css';
import { responseRingModel, responseProvinceGeography } from '../../../lib/outbreak/responseRings';
import OverviewSignalsSlide from './OverviewSignalsSlide';

const dateAge=(date,asOf)=>date?Math.round((Date.parse(asOf)-Date.parse(date))/86400000):null;
const cfrValue=cfr=>cfr.percent===null?'Unavailable':`${cfr.percent.toFixed(1)}%`;
function Stat({x,label,value,detail}) {
  return <g><rect x={x} y="137" width="365" height="105" rx="8" fill="#edf4f6"/><text x={x+16} y="166" fontSize="16">{label}</text><text x={x+16} y="207" fontSize="31" fontWeight="700">{value}</text><text x={x+16} y="230" fontSize="13">{detail}</text></g>;
}
function RankRows({rows,valueKey='value',x=715,y=285,width=825,height=73,unit='cases',start=0}) {
  const max=Math.max(1,...rows.map(r=>r[valueKey]||0));
  return <g>{rows.map((r,i)=><g key={r.location} aria-label={`Ranked area ${r.location}`}>
    <SvgText x={x} y={y+i*height} fontSize="20" fontWeight="700" width={50} maxLines={1} text={`${start+i+1}. ${r.location}`}/>
    <text x={x+width} y={y+i*height} textAnchor="end" fontSize="22" fontWeight="700">{number(r[valueKey])}</text>
    <rect x={x} y={y+10+i*height} width={width} height="13" rx="3" fill="#e7edf1"/>
    <rect x={x} y={y+10+i*height} width={Math.max(0,r[valueKey]||0)/max*width} height="13" rx="3" fill="#297387"/>
    <text x={x} y={y+44+i*height} fontSize="15">{short(r.province||'Province unavailable',44)} · {unit}{!r.matched?' · Unmapped':''}</text>
  </g>)}</g>;
}
function GlanceCard({x,y,label,value,detail}) {
  return <g aria-label={label}><rect x={x} y={y} width="490" height="126" rx="8" fill="#edf4f6"/><text x={x+18} y={y+29} fontSize="20">{label}</text><text x={x+18} y={y+70} fontSize="34" fontWeight="700">{value}</text><SvgText x={x+18} y={y+96} text={detail} width={61} maxLines={2} fontSize="14" lineHeight={19}/></g>;
}
function SituationSlide({deck,geometry,asOf}) {
  const s=deck.snapshot,g=deck.glance,hz=g.healthZones;
  const top=[...s.rows].filter(r=>r.value>0).sort((a,b)=>b.value-a.value||a.location.localeCompare(b.location)).slice(0,4);
  const recentDetail=metric=>`${metric.start}–${metric.end}${metric.lagDays?` · ${metric.lagDays}d before cut-off`:''} · ${metric.paired}/${metric.areas} areas paired${metric.paired<metric.areas?(metric.paired?' · Partial sum':' · No valid seven-day comparison'):''}`;
  const totalDetail=metric=>`${metric.reported}/${metric.areas} areas have values on ${g.date}${metric.reported<metric.areas?(metric.reported?' · Partial sum':' · Unavailable'):''}`;
  const availability=g.cases.sourceDate&&g.cases.sourceDate===g.deaths.sourceDate?`Source data available through ${g.cases.sourceDate}; dashboard cut-off ${asOf}.`:`Source data available through: cases ${g.cases.sourceDate||'unavailable'}; deaths ${g.deaths.sourceDate||'unavailable'}. Dashboard cut-off ${asOf}.`;
  return <>
    <GlanceCard x={45} y={137} label="Confirmed cases · latest reported week" value={signed(g.cases.recent)} detail={g.confirmed?recentDetail(g.cases):'Select a confirmed-case cumulative source'}/>
    <GlanceCard x={555} y={137} label="Confirmed deaths · latest reported week" value={signed(g.deaths.recent)} detail={g.deathReason||recentDetail(g.deaths)}/>
    <GlanceCard x={1065} y={137} label="Affected health zones" value={hz.total===null?'Unavailable':`${number(hz.affected)} / ${hz.total}${hz.percent===null?'':` · ${hz.percent.toFixed(1)}%`}`} detail={hz.total===null?'Matched health-zone boundaries required':`${hz.scope} · ${hz.missing} zones without reports${hz.missing?' · Known minimum affected share':''}`}/>
    <GlanceCard x={45} y={278} label="Confirmed cases · since outbreak start" value={number(g.cases.total)} detail={g.confirmed?totalDetail(g.cases):'Select a confirmed-case cumulative source'}/>
    <GlanceCard x={555} y={278} label="Confirmed deaths · since outbreak start" value={number(g.deaths.total)} detail={g.deathReason||totalDetail(g.deaths)}/>
    <GlanceCard x={1065} y={278} label="Reported case fatality ratio (CFR)" value={cfrValue(deck.cfr)} detail={deck.cfr.percent===null?'Matching confirmed cases and deaths required':`${number(deck.cfr.deaths)} deaths / ${number(deck.cfr.cases)} cases · ${deck.cfr.paired}/${deck.cfr.available} areas paired`}/>
    <text x="45" y="441" fontSize="22" fontWeight="700">Where reported cumulative burden is concentrated</text>
    <SlideMap geometry={geometry} rows={top} x={45} y={460} height={260}/>
    <RankRows rows={top} y={477} height={66}/>
    {!top.length&&<text x="715" y="520" fontSize="22">No positive cumulative observations in this scope.</text>}
    <text x="45" y="746" fontSize="18" fontWeight="700">{availability}</text>
    <text x="45" y="776" fontSize="16">Source date: {s.date} ({dateAge(s.date,asOf)} days before cut-off). Affected = positive cumulative cases; denominator = all mapped health zones in scope.</text>
  </>;
}
function CurveSlide({deck,points}) {
  const curve=deck.curve,count=points.length,represented=deck.snapshot.rows.filter(r=>r.value>0&&curve.cohort.includes(r.location)).length,step=1380/Math.max(1,count),max=curve.max;
  return <>
    <rect x="45" y="137" width="1510" height="70" rx="8" fill="#edf4f6"/>
    <text x="65" y="166" fontSize="21" fontWeight="700">Same {curve.cohort.length} areas across the entire displayed series / {curve.total} in scope</text>
    <text x="65" y="192" fontSize="16">At the source date, this cohort includes {represented}/{deck.snapshot.positive} areas with positive totals. Missing values and revisions are excluded.</text>
    <text x="45" y="232" fontSize="15">Each week uses the source date with the most available area observations; ties use the latest date.</text>
    <text x="45" y="269" fontSize="18">Reported increase / day</text>
    {[0,.25,.5,.75,1].map(f=><g key={f}><line x1="130" x2="1530" y1={650-f*330} y2={650-f*330} stroke="#dce5eb"/><text x="115" y={656-f*330} textAnchor="end" fontSize="16">{number(f*max)}</text></g>)}
    {points.map((p,i)=>{const x=145+i*step,width=Math.min(110,step-24),barHeight=(p.rate??0)/max*330;return <g key={p.week} aria-label={`Reporting interval ${p.start||'unknown'} to ${p.end||'unknown'}`}>
      {p.rate===null?<text x={x+width/2} y="480" textAnchor="middle" fontSize="22">Unknown</text>:<><rect x={x} y={650-barHeight} width={width} height={Math.max(2,barHeight)} rx="4" fill="#297387"/><text x={x+width/2} y={635-barHeight} textAnchor="middle" fontSize="22" fontWeight="700">{number(p.rate)}</text></>}
      <text x={x+width/2} y="680" textAnchor="middle" fontSize="14">{p.start||'Unavailable'}</text><text x={x+width/2} y="702" textAnchor="middle" fontSize="14">→ {p.end||'Unavailable'}</text>
      <text x={x+width/2} y="727" textAnchor="middle" fontSize="14">{p.delta===null?'No valid cohort':`${number(p.delta)} in ${p.days} days`}</text>
    </g>;})}
    {!count&&<text x="830" y="430" textAnchor="middle" fontSize="23">At least two weekly source observations are needed.</text>}
    <text x="45" y="772" fontSize="16">The cohort excludes {curve.total-curve.cohort.length} areas. Changing the scope or history window can change which areas qualify.</text>
  </>;
}
function FirstReportsSlide({rows,snapshot}) {
  return <>
    <text x="45" y="160" fontSize="22">First positive in loaded history · {snapshot.alertDays}-day window ending {snapshot.date}</text>
    {rows.map((r,i)=><g key={r.location}><rect x="45" y={194+i*88} width="1510" height="78" rx="7" fill={i%2?'#f6f8fa':'#edf4f6'}/><text x="65" y={225+i*88} fontSize="23" fontWeight="700">{short(r.location,70)}</text><text x="1515" y={225+i*88} textAnchor="end" fontSize="21">{r.date} · {number(r.value)} cumulative</text><text x="65" y={253+i*88} fontSize="18">{r.priorZero?'Earlier zero exists in the loaded history.':'No earlier zero established.'} Verify onset dates and location matching before inferring geographic spread.</text></g>)}
  </>;
}
function VerificationSlide({entry,deck}) {
  const s=deck.snapshot,available=deck.monitoringAvailable;
  const blocks=[
    {title:'Sustained reported increases',count:available?entry.sustained.length:'Unknown',rows:entry.sustained,why:available?'Recent observations with two successive rises in daily rate.':'Comparable monitoring history is unavailable.',action:'Verify line-list and onset dates, testing activity and catch-up reporting before interpreting acceleration.'},
    {title:'Visibility lost after a rise',count:available?entry.lost.length:'Unknown',rows:entry.lost,why:available?`Last observed rate rising; report now older than ${MONITORING_CONFIG.maximumReportGapDays} days.`:'Comparable monitoring history is unavailable.',action:'Check for newer publications and contact the source team to establish the current situation.'},
    {title:'Reported case fatality ratio',count:cfrValue(deck.cfr),rows:[],why:deck.cfr.percent===null?deck.cfr.reason:`${number(deck.cfr.deaths)} confirmed deaths / ${number(deck.cfr.cases)} confirmed cases × 100. Observation date: ${s.date}.`,detail:deck.cfr.percent===null?'Missing or incompatible observations are not zero deaths.':`${deck.cfr.paired} of ${deck.cfr.available} areas with case observations have paired deaths. ${deck.cfr.paired<deck.cfr.available?'Partial coverage: the ratio describes this subset only.':'Cases and deaths cover the same areas.'}`,actionTitle:'Interpretation',action:'Reported cumulative ratio. Deaths and outcomes may be delayed; this does not measure individual prognosis or treatment-centre performance.'}
  ];
  return <>{blocks.map((b,i)=><g key={b.title}><rect x={45+i*510} y="150" width="490" height="585" rx="10" fill="#edf4f6"/><text x={65+i*510} y="190" fontSize="23" fontWeight="700">{b.title}</text><text x={65+i*510} y="253" fontSize="44" fontWeight="700">{b.count}</text><SvgText x={65+i*510} y="292" text={b.why} width={46} maxLines={3} fontSize="18" lineHeight={25}/><SvgText x={65+i*510} y="394" text={b.detail||(b.rows.slice(0,5).map(r=>r.location).join(' · ')||'No named areas in this group.')} width={44} maxLines={5} fontSize="18" lineHeight={27}/><text x={65+i*510} y="579" fontSize="18" fontWeight="700">{b.actionTitle||'Next verification step'}</text><SvgText x={65+i*510} y="612" text={b.action} width={46} maxLines={4} fontSize="18" lineHeight={26}/></g>)}<text x="45" y="771" fontSize="17">{s.alerts.length} first positive reports in the loaded {s.alertDays}-day history window. These signals guide verification, not automatic deployment.</text></>;
}
function BurdenRankSlide({entry,deck,geometry}) {
  const recent=deck.metric==='delta',s=deck.snapshot;
  return <>
    <text x="45" y="155" fontSize="21">{recent?`Reported increase: ${s.baseline}–${s.date}`:`Cumulative observations: ${s.date}`} · {deck.ranked.length} priority areas across this deck</text>
    <text x="45" y="188" fontSize="17">Rank {entry.rows.length?entry.start+1:0}–{entry.start+entry.rows.length} · {recent?'Valid paired observations only; revisions and missing pairs excluded.':'A cumulative burden ranking does not measure current caseload or incidence.'}</text>
    <SlideMap geometry={geometry} rows={entry.rows} numberOffset={entry.start} valueKey={deck.metric} y={226} height={478}/>
    <RankRows rows={entry.rows} start={entry.start} valueKey={deck.metric} y={260} height={73} unit={recent?'reported increase':'cumulative cases'}/>
    {!entry.rows.length&&<text x="715" y="370" fontSize="22">No positive observations meet this ranking.</text>}
    <text x="45" y="744" fontSize="17">Use the ranking to review investigation and service capacity with the local team; validate need with recent operational data.</text>
    <text x="45" y="775" fontSize="16">Numbers link this page’s map and rows. Available snapshot: {s.available}/{s.rows.length} areas; {s.unmapped} areas are unmapped.</text>
  </>;
}
function MovementSlide({entry,deck,movement,direction,asOf}) {
  const row=entry.row,inflow=direction==='inflow',id=`movement-${inflow?'in':'out'}`;
  return <>
    <Stat x={45} label="Cumulative case observation" value={number(row.value)} detail={row.date}/>
    <Stat x={425} label="Paired reported increase" value={signed(row.delta)} detail={`${row.baseline}–${row.date}`}/>
    <Stat x={805} label="Mobility observation ends" value={deck.movementEligible?movement.end:'Unavailable'} detail={deck.movementEligible?`${dateAge(movement.end,asOf)} days before cut-off`:'No eligible dated movement period'}/>
    <Stat x={1185} label="Individual connections shown" value={entry.routes.length} detail={inflow?'Leading origins into this area':'Leading destinations from this area'}/>
    <text x="45" y="290" fontSize="22" fontWeight="700">{inflow?'Historical inflow to':'Historical outflow from'} {short(row.location,50)}</text>
    <SvgText x="45" y="323" width={155} maxLines={1} fontSize="17" text={deck.movementEligible?`${movement.start}–${movement.end} · ${movement.unit||'source units'} · rank individual links; values are not summed`:'Movement period is missing, invalid or after the cut-off. Connections are excluded.'}/>
    <defs><marker id={id} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="#297387"/></marker></defs>
    {entry.routes.length?<>
      <rect x="65" y="463" width="420" height="90" rx="12" fill="#17576b"/><SvgText x="275" y="501" text={row.location} textAnchor="middle" width={32} maxLines={2} fontSize="24" fontWeight="700" fill="white"/>
      {entry.routes.map((r,i)=>{const y=383+i*131;return <g key={`${r.origin}:${r.destination}`} aria-label={`${r.origin} to ${r.destination}`}><path d={inflow?`M780 ${y+38}L500 508`:`M500 508L780 ${y+38}`} fill="none" stroke="#297387" strokeWidth="3" markerEnd={`url(#${id})`}/><rect x="790" y={y} width="745" height="100" rx="8" fill="#edf4f6"/><SvgText x="810" y={y+30} text={inflow?r.origin:r.destination} width={55} maxLines={1} fontSize="22" fontWeight="700"/><text x="810" y={y+62} fontSize="21">{number(r.value)} {short(movement.unit||'source units',44)}</text><text x="810" y={y+85} fontSize="15">{short(r.origin,30)} → {short(r.destination,30)}</text></g>;})}
    </>:<><text x="70" y="442" fontSize="24">No eligible positive connections available for this area.</text><SvgText x="70" y="485" text="Zero, missing, redacted and unlisted routes are not interpreted as proof of no movement. Load a dated origin–destination dataset to assess historical connections." fontSize="21" width={112} maxLines={3}/></>}
    <text x="45" y="770" fontSize="17">Preparedness use: verify current travel and surveillance readiness at connected locations. Lines are schematic, not travel routes.</text>
  </>;
}
function TrendSummarySlide({entry,model,shown,scopeTotal}) {
  const counts=entry.counts.filter(r=>r.count),max=Math.max(1,...counts.map(r=>r.count));
  return <>
    <text x="45" y="158" fontSize="22">{shown} areas in the dashboard comparison selection / {scopeTotal} with history in the province scope</text>
    <text x="45" y="194" fontSize="17">{model.periods.length?`Shared interval dates: ${model.periods[0].start}–${model.periods.at(-1).end}`:'Three shared reporting intervals are unavailable.'}</text>
    {counts.map((r,i)=><g key={r.status} aria-label={`Assessment ${r.status}`}><text x="45" y={253+i*54} fontSize="18">{r.label}</text><rect x="310" y={233+i*54} width={365*r.count/max} height="30" rx="3" fill={r.color}/><text x="695" y={255+i*54} fontSize="22" fontWeight="700">{r.count}</text></g>)}
    {!counts.length&&<text x="45" y="280" fontSize="22">No areas match the selected comparison view.</text>}
    {[
      ['What “rising” means','The latest daily rate is higher than the preceding rate. This does not require two successive rises. Inspect the three values on the detail slides.'],
      ['What “sustained decline” means',`Both successive daily-rate reductions meet the current ${model.settings.threshold}% threshold. It does not establish the end of an outbreak.`],
      ['What cannot be assessed','Missing reports, downward revisions and old observations limit interpretation. A shorter interval can raise the daily rate without increasing the reported count.']
    ].map(([title,text],i)=><g key={title}><rect x="815" y={229+i*168} width="740" height="150" rx="8" fill="#edf4f6"/><text x="835" y={264+i*168} fontSize="22" fontWeight="700">{title}</text><SvgText x="835" y={295+i*168} text={text} width={72} maxLines={4} fontSize="18" lineHeight={25}/></g>)}
    <text x="45" y="777" fontSize="16">For the stricter fresh, two-rise criterion, use Reporting history → Slide view → Sustained increases.</text>
  </>;
}
function TrendDetailSlide({entry,geometry,model}) {
  return <>
    <text x="45" y="160" fontSize="22">{entry.province||'Dashboard comparison selection'} · decline threshold {model.settings.threshold}% in each comparison</text>
    <SlideMap geometry={geometry} rows={entry.rows} categories={MONITORING_CONFIG.trendCategories} y={211} height={480}/>
    {entry.rows.map((r,i)=>{const y=216+i*164,explanation=trendExplanation(r,model.settings.threshold),assessed=['rising','declining','falling','mixed','unchanged'].includes(r.status);const briefNote=explanation.caveat?'Rate rose because the interval is shorter; reported count did not rise.':explanation.reason;return <g key={r.location} aria-label={`Trend evidence for ${r.location}`}>
      <rect x="700" y={y-6} width="855" height="157" rx="8" fill={i%2?'#edf4f6':'#f5f8fa'}/>
      <SvgText x="715" y={y+16} text={`${i+1}. ${r.location}`} width={36} maxLines={1} fontSize="20" fontWeight="700"/>
      <text x="1540" y={y+16} textAnchor="end" fontSize="16" fontWeight="700">{MONITORING_CONFIG.trendCategories[r.status]?.label||r.status}</text>
      <text x="715" y={y+40} fontSize="14">Last available: {r.lastReport||'Unknown'} · {r.age===null?'Unknown age':`${r.age} days before cut-off`}{!r.matched?' · Unmapped':''}</text>
      {r.observations.map((o,j)=><g key={o.end}><text x={715+j*278} y={y+65} fontSize="13">I{j+1}: {o.start} → {o.end}</text><text x={715+j*278} y={y+89} fontSize="18" fontWeight="700">{signed(o.delta)} reported · {number(o.rate)}/day</text><text x={715+j*278} y={y+108} fontSize="13">{o.days} days{o.revision?' · revision':o.missing?' · missing value':''}</text></g>)}
      {!r.observations.length&&<text x="715" y={y+83} fontSize="18">Three comparable reporting intervals are unavailable.</text>}
      <text x="715" y={y+128} fontSize="15">{assessed?explanation.steps.map(st=>`${st.label.replace('Week ','I').replace(' → ',' → I')}: ${st.change}`).join(' · '):'Percentage comparisons withheld: evidence cannot support a current trend.'}</text>
      <SvgText x="715" y={y+146} fontSize="14" width={109} maxLines={1} text={briefNote}/>
    </g>;})}
    <SvgText x="45" y="731" text={`Map fill: ${[...new Set(entry.rows.map(r=>r.status))].map(status=>MONITORING_CONFIG.trendCategories[status]?.label).join(' · ')}. Numbers link areas to evidence.`} fontSize="16" width={153} maxLines={2}/>
    <text x="45" y="778" fontSize="16">Counts are changes in cumulative reports. Rates use actual interval days. Missing values and revisions do not establish improvement.</text>
  </>;
}

export const pageTitle=(entry,view)=>({'response-rings':'National three-ring response','response-ring-details':`Province ring register · ${entry.start+1}–${entry.start+entry.rows?.length}`,situation:'Situation at a glance',curve:'Reported changes over time','zone-signals':'Health zones to investigate','first-reports':'First positive reports in loaded history',verification:'Priorities for verification','burden-rank':'Where reported burden is concentrated',movement:`Movement context · ${entry.row?.location||''}`,'trend-summary':'How reported case rates are changing','trend-detail':`Case trend evidence${entry.province?` · ${entry.province}`:''}`,empty:'Evidence unavailable'}[entry.kind]||DASHBOARD_BRIEFING_TITLES[view]);
export function dashboardSlideMetadata({entry,view,deck,epi,asOf,province='',location='',operationTitle='',trendFilter='',movement}) {
  const ringPage=entry.kind.startsWith('response-ring');
  const scope=ringPage?'National scope · all loaded provinces':[province||'All provinces',view==='overview'&&location?location:''].filter(Boolean).join(' / ');
  const source=epi?.dataset.url||epi?.dataset.source||epi?.dataset.label;
  const deathSource=entry.kind==='situation'?deck.glance?.deathSource:deck.cfr?.source;
  const cfrSource=view==='overview'&&['situation','verification'].includes(entry.kind)&&deathSource?` · Confirmed deaths: ${deathSource}`:'';
  const movementSource=entry.kind==='movement'?` · Mobility: ${movement?.source||'No loaded mobility source'}${movement?.limitation?` · ${movement.limitation}`:''}`:'';
  const subtitle=[operationTitle,scope,`Source date ${epi?.date||'unavailable'}`,view==='trends'&&trendFilter?`Assessment filter: ${MONITORING_CONFIG.trendCategories[trendFilter]?.label||trendFilter}`:''].filter(Boolean).join(' · ');
  const note=entry.kind==='situation'?'Weekly figures are changes in reported cumulative totals. Missing pairs and revisions are excluded; missing reports are not zero.':ringPage?'Suggested rings require coordinator review. Reported increases do not confirm transmission; unchanged totals do not confirm its absence.':entry.kind==='zone-signals'?'Verification shortlist, not a severity score. Reported changes do not establish transmission chains or outbreak control.':entry.kind==='curve'?'This is a reporting trend, not an onset-based epidemic curve. A fixed cohort improves comparability but may exclude many areas.':entry.kind==='movement'?'Historical mobility is context for preparedness; it does not identify exposure, current travel or transmission.':view==='trends'?'Reported rates are signals for verification. Changes in detection, publication timing or catch-up reporting may affect them.':'Available source observations may be partial. Cumulative cases do not measure current caseload; missing reports are not zero cases.';
  return {title:pageTitle(entry,view),subtitle,source:`${source||'Loaded case dataset'}${cfrSource}${movementSource}`,note};
}
export function DashboardSlide({svgRef,entry,deck,ringModel,geometry,asOf,model,trendRows=[],scopeTotal=0,movement,direction='outflow',page,total,...metadata}) {
  const ringPage=entry.kind.startsWith('response-ring');
  return <SlideFrame svgRef={svgRef} asOf={asOf} page={page} total={total} {...metadata}>
        {ringPage&&<ResponseRingSlide model={ringModel} entry={entry.kind==='response-ring-details'?{...entry,rows:ringModel.rows.slice(entry.start,entry.start+8)}:entry}/>}
        {entry.kind==='situation'&&<SituationSlide deck={deck} geometry={geometry} asOf={asOf}/>}
        {entry.kind==='curve'&&<CurveSlide deck={deck} points={entry.points}/>}
        {entry.kind==='zone-signals'&&<OverviewSignalsSlide signals={deck.signals}/>}
        {entry.kind==='first-reports'&&<FirstReportsSlide rows={entry.rows} snapshot={deck.snapshot}/>}
        {entry.kind==='verification'&&<VerificationSlide entry={entry} deck={deck}/>}
        {entry.kind==='burden-rank'&&<BurdenRankSlide entry={entry} deck={deck} geometry={geometry}/>}
        {entry.kind==='movement'&&<MovementSlide entry={entry} deck={deck} movement={movement} direction={direction} asOf={asOf}/>}
        {entry.kind==='trend-summary'&&<TrendSummarySlide entry={entry} model={model} shown={trendRows.length} scopeTotal={scopeTotal}/>}
        {entry.kind==='trend-detail'&&<TrendDetailSlide entry={entry} geometry={geometry} model={model}/>}
        {entry.kind==='empty'&&<SvgText x="65" y="245" text="No eligible case observations at this cut-off. Connect or refresh the source, or adjust the cut-off before interpreting the situation." fontSize="25" width={96} maxLines={3}/>}
  </SlideFrame>;
}

export default function DashboardBriefingDialog({onClose,curveWeeks,setCurveWeeks,grouped,setGrouped,ringSettings,onRingSettings,view,datasets=[],epi,geometry,boundaryLevel,model,asOf,province='',location='',settings={},alertDays=7,movement,direction='outflow',trendRows=[],scopeTotal=0,trendFilter='',operationTitle=''}) {
  const [page,setPage]=useState(0),[exporting,setExporting]=useState(false),[error,setError]=useState('');
  const exportButtonRef=useRef(null),restoreExportFocus=useRef(false);
  const dialogRef=useRef(null),svgRef=useRef(null);
  const provinceGeography=useMemo(()=>view==='overview'?responseProvinceGeography(geometry,boundaryLevel):null,[view,geometry,boundaryLevel]);
  // The deck only needs province names until a ring slide is selected.
  const ringRegister=useMemo(()=>provinceGeography?{rows:provinceGeography.features.map(f=>({location:f.properties.nom})).sort((a,b)=>a.location.localeCompare(b.location))}:null,[provinceGeography]);
  const deck=useMemo(()=>view==='overview'?overviewSlideDeck({epi,datasets,geometry,boundaryLevel,model,asOf,province,location,alertDays,horizonWeeks:curveWeeks,ringModel:ringRegister}):view==='burden'?burdenSlideDeck({epi,geometry,boundaryLevel,asOf,province,location,settings,movement,direction}):caseTrendSlideDeck(trendRows,{grouped}),[ringRegister,view,epi,datasets,geometry,boundaryLevel,model,asOf,province,location,alertDays,curveWeeks,settings.burdenMetric,settings.topZones,movement,direction,trendRows,grouped]);
  const current=Math.min(page,deck.pages.length-1),entry=deck.pages[current];
  useEffect(()=>setPage(0),[view,province,location,asOf,trendFilter,settings.burdenMetric,settings.topZones,direction]);
  useEffect(()=>{const dialog=dialogRef.current,previous=document.activeElement;dialog.showModal();return()=>{dialog.close();if(previous?.isConnected)previous.focus();};},[]);
  const ringPage=entry.kind.startsWith('response-ring');
  const ringModel=useMemo(()=>ringPage?responseRingModel({epi,provinceGeography,boundaryLevel,asOf,settings:ringSettings}):null,[ringPage,epi,provinceGeography,boundaryLevel,asOf,ringSettings]);
  const slideMetadata=dashboardSlideMetadata({entry,view,deck,epi,asOf,province,location,operationTitle,trendFilter,movement});
  useEffect(()=>{if(!exporting&&restoreExportFocus.current){restoreExportFocus.current=false;exportButtonRef.current?.focus();}},[exporting]);
  async function exportPNG(){restoreExportFocus.current=true;setExporting(true);setError('');try{await downloadSlidePNG(svgRef.current,`${view}-briefing_${asOf}_${current+1}.png`);}catch(e){setError(e.message||'Unable to export this slide.');}finally{setExporting(false);}}
  return <dialog ref={dialogRef} className={`${styles.reportingSlideDialog} ${styles.dashboardSlideDialog}`} aria-label={`${DASHBOARD_BRIEFING_TITLES[view]} slide view`} data-section-focus="true" onCancel={e=>{e.preventDefault();e.stopPropagation();onClose();}} onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();onClose();}}}>
      <div className={styles.reportingSlideToolbar}><strong>{DASHBOARD_BRIEFING_TITLES[view]}</strong><button type="button" disabled={current===0} onClick={()=>setPage(current-1)}>Previous</button><span>Slide {current+1} of {deck.pages.length}</span><button type="button" disabled={current===deck.pages.length-1} onClick={()=>setPage(current+1)}>Next</button><button ref={exportButtonRef} type="button" disabled={exporting} onClick={exportPNG}>{exporting?'Exporting…':'Download PNG · 1920 × 1080'}</button><button type="button" onClick={()=>onClose()}>Close slide view</button></div>
      <div className={styles.reportingSlideFilters}><label>Briefing slide<select value={current} onChange={e=>setPage(Number(e.target.value))}>{deck.pages.map((item,i)=><option key={i} value={i}>{i+1}. {pageTitle(item,view)}</option>)}</select></label>{view==='overview'&&<label>Slide trend window<select value={curveWeeks} onChange={e=>{setCurveWeeks(Number(e.target.value));setPage(0);}}>{[3,6,26].map(n=><option key={n} value={n}>{n} reporting weeks</option>)}</select></label>}{view==='trends'&&<label><input type="checkbox" checked={grouped} onChange={e=>{setGrouped(e.target.checked);setPage(0);}}/>Group evidence by province</label>}<span>{ringPage?'National rings use all loaded provinces and the reporting cut-off.':'Follows this tab’s scope, cut-off and analysis settings.'}</span></div>
      {error&&<p role="alert">{error}</p>}
      {ringPage&&onRingSettings&&<ResponseRingControls model={ringModel} settings={ringSettings} onChange={onRingSettings} asOf={asOf}/>}

      <DashboardSlide svgRef={svgRef} entry={entry} deck={deck} ringModel={ringModel} geometry={geometry} asOf={asOf} model={model} trendRows={trendRows} scopeTotal={scopeTotal} movement={movement} direction={direction} page={current} total={deck.pages.length} {...slideMetadata}/>
    </dialog>;
}
