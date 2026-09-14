import styles from './LandingPage.module.css';

export default function LandingAssessmentPreview() {
  return <figure className={styles.preview} aria-label="Illustrative workspace with uploaded sites, contextual layers and a selected site assessment">
    <div className={styles.previewBar}><span>Aidstack Disasters / Workspace</span><span className={styles.previewLabel}>Illustrative</span></div>
    <div className={styles.previewBody}>
      <div className={styles.map}>
        <svg viewBox="0 0 440 410" role="img" aria-label="Schematic map showing four uploaded sites, an operational boundary, roads and hazard context">
          <rect width="440" height="410" fill="#e8eee8" />
          <path d="M0 90L140 20 240 70 440 15V180L290 210 170 150 0 220Z M0 320L130 260 250 330 440 280V410H0Z" fill="#d5e2d4" />
          <path d="M280 -20C170 90 345 120 230 235S270 320 200 440" fill="none" stroke="#a5ccdb" strokeWidth="28" />
          <path d="M-20 280L160 195 300 260 470 145M85 -10L160 195 90 430M160 195L340 70 450 85" fill="none" stroke="#fff" strokeWidth="9" />
          <path d="M-20 280L160 195 300 260 470 145M85 -10L160 195 90 430M160 195L340 70 450 85" fill="none" stroke="#c1bdac" strokeWidth="2" />
          <path d="M56 74L203 46 368 115 390 305 229 369 48 300Z" fill="#1a365d" fillOpacity=".04" stroke="#58718b" strokeWidth="2" strokeDasharray="7 5" />
          <path d="M218 118L317 136 350 277 242 295 186 230Z" fill="#eaa957" fillOpacity=".38" stroke="#c18331" strokeDasharray="4 4" />
          {[[160,195,'A'],[96,115,'B'],[290,260,'C'],[113,308,'D']].map(([x,y,label]) => <g key={label}>
            {label === 'A' && <circle cx={x} cy={y} r="23" fill="#ff6b35" fillOpacity=".18" />}
            <circle cx={x} cy={y} r="12" fill={label === 'A' ? '#b5431a' : '#1a365d'} stroke="white" strokeWidth="3" />
            <text x={x+18} y={y-14} fill="#223b4c" fontSize="13" fontWeight="600">Site {label}</text>
          </g>)}
        </svg>
        <div className={styles.mapLayers}>Your sites · Boundaries<br />Roads · Hazard context</div>
      </div>
      <div className={styles.assessment}>
        <span className={styles.eyebrow}>Selected location</span><h3>Site A</h3>
        <p className={styles.small}>Operation Viability <span className={styles.experimental}>Experimental</span></p>
        <span className={styles.caution}>CAUTION</span>
        <h4>Conditions to review</h4>
        <ul><li>Nearby hazard exposure</li><li>Security context</li><li>Access and infrastructure</li></ul>
        <div className={styles.evidenceNote}><strong>Evidence check</strong><p>Review available layers and reporting dates. Missing context needs follow-up.</p></div>
        <a href="#evidence">About the evidence <span aria-hidden="true">↗</span></a>
      </div>
    </div>
    <figcaption>Schematic of existing map and assessment workflows. Sites and conditions are illustrative, not a live assessment.</figcaption>
  </figure>;
}
