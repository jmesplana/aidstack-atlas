import { useEffect, useState } from 'react';
import { useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import booleanIntersects from '@turf/boolean-intersects';
import { visibleBuildingTiles, buildingTileBounds, BUILDING_MIN_ZOOM } from '../../lib/osm/buildingTiles';
import { loadBuildingTile } from '../../lib/osm/loadBuildingTiles';
import { MAP_PANES } from '../../lib/geo/mapPanes';

export default function BuildingFootprints({ districts, enabled, onStatus, retry = 0 }) {
  const map = useMap(), [view, setView] = useState(0);
  useMapEvents({ moveend: () => setView(value => value + 1) });
  useEffect(() => {
    if (!enabled) return;
    if (!districts?.length) { onStatus({ message: 'Select an administrative area to load building outlines.' }); return; }
    if (map.getZoom() < BUILDING_MIN_ZOOM) { onStatus({ message: 'Zoom in to neighborhood level to load building outlines.' }); return; }
    const bounds = map.getBounds(), controller = new AbortController();
    const box = b => ({ type: 'Polygon', coordinates: [[[b[0],b[1]],[b[2],b[1]],[b[2],b[3]],[b[0],b[3]],[b[0],b[1]]]] });
    const tiles = visibleBuildingTiles([bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()]).filter(tile => districts.some(d => booleanIntersects(box(buildingTileBounds(tile)), d.geometry)));
    const element = map.getPane('buildingFootprints') || map.createPane('buildingFootprints');
    element.style.zIndex = String(MAP_PANES.buildings); element.style.pointerEvents = 'none';
    const renderer = L.canvas({ pane: 'buildingFootprints' });
    const layer = L.geoJSON([], { pane: 'buildingFootprints', renderer, interactive: false, style: { color: '#475569', weight: 1, fillColor: '#64748b', fillOpacity: .18 } }).addTo(map);
    const seen = new Set(); let next = 0, complete = 0, timestamp = null, failure = null;
    const run = async () => {
      while (next < tiles.length && !controller.signal.aborted) {
        const tile = tiles[next++];
        try {
          const data = await loadBuildingTile(tile, controller.signal);
          if (controller.signal.aborted) return;
          timestamp = timestamp == null || data.metadata.timestamp < timestamp ? data.metadata.timestamp : timestamp;
          const features = data.features.filter(f => !seen.has(f.id) && districts.some(d => booleanIntersects(f.geometry, d.geometry)));
          features.forEach(f => seen.add(f.id)); layer.addData(features); complete++;
        } catch (error) { if (controller.signal.aborted) return; failure = error.message; }
        onStatus({ message: `Loading building outlines: ${complete} of ${tiles.length} sections · ${seen.size.toLocaleString()} outlines`, timestamp });
      }
    };
    onStatus({ message: tiles.length ? 'Loading OpenStreetMap building outlines…' : 'No selected area is visible. Pan into the selected area.' });
    const timer = setTimeout(() => Promise.all([run(), run()]).then(() => {
      if (!controller.signal.aborted) onStatus({ message: failure ? `${failure} Showing ${seen.size.toLocaleString()} downloaded outlines.` : tiles.length ? `${seen.size.toLocaleString()} building ${seen.size === 1 ? 'outline' : 'outlines'} in the visible selected area. Mapping coverage varies.` : 'No selected area is visible. Pan into the selected area.', error: !!failure, timestamp });
    }), 250);
    return () => { clearTimeout(timer); controller.abort(); map.removeLayer(layer); map.removeLayer(renderer); };
  }, [map, districts, enabled, onStatus, retry, view]);
  return null;
}
