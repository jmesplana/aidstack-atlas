import client from './client.cjs';
import { SURFACE_SOURCE, HEALTHSITES_SOURCE } from '../planning/surfaceAccess.js';
import { accessRoadBounds } from '../planning/accessInputs.js';

export async function fetchSurfaceFacilities(districts) {
  const ee = await client.earthEngine();
  const region = ee.Geometry.Rectangle(accessRoadBounds(districts), 'EPSG:4326', false);
  const types = ['hospital', 'clinic', 'health_post', 'health_centre', 'health_center', 'doctors', 'vaccination_centre'];
  const filter = ee.Filter.or(ee.Filter.inList('amenity', types), ee.Filter.inList('healthcare', types));
  let features = ee.FeatureCollection([]);
  for (const [i, id] of HEALTHSITES_SOURCE.assets.entries()) {
    const part = ee.FeatureCollection(id).filterBounds(region).filter(filter).map(f => ee.Feature(f.geometry().centroid(1), {
      osmId: f.get('osm_id'), osmType: i === 0 ? 'node' : 'way', name: f.get('name'), type: f.get('amenity'), observed: f.get('changeset_2'),
    }));
    features = features.merge(part);
  }
  const data = await client.info(features.limit(2001));
  if (data.features.length > 2000) throw new Error('This facility extraction contains more than 2,000 sites. Use smaller internal download sections.');
  const sites = data.features.map(f => {
    const p = f.properties, [longitude,latitude] = f.geometry.coordinates;
    return { id: `osm:${p.osmType}/${p.osmId}`, name: p.name || `Mapped ${p.type || 'health facility'} (${p.osmId})`, longitude, latitude, role: 'existing', source: HEALTHSITES_SOURCE.name, observed: p.observed || null, locationType: p.osmType === 'node' ? 'mapped-point' : 'geometry-representative' };
  });
  return { sites, source: HEALTHSITES_SOURCE, metadata: { timestamp: new Date().toISOString() } };
}

export async function fetchSurfaceTimes({ origins, sites, mode }) {
  if (!sites.length) return { times: origins.map(() => null), connectedSites: [], source: SURFACE_SOURCE };
  const ee = await client.earthEngine();
  const friction = ee.Image(mode === 'walking' ? SURFACE_SOURCE.walkingAsset : SURFACE_SOURCE.asset).select('friction');
  const projection = friction.projection();
  const points = rows => ee.FeatureCollection(rows.map((p,index) => ee.Feature(ee.Geometry.Point(p), { index })));
  const destinations = points(sites), population = points(origins);
  const sources = ee.Image(0).byte().paint(destinations, 1).reproject(projection).selfMask();
  const cost = friction.updateMask(friction.gt(0)).cumulativeCost({ source: sources, maxDistance: SURFACE_SOURCE.maxDistanceM, geodeticDistance: true }).rename('minutes');
  // Nested FeatureCollections in a Dictionary serialize as descriptors, not
  // their rows. Materialize indexed property lists, retaining masked samples.
  const rows = (collection, count) => collection.toList(count).map(item => {
    const feature = ee.Feature(item);
    return ee.Dictionary({ index: feature.get('index'), first: feature.get('first') });
  });
  const values = await client.info(ee.Dictionary({
    origins: rows(cost.reduceRegions({ collection: population, reducer: ee.Reducer.first(), crs: projection, tileScale: 4 }),origins.length),
    sites: rows(friction.reduceRegions({ collection: destinations, reducer: ee.Reducer.first(), crs: projection, tileScale: 4 }),sites.length),
  }));
  const ordered = (collection, count) => {
    if (!Array.isArray(collection) || collection.length !== count) throw new Error('Earth Engine returned an incomplete travel estimate.');
    const rows = [...collection].sort((a,b) => a.index - b.index);
    if (rows.some((f,i) => f.index !== i)) throw new Error('Earth Engine returned mismatched population cells.');
    return rows.map(f => f.first ?? null);
  };
  return { times: ordered(values.origins, origins.length), connectedSites: ordered(values.sites, sites.length).map(v => v != null && v > 0), source: SURFACE_SOURCE };
}
