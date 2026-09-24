import {OutbreakMap} from './Visuals';
import styles from './outbreak.module.css';

// Share layer choices across movement views and the saved briefing snapshot.
export default function MobilityMap({overlays={},compact=false,...mapProps}) {
  const {mines=[],events=[],showMines=false,showSecurity=false,onMines,onSecurity,securityPeriod='',documentSignals=[]}=overlays;
  const visibleMines=showMines?mines:[],visibleEvents=showSecurity?events:[];
  const caption=[visibleMines.length?'IPIS: historical sites; visit dates vary.':'',visibleEvents.length?`ACLED: ${securityPeriod}.`:''].filter(Boolean).join(' ');
  return <>
    {!compact&&<div className={styles.controls} role="group" aria-label={`Overlays for ${mapProps.label}`} data-print-hide="true">
      <label><input type="checkbox" checked={showMines&&mines.length>0} disabled={!mines.length||!onMines} onChange={e=>onMines(e.target.checked)}/>IPIS mining sites{!mines.length?' — no eligible sites loaded':''}</label>
      <label><input type="checkbox" checked={showSecurity&&events.length>0} disabled={!events.length||!onSecurity} onChange={e=>onSecurity(e.target.checked)}/>ACLED security events{!events.length?' — no events in the selected window':''}</label>
      <small>Layer choices apply to all movement maps and the briefing. Load IPIS data or check the ACLED window in Data.</small>
    </div>}
    <OutbreakMap {...mapProps} documentSignals={documentSignals} mines={visibleMines} events={visibleEvents} overlayCaption={caption}/>
  </>;
}
