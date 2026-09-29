import dynamic from 'next/dynamic';
import { useState } from 'react';
import { DASHBOARD_BRIEFING_TITLES } from '../../../lib/outbreak/briefingTitles';
import SlideViewActions from './SlideViewActions';

// Loading and computing slide content must never block opening the dashboard.
const BriefingDialog=dynamic(()=>import('./DashboardBriefingDialog'),{
  ssr:false,loading:()=> <p role="status">Preparing slides…</p>
});
export default function DashboardBriefing(props) {
  const [open,setOpen]=useState(false),[curveWeeks,setCurveWeeks]=useState(3),[grouped,setGrouped]=useState(true);
  return <SlideViewActions>
    <button type="button" title={`${DASHBOARD_BRIEFING_TITLES[props.view]} · dated evidence and verification priorities`} onClick={()=>setOpen(true)}>Slide view · 16:9</button>
    {open&&<BriefingDialog {...props} curveWeeks={curveWeeks} setCurveWeeks={setCurveWeeks} grouped={grouped} setGrouped={setGrouped} onClose={()=>setOpen(false)}/>}
  </SlideViewActions>;
}
