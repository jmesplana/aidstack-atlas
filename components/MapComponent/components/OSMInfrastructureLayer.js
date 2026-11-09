import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { infrastructurePopup } from '../../../lib/osm/popup';
import { MAP_PANES } from '../../../lib/geo/mapPanes';

const symbols = { hospital: '🏥', clinic: '⚕️', school: '🏫', water: '💧', power: '⚡', fuel: '⛽', pharmacy: '💊', airport: '✈️', road: '🛣️', bridge: '🌉' };
const facilities = new Set(['hospital', 'clinic', 'school', 'water', 'power', 'fuel', 'pharmacy', 'airport']);
const pane = 'osmInfrastructurePane';

export default function OSMInfrastructureLayer({ osmData, layerVisibility = {}, showOSMLayer, showClusterCounts = true }) {
  const map = useMap(), groups = useRef(new Map()), counts = useRef(showClusterCounts), renderer = useRef(null);
  counts.current = showClusterCounts;
  useEffect(() => {
    const element = map.getPane(pane) || map.createPane(pane);
    element.style.zIndex = String(MAP_PANES.infrastructure);
    renderer.current = L.svg({ pane });
    return () => {
      for (const group of groups.current.values()) { map.removeLayer(group.markers); map.removeLayer(group.shapes); }
      groups.current.clear();
      map.removeLayer(renderer.current);
    };
  }, [map]);

  useEffect(() => {
    function groupFor(category) {
      if (!groups.current.has(category)) {
        const markers = L.markerClusterGroup({
          chunkedLoading: true, chunkInterval: 30, chunkDelay: 20,
          spiderfyOnMaxZoom: true, showCoverageOnHover: false, maxClusterRadius: 40,
          iconCreateFunction(cluster) {
            const icon = document.createElement('div'), size = counts.current ? 34 : 14;
            icon.textContent = counts.current ? String(cluster.getChildCount()) : '';
            Object.assign(icon.style, { background: '#2563eb', width: `${size}px`, height: `${size}px`, display: 'grid', placeItems: 'center', borderRadius: '50%', color: 'white', border: '2px solid white', fontWeight: 'bold' });
            return L.divIcon({ html: icon, className: 'osm-cluster', iconSize: [size, size] });
          },
        });
        groups.current.set(category, { markers, shapes: L.layerGroup(), records: new Map() });
      }
      return groups.current.get(category);
    }
    const wanted = new Map(), additions = new Map();
    for (const feature of osmData?.features || []) {
      if (!feature.geometry) continue;
      const category = Object.hasOwn(symbols, feature.properties?.category) ? feature.properties.category : 'other';
      const group = groupFor(category), signature = JSON.stringify(feature);
      const id = String(feature.id ?? `${feature.properties?.osmType}/${feature.properties?.osmId ?? signature}`);
      if (!wanted.has(category)) wanted.set(category, new Set());
      wanted.get(category).add(id);
      const prior = group.records.get(id);
      if (prior?.signature === signature) continue;
      if (prior) { group.markers.removeLayers(prior.markers); prior.shapes.forEach(shape => group.shapes.removeLayer(shape)); }
      const rawColor = feature.properties?.color;
      const color = /^#[0-9a-f]{3,8}$/i.test(rawColor || '') ? rawColor : '#2563eb';
      const record = { signature, markers: [], shapes: [] };
      const bind = layer => layer.bindPopup(() => infrastructurePopup(feature), { pane: 'popupPane' });
      const addMarker = (latlng, isArea = false) => {
        const icon = document.createElement('div'), size = isArea ? 28 : 32;
        icon.textContent = symbols[category] || '📍';
        Object.assign(icon.style, { width: `${size}px`, height: `${size}px`, backgroundColor: color, borderRadius: '50%', border: '2px solid white', display: 'grid', placeItems: 'center', fontSize: '16px' });
        const marker = bind(L.marker(latlng, { icon: L.divIcon({ html: icon, className: `osm-marker osm-${category}${isArea ? ' osm-area-marker' : ''}`, iconSize: [size, size], iconAnchor: [size / 2, size / 2], popupAnchor: [0, -size / 2] }) }));
        record.markers.push(marker);
      };
      if (feature.geometry.type === 'Point') {
        const [lng, lat] = feature.geometry.coordinates;
        if (Number.isFinite(lng) && Number.isFinite(lat)) addMarker([lat, lng]);
      } else {
        const polygon = /Polygon/.test(feature.geometry.type);
        const layer = L.geoJSON(feature, { pane, renderer: renderer.current, style: { color, fillColor: color, weight: polygon ? 1.5 : 4, opacity: polygon ? .4 : .8, fillOpacity: .1, className: `osm-${polygon ? 'polygon' : 'line'} osm-${category}` } });
        layer.eachLayer(bind); group.shapes.addLayer(layer); record.shapes.push(layer);
        if (polygon && facilities.has(category) && layer.getBounds().isValid()) addMarker(layer.getBounds().getCenter(), true);
      }
      group.records.set(id, record);
      if (!additions.has(category)) additions.set(category, []);
      additions.get(category).push(...record.markers);
    }
    for (const [category, group] of groups.current) {
      for (const [id, record] of group.records) if (!wanted.get(category)?.has(id)) {
        group.markers.removeLayers(record.markers); record.shapes.forEach(shape => group.shapes.removeLayer(shape)); group.records.delete(id);
      }
      if (additions.get(category)?.length) group.markers.addLayers(additions.get(category));
    }
  }, [map, osmData]);

  useEffect(() => {
    for (const [category, group] of groups.current) {
      for (const layer of [group.markers, group.shapes]) {
        if (showOSMLayer && layerVisibility[category] !== false) { if (!map.hasLayer(layer)) map.addLayer(layer); }
        else if (map.hasLayer(layer)) map.removeLayer(layer);
      }
      group.markers.refreshClusters();
    }
  }, [map, osmData, showOSMLayer, layerVisibility, showClusterCounts]);
  return null;
}
