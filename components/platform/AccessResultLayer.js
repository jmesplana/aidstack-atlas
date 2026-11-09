import { useEffect, useMemo, useState } from 'react';
import { CircleMarker, LayerGroup, Pane, Polygon, Popup, useMap, useMapEvents } from 'react-leaflet';
import { svg } from 'leaflet';
import { accessHexagons } from '../../lib/geo/accessHexagons';
import { MAP_PANES } from '../../lib/geo/mapPanes';
import { formatTravelMinutes } from '../../lib/planning/displayAccess';

const colors = { covered: '#087f6a', unknown: '#64748b', 'beyond-threshold': '#d97706', mixed: '#475569' };
const labels = { covered: 'Within threshold', unknown: 'Unknown access', 'beyond-threshold': 'Beyond threshold', mixed: 'Mixed access' };
const format = value => value.toLocaleString(undefined, { maximumFractionDigits: 1 });
const SERVICE_PANE = 'accessServicePoints';

function ServicePoints({ result }) {
  // SVG only captures clicks on the markers themselves. A separate full-map
  // canvas above the hexagons would also intercept clicks in its empty space.
  const renderer = useMemo(() => svg({ pane: SERVICE_PANE }), []);
  const map = useMap();
  useEffect(() => () => { map.removeLayer(renderer); }, [map, renderer]);
  return [...result.existingSites.map(s => ({ ...s, candidate: false })), ...result.candidates.map(s => ({ ...s, candidate: true }))].map(s =>
    <CircleMarker key={`site:${s.id}`} center={[s.latitude, s.longitude]} radius={9} renderer={renderer}
      pathOptions={{ className: 'access-service-point', color: s.candidate ? '#7c3aed' : '#2563eb', fillOpacity: .25, weight: 3 }}>
      <Popup pane="popupPane"><strong>{s.name}</strong>{result.decision?.steps.some(step => step.id === s.id) && <p>Proposed site {result.decision.steps.find(step => step.id === s.id).order} in the complementary option · {result.decision.status === 'provisional' ? 'Evidence needs review' : 'Local review required'}</p>}<p>{s.candidate ? 'Candidate' : 'Existing service'} · {result.method === 'friction-surface-v1' ? (s.connected ? 'Travel surface available' : 'Travel surface unavailable') : (s.connected ? 'Connected to network' : 'No road connection')}</p></Popup>
    </CircleMarker>);
}

function PopulationHexagons({ result }) {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());
  const [view, setView] = useState(0), [openHex, setOpenHex] = useState(null);
  useMapEvents({ zoomend: () => { setZoom(map.getZoom()); setOpenHex(null); }, moveend: () => setView(v => v + 1) });
  const hexagons = useMemo(() => accessHexagons(result.settlements,
    row => map.project([row.latitude, row.longitude], zoom)).map(hex => ({
    ...hex, positions: hex.vertices.map(point => map.unproject([point.x, point.y], zoom)),
  })), [map, result.settlements, zoom]);
  const visible = useMemo(() => {
    const bounds = map.getPixelBounds();
    return hexagons.filter(({ center: p }) => p.x >= bounds.min.x - 24 && p.x <= bounds.max.x + 24 && p.y >= bounds.min.y - 24 && p.y <= bounds.max.y + 24);
  }, [map, hexagons, view]);

  return <>
    {visible.map(hex => <Polygon key={`${zoom}:${hex.key}`} positions={hex.positions}
      eventHandlers={{ popupopen: () => setOpenHex(hex.key), popupclose: () => setOpenHex(current => current === hex.key ? null : current) }}
      pathOptions={{ className: 'access-population-hexagon', color: '#fff7ed', weight: 1, fillColor: colors[hex.status], fillOpacity: .75 }}>
      <Popup pane="popupPane">{openHex === hex.key && <>
        <strong>{hex.rows.length === 1 ? hex.rows[0].name : `${hex.rows.length} population locations`}</strong>
        <p>{format(hex.population)} people · {labels[hex.status]} · {result.sources.populationDate}</p>
        {hex.rows.length > 1 && <ul>{Object.keys(hex.counts).map(status => <li key={status}>{labels[status]}: {format(hex.populations[status])} people ({hex.counts[status]} locations)</li>)}</ul>}
        <p>{hex.minMinutes == null ? 'Unknown travel time' : `${formatTravelMinutes(hex.minMinutes)}${hex.maxMinutes !== hex.minMinutes ? `–${formatTravelMinutes(hex.maxMinutes)}` : ''} modeled travel time`}{hex.minMinutes != null && hex.counts.unknown ? '; some travel times unknown' : ''}</p>
        <p>Hexagons group nearby population points at this zoom level. They show baseline access, not service catchment boundaries.</p>
      </>}</Popup>
    </Polygon>)}
    <div style={{ position: 'absolute', bottom: 24, left: 10, zIndex: MAP_PANES.legend, pointerEvents: 'none', background: 'rgba(255,255,255,.94)', borderRadius: 6, padding: '6px 9px', color: '#334155', fontSize: 11, maxWidth: 'calc(100% - 70px)' }} aria-label="Population hexagon legend">
      <strong>Population · baseline access</strong>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 10px' }}>{Object.entries(labels).map(([status, label]) => <span key={status}><span style={{ color: colors[status] }}>⬢</span> {label}</span>)}</div>
    </div>
  </>;
}

export default function AccessResultLayer({ result, fit = false, showPopulation = true }) {
  const map = useMap();
  useEffect(() => {
    if (fit && result?.settlements?.length) map.fitBounds(result.settlements.map((s) => [s.latitude, s.longitude]), { padding: [30, 30], maxZoom: 13 });
  }, [map, result, fit]);
  if (!result) return null;
  return <LayerGroup>
    {showPopulation && <PopulationHexagons result={result} />}
    <Pane name={SERVICE_PANE} style={{ zIndex: MAP_PANES.services }}><ServicePoints result={result} /></Pane>
  </LayerGroup>;
}
