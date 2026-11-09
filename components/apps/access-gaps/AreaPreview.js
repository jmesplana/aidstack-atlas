import { useEffect } from 'react';
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
function Fit({ data }) {
  const map = useMap();
  useEffect(() => { if (data.features.length) map.fitBounds(L.geoJSON(data).getBounds(), { padding: [20, 20], maxZoom: 12 }); }, [map, data]);
  return null;
}
export default function AreaPreview({ areas }) {
  const data = { type: 'FeatureCollection', features: areas.map(area => ({ type: 'Feature', properties: {}, geometry: area.geometry })) };
  return <MapContainer center={[0, 0]} zoom={2} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />
    <GeoJSON key={areas.map(area => area.id).join(':')} data={data} style={{ color: '#087f6a', weight: 2, fillOpacity: .15 }} /><Fit data={data} />
  </MapContainer>;
}
