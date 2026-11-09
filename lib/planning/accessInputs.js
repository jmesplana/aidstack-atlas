import { accessCohort } from '../worldpop/accessCohorts.js';
import area from '@turf/area';
import bbox from '@turf/bbox';
import intersect from '@turf/intersect';
import { assertArray, assertEnum } from '../validation/apiValidation.js';
import { isPointInGeometry } from '../geo/geometry.js';
import { fingerprint } from './geography.js';

export const MAX_DEMAND_CELLS = 5000;
export const ACCESS_CELL_SIZES = [500, 1000, 2000, 5000, 10000, 20000, 50000, 100000];
export function accessScopeKey(districts, cellSize = 1000, year = 'latest', cohort = {}) {
  const population = accessCohort(cohort);
  return fingerprint({ areas: districts.map((d) => [String(d.id), d.geometry]).sort(([a], [b]) => a.localeCompare(b)), cellSize, year, ...(population.dataType === 'agesex' ? { cohort: [population.age, population.sex] } : {}) });
}
export function validateAccessInputRequest(body = {}, { batch = true } = {}) {
  const { districts, kind, cellSize = 1000, year = 'latest' } = body;
  assertArray(districts, 'districts', 30); assertEnum(kind, 'kind', ['population', 'roads']);
  assertEnum(cellSize, 'cellSize', ACCESS_CELL_SIZES);
  if (!['latest', 'current'].includes(year) && (!Number.isInteger(Number(year)) || Number(year) < 2015 || Number(year) > 2030)) throw new Error('Invalid population year.');
  if (!districts.length) throw new Error('Select an operational area.');
  const ids = new Set();
  let totalArea = 0;
  for (const d of districts) {
    if (d.id == null || ids.has(String(d.id)) || !['Polygon', 'MultiPolygon'].includes(d.geometry?.type)) throw new Error('Use distinct administrative areas with valid polygons.');
    ids.add(String(d.id));
    if (JSON.stringify(d.geometry).length > 400000) throw new Error('Boundary is too detailed for this request.');
    const visit = (coords) => { if (!Array.isArray(coords)) throw new Error('Invalid boundary coordinates.'); if (typeof coords[0] === 'number') { if (coords.length < 2 || !Number.isFinite(coords[0]) || !Number.isFinite(coords[1]) || Math.abs(coords[0]) > 180 || Math.abs(coords[1]) > 85) throw new Error('Invalid boundary coordinates.'); } else coords.forEach(visit); };
    visit(d.geometry.coordinates);
    const km2 = area(d.geometry) / 1e6;
    if (!Number.isFinite(km2) || km2 <= 0) throw new Error('Invalid boundary area.');
    totalArea += km2;
  }
  if (batch && totalArea > 10000) throw new Error('This download batch is too large. Reload the selected areas to split it into smaller batches.');
  for (let i = 0; i < districts.length; i++) for (let j = i + 1; j < districts.length; j++) {
    const overlap = intersect({ type: 'FeatureCollection', features: [districts[i], districts[j]].map((d) => ({ type: 'Feature', properties: {}, geometry: d.geometry })) });
    if (overlap && area(overlap) > 1) throw new Error('Selected boundaries overlap. Use one administrative level to avoid counting population twice.');
  }
  return { districts, kind, cellSize, year, totalArea, cohort: accessCohort(body.cohort) };
}

export function accessRoadBounds(districts, bufferKm = 5) {
  const [west, south, east, north] = bbox({ type: 'FeatureCollection', features: districts.map((d) => ({ type: 'Feature', properties: {}, geometry: d.geometry })) });
  if (east - west > 5 || north - south > 5) throw new Error('Selected areas are too dispersed. Model nearby areas together.');
  const latBuffer = bufferKm / 111.32, lonBuffer = latBuffer / Math.max(.1, Math.cos((south + north) / 2 * Math.PI / 180));
  return [Math.max(-180, west - lonBuffer), Math.max(-85, south - latBuffer), Math.min(180, east + lonBuffer), Math.min(85, north + latBuffer)];
}
export function buildAccessOverpassQuery(bounds, timeoutSeconds = 45) {
  if (!Array.isArray(bounds) || bounds.length !== 4 || !bounds.every(Number.isFinite)) throw new Error('Invalid road bounds.');
  const [west, south, east, north] = bounds;
  const box = `${south},${west},${north},${east}`;
  // Full way geometry and node IDs: no display-layer truncation or simplification.
  return `[out:json][timeout:${timeoutSeconds}];(way["highway"](${box});nwr["amenity"~"^(hospital|clinic|health_post|health_centre|health_center|doctors|vaccination_centre)$"](${box});nwr["healthcare"~"^(hospital|clinic|health_post|health_centre|health_center|doctors|vaccination_centre)$"](${box}););out body geom;`;
}
export function parseAccessOverpass(data, { allowEmpty = false, includeRoads = true } = {}) {
  if (!Array.isArray(data?.elements) || data.remark) throw new Error('OSM did not return a complete network.');
  const features = [], sites = [], seen = new Set(); let segments = 0;
  for (const el of data.elements) {
    const id = `${el.type}/${el.id}`;
    if (seen.has(id)) continue; seen.add(id);
    if (includeRoads && el.type === 'way' && el.tags?.highway) {
      if (!Array.isArray(el.geometry) || el.geometry.length < 2 || !Array.isArray(el.nodes) || el.nodes.length !== el.geometry.length || el.geometry.some((p) => !Number.isFinite(p?.lon) || !Number.isFinite(p?.lat))) throw new Error('OSM returned incomplete road geometry.');
      segments += el.geometry.length - 1;
      if (segments > 100000) throw new Error('OSM network exceeds 100,000 segments. Select a smaller area.');
      features.push({ type: 'Feature', id, properties: { category: 'road', tags: el.tags, nodeIds: el.nodes }, geometry: { type: 'LineString', coordinates: el.geometry.map((p) => [p.lon, p.lat]) } });
    }
    if (['hospital', 'clinic', 'health_post', 'health_centre', 'health_center', 'doctors', 'vaccination_centre'].includes(el.tags?.amenity) || ['hospital', 'clinic', 'health_post', 'health_centre', 'health_center', 'doctors', 'vaccination_centre'].includes(el.tags?.healthcare)) {
      // A mapped geometry vertex is a representative site point, not a verified entrance.
      const p = el.type === 'node' ? el : el.center || el.geometry?.[0] || el.members?.find((m) => m.geometry?.length)?.geometry?.[0];
      if (Number.isFinite(p?.lat) && Number.isFinite(p?.lon)) sites.push({ id: `osm:${id}`, name: el.tags?.name || `Mapped ${el.tags?.healthcare || el.tags?.amenity} (${el.id})`, latitude: p.lat, longitude: p.lon, role: 'existing', source: 'OpenStreetMap', locationType: el.type === 'node' ? 'mapped-point' : 'geometry-representative' });
    }
  }
  if (!features.length && !allowEmpty) throw new Error('No OSM road geometry was returned for this area.');
  return { roads: { type: 'FeatureCollection', features }, sites, segments };
}

export function populationCellsToPoints(features, districts, year) {
  if (!Array.isArray(features) || features.length > MAX_DEMAND_CELLS) throw new Error('Too many population cells. Choose a coarser grid or smaller area.');
  const points = []; let missingCells = 0, zeroCells = 0;
  for (let i = 0; i < features.length; i++) {
    const f = features[i], count = f.properties?.sum;
    if (count == null) { missingCells++; continue; }
    if (!Number.isFinite(count) || count < 0) throw new Error('Invalid WorldPop cell count.');
    if (count === 0) { zeroCells++; continue; }
    const d = districts.find((d) => String(d.id) === String(f.properties.areaId));
    if (!d) throw new Error('Population cell does not match the requested geography.');
    let p = f.properties.point;
    if (!Array.isArray(p) || !isPointInGeometry(p, d.geometry) || (f.geometry && !isPointInGeometry(p, f.geometry))) {
      const rings = f.geometry?.type === 'MultiPolygon' ? f.geometry.coordinates.flat() : f.geometry?.coordinates || [];
      p = rings.flat().find((c) => Array.isArray(c) && isPointInGeometry(c, d.geometry));
    }
    if (!p) throw new Error('Population cell could not be placed within its administrative area.');
    points.push({ settlement_id: `worldpop:${year}:${d.id}:${f.id ?? i}`, settlement: `Population cell ${i + 1}`, latitude: p[1], longitude: p[0], population: count, area_id: String(d.id), demandType: 'worldpop-cell', ...(f.geometry ? { populationGeometry: f.geometry } : {}) });
  }
  return { points, missingCells, zeroCells, totalPopulation: points.reduce((sum, p) => sum + p.population, 0) };
}

export function accessRoadScopeKey(districts, cellSize, year, roadBounds = null, group = null) {
  return accessScopeKey(districts, cellSize, year) + (roadBounds ? `:bounds:${fingerprint(roadBounds)}` : '') + (group ? `:${group}` : '');
}
export function validateAccessRoadBounds(districts, requestedBounds) {
  const full = accessRoadBounds(districts);
  if (requestedBounds == null) return full;
  const b = requestedBounds;
  if (!Array.isArray(b) || b.length !== 4 || !b.every(Number.isFinite) || b[0] >= b[2] || b[1] >= b[3] ||
      b[0] < full[0] - 1e-9 || b[1] < full[1] - 1e-9 || b[2] > full[2] + 1e-9 || b[3] > full[3] + 1e-9) throw new Error('Road download bounds must remain within the selected administrative area’s buffered extent.');
  return b;
}
