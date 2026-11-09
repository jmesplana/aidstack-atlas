import area from '@turf/area';
import bbox from '@turf/bbox';
import bboxPolygon from '@turf/bbox-polygon';
import intersect from '@turf/intersect';
import { ACCESS_CELL_SIZES, accessScopeKey, accessRoadScopeKey, accessRoadBounds, validateAccessInputRequest } from './accessInputs.js';

const MAX_BATCHES = 128;
const feature = geometry => ({ type: 'Feature', properties: {}, geometry });

export function planAccessBatches(districts, requestedCellSize = 1000, year = 'latest') {
  const { totalArea } = validateAccessInputRequest({ districts, kind: 'population', cellSize: requestedCellSize, year }, { batch: false });
  // Leave room for boundary fragments within the 10,000-origin worker budget.
  const cellSize = ACCESS_CELL_SIZES.find(size => size >= requestedCellSize && totalArea / (size / 1000) ** 2 <= 4000) || 100000;
  const bounds = bbox({ type: 'FeatureCollection', features: districts.map(d => feature(d.geometry)) });
  const batches = [];
  if (bounds[2] - bounds[0] <= 5 && bounds[3] - bounds[1] <= 5 && area(bboxPolygon(bounds)) <= 1e10) {
    batches.push(districts.map(({ id, name, geometry }) => ({ id, name, geometry })));
  } else {
    // A shared lattice prevents overlaps between extraction tiles. Clip the
    // original geometry, retaining holes, multipart islands and original IDs.
    const step = .75;
    const tiles = new Map();
    for (const district of districts) {
      const polygons = district.geometry.type === 'MultiPolygon' ? district.geometry.coordinates : [district.geometry.coordinates];
      const keys = new Set();
      for (const coordinates of polygons) {
        const b = bbox({ type: 'Polygon', coordinates });
        const x0 = Math.floor(b[0] / step), x1 = Math.ceil(b[2] / step);
        const y0 = Math.floor(b[1] / step), y1 = Math.ceil(b[3] / step);
        if ((x1 - x0) * (y1 - y0) > 10000) throw new Error('This boundary spans too many extraction tiles. Split antimeridian-crossing polygons or model a regional selection.');
        for (let x = x0; x < x1; x++) for (let y = y0; y < y1; y++) keys.add(`${x}:${y}`);
      }
      for (const key of keys) {
        const [x, y] = key.split(':').map(Number);
        const clipped = intersect({ type: 'FeatureCollection', features: [feature(district.geometry), bboxPolygon([x * step, y * step, (x + 1) * step, (y + 1) * step])] });
        if (!clipped || area(clipped) <= 0) continue;
        if (!tiles.has(key)) tiles.set(key, []);
        tiles.get(key).push({ id: district.id, name: district.name, geometry: clipped.geometry });
        if (tiles.size > MAX_BATCHES) throw new Error(`This selection needs more than ${MAX_BATCHES} download batches. Model regional groups separately in this browser.`);
      }
    }
    batches.push(...tiles.values());
  }
  if (!batches.length) throw new Error('The selected boundaries contain no extractable area.');
  return { totalArea, cellSize, requestedCellSize, batches: batches.map(areas => ({ districts: areas, scopeKey: accessScopeKey(areas, cellSize, year) })) };
}

export function mergeAccessBatches(kind, parts, scopeKey, cellSize, requestedCellSize, { allowEmpty = false } = {}) {
  if (!parts.length) throw new Error('No complete download batches were returned.');
  const metadata = { ...parts[0].metadata, scopeKey, kind,
    // Expire the merged extract with its oldest contributing batch.
    timestamp: parts.map(p => p.metadata.timestamp).sort()[0],
    batches: parts.map(p => ({ scopeKey: p.metadata.scopeKey, timestamp: p.metadata.timestamp })) };
  if (kind === 'population') {
    if (parts.some(p => p.year !== parts[0].year || p.cellSize !== cellSize)) throw new Error('Population batches use different years or grid sizes. Reload the data.');
    const points = parts.flatMap((p, index) => p.points.map(row => ({ ...row, settlement_id: parts.length === 1 ? row.settlement_id : `batch${index}:${row.settlement_id}` })));
    if (points.length > 10000) throw new Error(`The selected areas contain ${points.length.toLocaleString()} populated cells. Choose a coarser population grid and reload.`);
    return { ...parts[0], points: points.map((row, i) => ({ ...row, settlement: `Population cell ${i + 1}` })), metadata, cellSize, requestedCellSize,
      missingCells: parts.reduce((sum, p) => sum + (p.missingCells || 0), 0), zeroCells: parts.reduce((sum, p) => sum + (p.zeroCells || 0), 0), totalPopulation: points.reduce((sum, p) => sum + p.population, 0) };
  }
  const roads = new Map(), sites = new Map();
  let segments = 0;
  for (const part of parts) {
    if (!part.routingReady) throw new Error('An incomplete road batch cannot be used for modeling.');
    for (const f of part.roads.features) {
      const key = f.id ?? JSON.stringify(f);
      if (roads.has(key)) {
        if (JSON.stringify(roads.get(key)) !== JSON.stringify(f)) throw new Error('OSM roads changed between batches. Reload the data before modeling.');
        continue;
      }
      segments += f.geometry.coordinates.length - 1;
      if (segments > 100000) throw new Error('The combined OSM network exceeds this browser model’s 100,000-segment capacity. Use regional groups; no roads have been dropped.');
      roads.set(key, f);
    }
    for (const site of part.sites) sites.set(site.id, site);
  }
  if (!roads.size && !allowEmpty) throw new Error('No OSM roads were found across the selected areas.');
  return { ...parts[0], metadata, routingReady: true, roads: { type: 'FeatureCollection', features: [...roads.values()] }, sites: [...sites.values()], segments,
    bounds: undefined, batchBounds: parts.map(p => p.bounds).filter(Boolean) };
}

// Split only a failed road request, retaining admin IDs and complete coverage.
export function splitAccessRoadBatch(batch, cellSize, year) {
  // Divide the actual buffered road query, not the admin polygon. Re-buffering
  // each child would keep tiny urban selections almost as large as the parent.
  const [west, south, east, north] = batch.roadBounds || accessRoadBounds(batch.districts);
  if (Math.max(east - west, north - south) < .005) return [];
  const boxes = east - west >= north - south
    ? [[west, south, (west + east) / 2, north], [(west + east) / 2, south, east, north]]
    : [[west, south, east, (south + north) / 2], [west, (south + north) / 2, east, north]];
  return boxes.map(roadBounds => ({ districts: batch.districts, roadBounds, scopeKey: accessRoadScopeKey(batch.districts, cellSize, year, roadBounds) }));
}
