import { useEffect, useRef, useState } from 'react';
import ux from './AccessGaps.module.css';
import styles from '../../platform/Planning.module.css';
import { accessMapView } from '../../../lib/planning/accessMapView';
import { useMemo } from 'react';
import usePopulationOverlay from './usePopulationOverlay';
import BuildingFootprints from '../../platform/BuildingFootprints';
import BuildingFootprintToggle from '../../platform/BuildingFootprintToggle';
import { MapContainer, TileLayer, useMap, GeoJSON } from 'react-leaflet';
import AccessResultLayer from '../../platform/AccessResultLayer';
import 'leaflet/dist/leaflet.css';

function Fit({ result }) {
  const map = useMap();
  useEffect(() => {
    const points = [...result.settlements, ...result.existingSites, ...result.candidates];
    if (points.length) map.fitBounds(points.map((p) => [p.latitude, p.longitude]), { padding: [24, 24], maxZoom: 13 });
  }, [map, result.computedAt]);
  return null;
}
function ResizeMap() {
  const map = useMap();
  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize({ pan: false }));
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  return null;
}
export default function AccessMap({ result, districts, viewMode = 'baseline', focusedSiteId, onSiteSelect, onPopulationSelect }) {
  const [buildingsEnabled, setBuildingsEnabled] = useState(false), [buildingStatus, setBuildingStatus] = useState(null), [buildingRetry, setBuildingRetry] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [showWorldPop, setShowWorldPop] = useState(false), [showAccess, setShowAccess] = useState(true);
  const displayed = useMemo(() => accessMapView(result, viewMode), [result, viewMode]);
  const population = usePopulationOverlay(result, districts, showWorldPop);
  const [opacity, setOpacity] = useState(.65);
  const frame = useRef(null), toggle = useRef(null);
  function resize(next) {
    setExpanded(next);
    requestAnimationFrame(() => { frame.current?.scrollIntoView({ block: 'start' }); toggle.current?.focus({ preventScroll: true }); });
  }
  return <div ref={frame} className={`${ux.mapFrame} ${expanded ? ux.mapExpanded : ''}`} onKeyDown={event => {
    if (expanded && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); resize(false); }
  }}>
    <div className={ux.mapToolbar}><strong>Map · {displayed.viewLabel.toLowerCase()}</strong><button ref={toggle} type="button" aria-expanded={expanded} onClick={() => resize(!expanded)}>{expanded ? 'Restore map size' : 'Expand map'}</button></div>
    <div className={ux.mapLayers} aria-label="Access map layers">
      <label><input type="checkbox" checked={showWorldPop} disabled={!population.available} onChange={event => setShowWorldPop(event.target.checked)} />WorldPop population</label>
      <label><input type="checkbox" checked={showAccess} onChange={event => setShowAccess(event.target.checked)} />Access hexagons</label>
      <BuildingFootprintToggle compact enabled={buildingsEnabled} onChange={setBuildingsEnabled} status={buildingStatus} onRetry={() => setBuildingRetry(value => value + 1)} />
      <span>Blue: existing services · Purple: candidate locations</span>
      {!population.available && <small>WorldPop overlay requires an assessment loaded from Atlas population data.</small>}
      {showWorldPop && <>
        <label>Population opacity<input type="range" min="0.1" max="1" step="0.05" value={opacity} onChange={event => setOpacity(Number(event.target.value))} /></label>
        <div className={ux.populationLegend} aria-label="WorldPop population legend">
          <strong>{population.year} · {population.cohort.label}</strong>
          <span className={ux.populationRamp} style={{ background: `linear-gradient(to right, ${(population.data?.visParams?.palette || ['#ffffcc', '#fed976', '#fd8d3c', '#e31a1c', '#800026']).join(',')})` }} />
          <span>0 → {population.data?.visParams?.max || 100}+ people per ~100 m source pixel</span>
          <small>Population distribution within the selected areas. Access calculations use {result.populationCoverage.cellSize ? `the ${result.populationCoverage.cellSize / 1000} km analysis grid` : 'the assessment population grid'}. Turn off access hexagons for a clear population view.</small>
        </div>
        {population.status && <div className={ux.populationStatus} role={population.status.error ? 'alert' : 'status'} aria-label="WorldPop overlay status">
          {population.status.loading && <span className={styles.loadingSpinner} aria-hidden="true" />}
          <span>{population.status.message}</span>
          {population.status.error && <button type="button" onClick={population.retry}>Retry population overlay</button>}
        </div>}
      </>}
    </div>
    <div className={ux.mapCanvas}>
    <MapContainer center={[0, 0]} zoom={2} style={{ height: '100%', width: '100%' }} preferCanvas>
    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />
    {population.data && <TileLayer key={population.data.created} url={population.data.tileUrl} opacity={opacity} zIndex={250} className="access-worldpop-tiles" eventHandlers={population.events} attribution='&copy; WorldPop via Google Earth Engine' />}
    <GeoJSON key={result.scope.geographyKey} data={{ type: 'FeatureCollection', features: districts.map((d) => ({ type: 'Feature', properties: {}, geometry: d.geometry })) }} style={{ color: '#94a3b8', weight: 1, fillOpacity: 0.04 }} />
    <BuildingFootprints districts={districts} enabled={buildingsEnabled} onStatus={setBuildingStatus} retry={buildingRetry} />
    <AccessResultLayer result={displayed} showPopulation={showAccess} focusedSiteId={focusedSiteId} onSiteSelect={onSiteSelect} onPopulationSelect={onPopulationSelect} /><Fit result={result} /><ResizeMap />
  </MapContainer></div></div>;
}
