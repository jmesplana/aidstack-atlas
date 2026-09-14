import { useId } from 'react';
import { Layers, MapPin, ArrowUpRight, ChevronRight } from 'lucide-react';
import styles from './LandingAssessmentPreview.module.css';

// Intentionally fictional examples: these illustrate supported workflows, not live results.
export const EXAMPLE_SITES = [
  { id: 'A', name: 'Site A', type: 'Field location', status: 'CAUTION', reason: 'Hazard impact detected', action: 'Investigate local conditions', x: 43, y: 47 },
  { id: 'B', name: 'Site B', type: 'Warehouse', status: 'GO', reason: 'No current impacts detected', action: 'Confirm readiness with the team', x: 22, y: 30 },
  { id: 'C', name: 'Site C', type: 'Project site', status: 'DELAY', reason: 'Multiple hazard impacts', action: 'Review timing and alternatives', x: 69, y: 65 },
  { id: 'D', name: 'Site D', type: 'Facility', status: 'CAUTION', reason: 'Hazard impact detected', action: 'Review exposure before deployment', x: 30, y: 77 },
];

export function ExampleStatus({ status }) {
  return <span className={`${styles.status} ${styles[status.toLowerCase()]}`}>{status}</span>;
}

function ContextMap({ selectedId, onSelect }) {
  const gridId = useId();
  return <div className={styles.map}>
    <svg className={styles.geography} viewBox="0 0 800 500" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <pattern id={gridId} width="50" height="50" patternUnits="userSpaceOnUse"><path d="M50 0H0V50" fill="none" stroke="#fff" strokeOpacity=".45" /></pattern>
      </defs>
      <rect width="800" height="500" fill="#e8eddf" />
      <path d="M0 0H250L300 100 180 165 0 100Z M500 0H800V220L700 240 555 150Z M0 340L165 280 285 405 220 500H0Z M490 400L645 280 800 335V500H535Z" fill="#d7e0cd" />
      <g fill="none" stroke="#becdb4" opacity=".6">
        {[0, 18, 36, 54].map(n => <path key={n} d={`M${560+n} -30C${420+n} 80 ${780+n} 80 ${720+n} 210S${470+n} 330 ${650+n} 540 M${n-60} 220C${110+n} 140 ${180+n} 350 ${n+70} 500`} />)}
      </g>
      <path d="M385 -20C315 70 500 125 437 216S399 330 483 390 454 490 470 530" fill="none" stroke="#9ebfc6" strokeWidth="31" />
      <path d="M385 -20C315 70 500 125 437 216S399 330 483 390 454 490 470 530" fill="none" stroke="#b9d2d5" strokeWidth="23" />
      <path d="M-20 385L170 310 344 235 560 325 820 213M100 -20L176 150 344 235 240 385 230 520M344 235L600 92 820 140" fill="none" stroke="#faf9f0" strokeWidth="13" />
      <path d="M-20 385L170 310 344 235 560 325 820 213M100 -20L176 150 344 235 240 385 230 520M344 235L600 92 820 140" fill="none" stroke="#c5bfaa" strokeWidth="2" />
      <path d="M130 90L395 62 712 137 732 379 464 458 123 396Z" fill="#648879" fillOpacity=".025" stroke="#778e7e" strokeDasharray="8 6" strokeWidth="1.5" />
      <path d="M356 150L554 163 622 335 443 381 323 253Z" fill="#e7ac5c" fillOpacity=".28" stroke="#be8b48" strokeDasharray="5 5" />
      <rect width="800" height="500" fill={`url(#${gridId})`} />
    </svg>
    <div className={styles.mapLabel}><Layers size={13} aria-hidden="true" /> Operational area <span>/ illustrative</span></div>
    <div className={styles.compass} aria-hidden="true">N<span>↑</span></div>
    {EXAMPLE_SITES.map(site => <button key={site.id} type="button" className={`${styles.marker} ${selectedId === site.id ? styles.selectedMarker : ''}`} style={{ left: `${site.x}%`, top: `${site.y}%` }} onClick={() => onSelect(site.id)} aria-label={`Select ${site.name} on map`} aria-pressed={selectedId === site.id}>
      <span className={styles.pin}><MapPin size={17} aria-hidden="true" /></span><span className={styles.markerName}>{site.name}</span>
    </button>)}
    <div className={styles.legend}><span><i className={styles.siteKey} />Your sites</span><span><i className={styles.hazardKey} />Hazard context</span><span><i className={styles.boundaryKey} />Boundary</span></div>
    <span className={styles.mapFooter}>Schematic geography · Roads & infrastructure context</span>
  </div>;
}

export default function LandingAssessmentPreview({ selectedId = 'A', onSelect, portfolio = false }) {
  const site = EXAMPLE_SITES.find(item => item.id === selectedId) || EXAMPLE_SITES[0];
  return <figure className={`${styles.preview} ${portfolio ? styles.portfolio : ''}`} aria-label={portfolio ? 'Interactive illustrative portfolio' : 'Interactive illustrative workspace'}>
    <div className={styles.toolbar}><span className={styles.workspaceName}><span className={styles.appMark}>a</span> Atlas <span className={styles.slash}>/</span> {portfolio ? 'Portfolio review' : 'Your operational workspace'}</span><span className={styles.demoLabel}>Illustrative demo</span></div>
    <div className={styles.body}>
      {portfolio && <div className={styles.locationList}>
        <div className={styles.listHeading}><span>Your locations</span><small>Select a site to locate it →</small></div>
        {EXAMPLE_SITES.map(item => <button type="button" key={item.id} onClick={() => onSelect(item.id)} aria-pressed={selectedId === item.id} className={`${styles.siteRow} ${selectedId === item.id ? styles.selectedRow : ''}`}>
          <span className={styles.rowTitle}>{item.name}<ExampleStatus status={item.status} /></span><span className={styles.rowReason}>{item.reason}<ChevronRight size={14} aria-hidden="true" /></span>
        </button>)}
        <p className={styles.listNote}>Illustrative impact-based batch results. No detected impact does not establish safety.</p>
      </div>}
      <ContextMap selectedId={selectedId} onSelect={onSelect} />
      {!portfolio && <div className={styles.assessment} aria-live="polite" aria-atomic="true">
        <div className={styles.panelEyebrow}><MapPin size={12} aria-hidden="true" /> Selected location</div>
        <div className={styles.siteTitle}><h3>{site.name}</h3><span>{site.type}</span></div>
        <div className={styles.assessmentHeading}>Operation Viability <span>Experimental</span></div>
        <ExampleStatus status={site.status} />
        <h4>{site.reason}</h4><p>{site.action}. Review current field information before acting.</p>
        <div className={styles.contextRows}><div><span>Hazard context</span><strong>Review exposure</strong></div><div><span>Security & access</span><strong>Check coverage</strong></div><div><span>Source dates</span><strong>Verify recency</strong></div></div>
        <a href="#evidence" className={styles.evidenceLink}>Understand the evidence <ArrowUpRight size={15} aria-hidden="true" /></a>
      </div>}
    </div>
    <figcaption><span className={styles.captionDot} />{portfolio ? 'Select a row or map marker to explore the same example locations.' : 'Try selecting a location on the map.'} <span>Fictional sites and conditions; no live assessment.</span></figcaption>
  </figure>;
}
