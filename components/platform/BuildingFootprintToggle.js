export default function BuildingFootprintToggle({ enabled, onChange, status, onRetry }) {
  return <section aria-label="Building footprints" style={{ fontSize: 12 }}>
    <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={enabled} onChange={event => onChange(event.target.checked)} />Building footprints</label>
    <p style={{ margin: '6px 0', color: '#475569' }}>{enabled ? status?.message || 'Zoom in to neighborhood level to load outlines.' : 'OpenStreetMap outlines load automatically when enabled and zoomed in.'}</p>
    {enabled && status?.error && <button onClick={onRetry}>Retry building footprints</button>}
    {enabled && <details><summary>Source and coverage</summary><p>© OpenStreetMap contributors · ODbL. Mapped building outlines only; coverage varies. Complex building relations and occupancy are not included.{status?.timestamp && ` Data timestamp: ${new Date(status.timestamp).toLocaleDateString()}.`}</p></details>}
  </section>;
}
