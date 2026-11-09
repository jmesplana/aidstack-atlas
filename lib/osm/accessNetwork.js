import { accessRoadBounds, buildAccessOverpassQuery, parseAccessOverpass, validateAccessRoadBounds } from '../planning/accessInputs.js';
import transport from './overpassClient.cjs';
import helpers from '../osmHelpers.js';

export class AccessNetworkError extends Error {
  constructor(code, message, options = {}) { super(message); Object.assign(this, { code, status: 503, retryAfter: 30, subdivide: false }, options); }
}
export function classifyOverpassFailure(status, detail = '', retryAfter = null) {
  const error = transport.failure(status, detail, retryAfter);
  return new AccessNetworkError(error.code, error.message, error);
}
export async function fetchAccessNetwork(districts, group = null, request = transport.requestOverpass, roadBounds = null, providerAttempt = 0, forceRefresh = false) {
  const bounds = validateAccessRoadBounds(districts, roadBounds);
  const [west, south, east, north] = bounds;
  const boundary = { type: 'Polygon', coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]] };
  const query = group ? helpers.buildRoutingQuery(boundary, group, 20000, 1500) : buildAccessOverpassQuery(bounds, 20);
  try {
    const data = await request(query, { timeoutMs: 20000, maxRetries: 1, providerAttempt, forceRefresh });
    if (group && data.elements.length > 1500) throw new AccessNetworkError('OSM_INCOMPLETE_NETWORK', 'This road-data group needs smaller internal sections.', { status: 502, subdivide: true, retryAfter: 0 });
    let parsed;
    try { parsed = parseAccessOverpass(data, { allowEmpty: true, includeRoads: group !== 'services' }); }
    catch { throw new AccessNetworkError('OSM_INCOMPLETE_NETWORK', 'The road service returned incomplete geometry. Retrying smaller internal sections may help.', { status: 502, subdivide: true, retryAfter: 0 }); }
    return { ...parsed, bounds, bufferKm: 5, source: 'OpenStreetMap / Overpass', routingReady: true, routingGroup: group };
  } catch (error) {
    if (error instanceof AccessNetworkError) throw error;
    throw new AccessNetworkError(error.code || 'OSM_PROVIDER_UNAVAILABLE', error.message, error);
  }
}
