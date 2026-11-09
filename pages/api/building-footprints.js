import { withRateLimit } from '../../lib/rateLimit.js';
import { buildingTileBounds, BUILDING_LIMIT, BUILDING_MAX_TILE_ZOOM } from '../../lib/osm/buildingTiles.js';
import overpass from '../../lib/osm/overpassClient.cjs';
import helpers from '../../lib/osmHelpers.js';

export const config = { api: { bodyParser: { sizeLimit: '2kb' }, responseLimit: '8mb' } };
export const maxDuration = 60;
export function createBuildingHandler(request = overpass.requestOverpass) {
  return async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });
    let bounds;
    try { bounds = buildingTileBounds(req.body || {}); }
    catch { return res.status(400).json({ error: 'Invalid building tile.' }); }
    try {
      const [w, s, e, n] = bounds;
      const query = `[out:json][timeout:20];way["building"]["building"!="no"](${s},${w},${n},${e});out geom ${BUILDING_LIMIT + 1};`;
      const data = await request(query, { timeoutMs: 20000 });
      if (data.elements.length > BUILDING_LIMIT) return res.status(413).json({ error: 'This tile needs smaller building extracts.', subdivide: req.body.z < BUILDING_MAX_TILE_ZOOM });
      const features = helpers.convertToGeoJSON(data.elements).filter(f => f.geometry.type === 'Polygon');
      return res.status(200).json({ type: 'FeatureCollection', features, metadata: {
        source: 'OpenStreetMap', license: 'ODbL', attribution: '© OpenStreetMap contributors',
        timestamp: data.osm3s?.timestamp_osm_base || new Date().toISOString(),
        coverage: 'Closed OSM building ways; mapping completeness varies. Complex building relations and occupancy are not included.',
      } });
    } catch (error) {
      if (error.retryAfter) res.setHeader('Retry-After', String(error.retryAfter));
      return res.status(error.status || 503).json({ error: 'Building outlines could not be loaded. Previously downloaded tiles are retained; try again shortly.', subdivide: !!error.subdivide && req.body.z < BUILDING_MAX_TILE_ZOOM });
    }
  };
}
export default withRateLimit(createBuildingHandler(), { keyPrefix: 'building-tiles', limit: 900 });
