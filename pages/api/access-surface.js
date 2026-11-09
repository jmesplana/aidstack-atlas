import { withRateLimit } from '../../lib/rateLimit.js';
import { validateAccessInputRequest, accessScopeKey } from '../../lib/planning/accessInputs.js';
import { isPointInGeometry } from '../../lib/geo/geometry.js';
import { discoverAccessFacilities } from '../../lib/planning/facilityDiscovery.js';
import { fetchSurfaceTimes } from '../../lib/earthEngine/accessSurface.js';
import cache from '../../lib/osmCache.js';
export const config = { api: { bodyParser: { sizeLimit: '5mb' } } };
export const maxDuration = 60;
export async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });
  let body;
  try {
    body = req.body;
    validateAccessInputRequest({ districts: body.districts, kind: 'population' }, { batch: body.action === 'facilities' });
    if (!['facilities','travel'].includes(body.action)) throw new Error('Invalid surface request.');
    if (body.action === 'travel') {
      if (!['walking','driving'].includes(body.mode)) throw new Error('Invalid travel mode.');
      for (const [key,max] of [['origins',1000],['sites',2000]]) {
        if (!Array.isArray(body[key]) || body[key].length > max || (key === 'origins' && !body[key].length) || body[key].some(p => !Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite) || Math.abs(p[0]) > 180 || p[1] < -60 || p[1] > 85)) throw new Error('Invalid points or points outside travel-surface coverage (60°S–85°N).');
      }
      if (body.origins.some(p => !body.districts.some(d => isPointInGeometry(p,d.geometry)))) throw new Error('Population points must stay in the selected administrative areas.');
    }
  } catch (error) { return res.status(400).json({ error: error.message }); }
  if (body.action === 'travel' && !process.env.GEE_SERVICE_ACCOUNT_KEY) return res.status(503).json({ error: 'The platform Earth Engine connection is not configured.' });
  try {
    if (body.action === 'facilities') {
      const key = `surface-facilities:v2:${accessScopeKey(body.districts)}`;
      const saved = !body.refresh && await cache.getCachedOSM(key);
      if (saved) return res.status(200).json({ ...saved, cached: true });
      const result = await discoverAccessFacilities(body.districts, { force: body.refresh === true });
      if (!result.metadata.warnings.length) await cache.setCachedOSM(key,result,24);
      return res.status(200).json(result);
    }
    // User-supplied service coordinates and modeled results are not stored in a shared server cache.
    return res.status(200).json(await fetchSurfaceTimes(body));
  } catch (error) { return res.status(502).json({ error: error.message }); }
}
export default withRateLimit(handler, { keyPrefix: 'access-surface', limit: 900 });
