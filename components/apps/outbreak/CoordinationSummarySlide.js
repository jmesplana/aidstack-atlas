import { MONITORING_CONFIG } from '../../../lib/outbreak/monitoring';
import { SlideFrame, SvgText } from './BriefingPrimitives';

export default function CoordinationSummarySlide({entry,briefing,input,page,total,source}) {
  const gap=MONITORING_CONFIG.maximumReportGapDays,s=briefing.surveillance,available=briefing.monitoringAvailable;
  const surveillance=entry.kind==='coordination-surveillance';
  return <SlideFrame title={surveillance?'Surveillance gaps by province':'Priority verification follow-up'} subtitle={`${briefing.scope} · all areas in scope contribute to summary counts`} asOf={input.asOf} page={page} total={total} source={source} note={surveillance?'Report age measures source availability, not surveillance completeness. Missing reports are not zero cases.':'Reported increases require verification of onset dates, testing and publication delays before inferring transmission.'}>
    {!available?<SvgText x={65} y={240} text="Comparable monitoring history is unavailable. No current surveillance or verification counts can be established." width={100} fontSize={26}/>:surveillance?<>
      {[['Report within '+gap+' days',s.recent],['Report older than '+gap+' days',s.older],['No available report',s.missing]].map(([label,count],i)=><g key={label}><rect x={45+i*510} y={145} width={490} height={120} rx={8} fill="#edf4f6"/><text x={65+i*510} y={183} fontSize={23}>{label}</text><text x={65+i*510} y={235} fontSize={34} fontWeight="700">{count} / {s.total} areas</text></g>)}
      <text x={45} y={310} fontSize={22} fontWeight="700">Provinces with the most older or missing reports</text>
      <text x={45} y={343} fontSize={17}>Showing {Math.min(6,s.provinces.length)} of {s.provinces.length} groups · ranked by number of areas needing reporting follow-up</text>
      <text x={920} y={388} fontSize={18}>Older</text><text x={1120} y={388} fontSize={18}>No report</text><text x={1350} y={388} fontSize={18}>All areas</text>
      {s.provinces.slice(0,6).map((p,i)=><g key={p.name}><rect x={45} y={406+i*55} width={1510} height={49} fill={i%2?'#f7f9fa':'#edf4f6'}/><SvgText x={65} y={439+i*55} text={p.name} width={58} maxLines={1} fontSize={21}/><text x={920} y={439+i*55} fontSize={22}>{p.older}</text><text x={1120} y={439+i*55} fontSize={22}>{p.missing}</text><text x={1350} y={439+i*55} fontSize={22}>{p.total}</text></g>)}
      <text x={45} y={773} fontSize={17}>Unassigned source locations are shown separately when province matching is unavailable.</text>
    </>:<>
      {[{title:'Sustained reported increases',rows:briefing.priorities.sustained,criterion:`Two successive rate increases; latest report within ${gap} days.`,order:'Highest latest reported rate first.',action:'Verify onset dates, testing activity and recent reporting changes.'},{title:'Visibility lost after an increase',rows:briefing.priorities.lost,criterion:`Historical rising rate; latest report older than ${gap} days.`,order:'Oldest latest report first.',action:'Confirm whether newer reports exist with provincial teams.'}].map((group,i)=><g key={group.title}>
        <rect x={45+i*770} y={145} width={740} height={620} rx={8} fill="#edf4f6"/>
        <text x={65+i*770} y={187} fontSize={25} fontWeight="700">{group.title}</text>
        <text x={65+i*770} y={237} fontSize={34} fontWeight="700">{group.rows.length} {group.rows.length===1?'area':'areas'}</text>
        <SvgText x={65+i*770} y={275} text={group.criterion} fontSize={18} width={67} maxLines={2}/>
        <text x={65+i*770} y={327} fontSize={17}>Showing {Math.min(4,group.rows.length)} of {group.rows.length} · {group.order}</text>
        {group.rows.slice(0,4).map((row,j)=><g key={row.location}><SvgText x={65+i*770} y={376+j*71} text={`${j+1}. ${row.location} · ${row.province||'Province unavailable'}`} fontSize={20} width={58} maxLines={2} lineHeight={22}/><text x={65+i*770} y={420+j*71} fontSize={15}>Latest report: {row.lastReport||'unavailable'}</text></g>)}
        {!group.rows.length&&<text x={65+i*770} y={393} fontSize={21}>No areas meet this reporting criterion.</text>}
        <SvgText x={65+i*770} y={697} text={group.action} fontSize={20} fontWeight="700" width={59} maxLines={2}/>
      </g>)}
    </>}
  </SlideFrame>;
}
