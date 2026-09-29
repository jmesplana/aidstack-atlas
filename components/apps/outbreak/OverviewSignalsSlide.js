import { reportingHeatBand, reportingWeekDescription } from '../../../lib/outbreak/monitoring';
import { SvgText, number, signed } from './BriefingPrimitives';

const label=row=>row.signal==='new'?'First positive after a recorded zero':row.signal==='gap'?'Visibility lost after a rise':row.sustainedIncrease?'Two successive rate increases':'Latest reported rate increased';
const action=row=>row.signal==='new'?'Verify case classification, onset and exposure location.':row.signal==='gap'?'Seek newer reports; verify investigation follow-up.':'Check onset dates, case links and catch-up reporting.';

export default function OverviewSignalsSlide({signals}) {
  const {rows,windows,eligible,available}=signals;
  return <>
    <text x="45" y="154" fontSize="22" fontWeight="700">Zones selected: {rows.length} · Zones meeting the signal rules: {eligible}</text>
    <text x="45" y="188" fontSize="17">Changes between reports, placed in the week of the last report · oldest → newest · * partial week through cut-off</text>
    <text x="45" y="253" fontSize="18" fontWeight="700">Health zone / province</text>
    {windows.map((w,j)=><g key={w.start}><text x={395+j*120} y="237" textAnchor="middle" fontSize="17" fontWeight="700">W{w.week}{w.partial?'*':''}</text><text x={395+j*120} y="260" textAnchor="middle" fontSize="13">{w.start.slice(5)}–{w.end.slice(5)}</text></g>)}
    <text x="1080" y="253" fontSize="18" fontWeight="700">Why this zone / next verification step</text>
    {rows.map((row,i)=>{
      const y=281+i*83;
      const evidence=row.signal==='new'?`First positive: ${row.first.date} · ${number(row.first.value)} cumulative`:row.signal==='gap'?`Last available: ${row.lastReport} · ${row.age} days ago`:`Last 3 intervals: ${row.lastTrend.observations.map(o=>number(o.rate)).join(' → ')}/day`;
      return <g key={row.location} aria-label={`Priority history for ${row.location}`}>
        <rect x="45" y={y} width="1510" height="77" rx="7" fill={i%2?'#edf4f6':'#f5f8fa'}/>
        <SvgText x="57" y={y+27} text={row.location} width={24} maxLines={1} fontSize="21" fontWeight="700"/>
        <SvgText x="57" y={y+54} text={row.province||'Province unavailable'} width={29} maxLines={1} fontSize="15"/>
        {row.timeline.map((w,j)=>{
          const band=w.status==='increase'?reportingHeatBand(w.delta):null;
          const fill=band?.color||({missing:'#e5ebef',revision:'#e5d8ed',quiet:'#dcece8',reported:'#e0eaf3'}[w.status]);
          const value=w.status==='missing'?'×':w.status==='reported'?'•':w.status==='revision'?`↧ ${signed(w.delta)}`:signed(w.delta);
          return <g key={w.start} aria-label={reportingWeekDescription(row,w)}><title>{reportingWeekDescription(row,w)}</title><rect x={339+j*120} y={y+7} width="112" height="62" rx="5" fill={fill}/><text x={395+j*120} y={y+35} textAnchor="middle" fontSize="22" fontWeight="700" fill={band?.text||'#18334b'}>{value}</text><text x={395+j*120} y={y+56} textAnchor="middle" fontSize="12" fill={band?.text||'#18334b'}>{w.date?w.date.slice(5):'Unavailable'}</text></g>;
        })}
        <text x="1080" y={y+22} fontSize="18" fontWeight="700" fill={row.signal==='gap'?'#8a5713':'#9f3930'}>{label(row)}</text>
        <text x="1080" y={y+44} fontSize="14">{evidence}</text>
        <SvgText x="1080" y={y+65} text={action(row)} width={61} maxLines={1} fontSize="14"/>
      </g>;
    })}
    {!rows.length&&<><SvgText x="80" y="377" text={available?'No zones meet these selection rules at this cut-off.':'Comparable health-zone history is unavailable.'} fontSize="26" width={92} maxLines={2}/><SvgText x="80" y="445" text="Incomplete history can hide signals. Review source availability; this does not establish absence of Ebola transmission." fontSize="22" width={105} maxLines={2}/></>}
    <text x="45" y="726" fontSize="16">Selection: up to five, with one per signal type before filling slots. {eligible-rows.length} additional qualifying zones remain in the detailed views.</text>
    <text x="45" y="751" fontSize="15">New: first positive in 7 days after a recorded zero. Rising: report ≤8 days old. Lost visibility: last rise within this six-week window.</text>
    <text x="45" y="776" fontSize="15">Cells: + reported change (darker = larger) · 0 unchanged · × unavailable · • no valid comparison · ↧ revision. Cell date = last report that week.</text>
  </>;
}
