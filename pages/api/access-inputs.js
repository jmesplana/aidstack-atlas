import { withRateLimit } from '../../lib/rateLimit.js';
import { sendApiError } from '../../lib/validation/apiValidation.js';
import { validateAccessInputRequest, accessScopeKey, accessRoadScopeKey, validateAccessRoadBounds } from '../../lib/planning/accessInputs.js';
import { fetchAccessPopulation } from '../../lib/worldpop/accessCells.js';
import { ROUTING_GROUPS } from '../../lib/osm/routingGroups.js';
import cache from '../../lib/osmCache.js';
import { AccessNetworkError, fetchAccessNetwork } from '../../lib/osm/accessNetwork.js';

export const config = { api: { bodyParser: { sizeLimit: '10mb' }, responseLimit: '12mb' } };
export const maxDuration = 60;

export async function handler(req, res) {
  if (req.method !== 'POST') return sendApiError(res, 405, 'METHOD_NOT_ALLOWED', 'Method not allowed');
  let request;
  try { request = validateAccessInputRequest(req.body); }
  catch (error) { return sendApiError(res, 400, 'INVALID_ACCESS_SCOPE', error.message); }
  const { districts, kind, cellSize, year, cohort } = request;
  const group = kind === 'roads' ? req.body.group || null : null;
  if (group && !ROUTING_GROUPS.includes(group)) return sendApiError(res, 400, 'INVALID_ROUTING_GROUP', 'Invalid road-data group.');
  let roadBounds;
  try { if (kind === 'roads') roadBounds = validateAccessRoadBounds(districts, req.body.roadBounds); }
  catch (error) { return sendApiError(res, 400, 'INVALID_ROAD_BOUNDS', error.message); }
  const scopeKey = kind === 'roads' ? accessRoadScopeKey(districts, cellSize, year, req.body.roadBounds, group) : accessScopeKey(districts, cellSize, year, cohort);
  const key = `access-inputs:v1:${kind}:${scopeKey}`;
  try {
    const cached = !req.body.refresh && await cache.getCachedOSM(key);
    if (cached) return res.status(200).json({ ...cached, cached: true });
    let result;
    if (kind === 'population') {
      if (!process.env.GEE_SERVICE_ACCOUNT_KEY) return sendApiError(res, 503, 'GEE_NOT_CONFIGURED', 'WorldPop requires the platform’s Google Earth Engine connection.');
      result = await fetchAccessPopulation(districts, year, cellSize, cohort);
    } else {
      const providerAttempt = Math.min(2, Math.max(0, Math.floor(Number(req.body.providerAttempt) || 0)));
      result = await fetchAccessNetwork(districts, group, undefined, roadBounds, providerAttempt, req.body.refresh === true);
    }
    const output = { ...result, metadata: { timestamp: new Date().toISOString(), scopeKey, kind }, cached: false };
    await cache.setCachedOSM(key, output, 24);
    return res.status(200).json(output);
  } catch (error) {
    if (error instanceof AccessNetworkError) {
      if (error.retryAfter) res.setHeader?.('Retry-After', String(error.retryAfter));
      return res.status(error.status).json({ success: false, code: error.code, error: error.message, retryAfter: error.retryAfter, subdivide: error.subdivide });
    }
    if (error.code === 'TOO_MANY_CELLS') return sendApiError(res, 413, 'TOO_MANY_CELLS', 'This area has more than 5,000 population cells. Choose a coarser grid or fewer areas.');
    return sendApiError(res, 502, 'ACCESS_INPUTS_UNAVAILABLE', kind === 'population' ? 'WorldPop cells could not be loaded. Try a smaller area or a different year.' : 'Road data could not be loaded. Your selected administrative area is unchanged. Retry loading; completed downloads will be reused.');
  }
}
export default withRateLimit(handler, { keyPrefix: 'access-inputs', limit: 900 });
