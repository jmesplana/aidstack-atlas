import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
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
  }, [map, result]);
  return null;
}
function Buildings({ districts }) {
  const [enabled, setEnabled] = useState(false), [status, setStatus] = useState(null), [retry, setRetry] = useState(0);
  const control = useRef(null);
  useEffect(() => { if (control.current) { L.DomEvent.disableClickPropagation(control.current); L.DomEvent.disableScrollPropagation(control.current); } }, []);
  return <><BuildingFootprints districts={districts} enabled={enabled} onStatus={setStatus} retry={retry} />
    <div ref={control} style={{ position: 'absolute', right: 10, top: 10, zIndex: 800, maxWidth: 'min(260px, calc(100% - 65px))', padding: 8, background: 'rgba(255,255,255,.96)', borderRadius: 6 }}>
      <BuildingFootprintToggle enabled={enabled} onChange={setEnabled} status={status} onRetry={() => setRetry(v => v + 1)} />
    </div></>;
}
export default function AccessMap({ result, districts }) {
  return <MapContainer center={[0, 0]} zoom={2} style={{ height: '100%', width: '100%' }} preferCanvas>
    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />
    <GeoJSON key={result.scope.geographyKey} data={{ type: 'FeatureCollection', features: districts.map((d) => ({ type: 'Feature', properties: {}, geometry: d.geometry })) }} style={{ color: '#94a3b8', weight: 1, fillOpacity: 0.04 }} />
    <Buildings districts={districts} />
    <AccessResultLayer result={result} /><Fit result={result} />
  </MapContainer>;
}
