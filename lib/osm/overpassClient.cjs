const { createHash } = require('node:crypto');
const cache = require('../osmCache');
const extractStore = require('./extractStore.cjs');
const DEFAULT_ENDPOINTS = process.env.OVERPASS_API_URL ? [process.env.OVERPASS_API_URL] : ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
class OverpassError extends Error {
  constructor(code, message, { status = 503, retryAfter = 30, subdivide = false, retryable = true } = {}) {
    super(message); Object.assign(this, { code, status, retryAfter, subdivide, retryable });
  }
}
function failure(status, detail = '', header = null) {
  const seconds = Number(header), date = Math.ceil((Date.parse(header) - Date.now()) / 1000);
  const retryAfter = Math.max(30, Number.isFinite(seconds) && seconds > 0 ? seconds : Number.isFinite(date) && date > 0 ? date : 30);
  if ([429, 406].includes(status) || /at capacity|queue.*full|rate.limit|too many requests|slots/i.test(detail)) return new OverpassError('OSM_PROVIDER_BUSY', `The OSM service is busy. Retry after ${retryAfter} seconds; completed downloads are retained.`, { retryAfter });
  if (/runtime error|timed? out|timeout|out of memory/i.test(detail)) return new OverpassError('OSM_QUERY_TIMEOUT', 'The OSM query timed out or exceeded its memory allowance.', { status: 504, subdivide: true });
  if ([400, 401, 403, 404].includes(status)) return new OverpassError('OSM_REQUEST_REJECTED', 'The OSM provider rejected the request. Check the configured endpoint or query.', { status: 502, retryable: false, retryAfter: 0 });
  return new OverpassError('OSM_PROVIDER_UNAVAILABLE', 'The OSM service is temporarily unavailable. Completed downloads are retained.', { status: 503, retryAfter });
}
function createOverpassClient({ fetchImpl = (...args) => fetch(...args), storage = cache, durable = null, now = Date.now, endpoints = DEFAULT_ENDPOINTS } = {}) {
  const pending = new Map(), cooldown = new Map();
  const providerOffset = options => Math.max(0, Math.floor(Number(options.providerAttempt) || 0)) % (endpoints.length || 1);
  async function execute(query, options) {
    const key = 'osm:raw:v1:' + createHash('sha256').update(query).digest('hex');
    if (!options.forceRefresh) {
      const saved = await storage.getCachedOSM(key);
      if (saved) return saved.data;
      const extract = await durable?.get(query);
      if (extract) {
        await storage.setCachedOSM(key, { data: extract.data, metadata: extract.metadata },24);
        return extract.data;
      }
    }
    const started = now(), errors = [];
    const attempts = Math.min(endpoints.length, (options.maxRetries ?? 1) + 1);
    // A browser retry may reach a fresh server process. Carry provider order
    // across requests so a slow primary cannot consume every request's budget.
    const offset = providerOffset(options);
    const ordered = [...endpoints.slice(offset), ...endpoints.slice(0, offset)];
    for (const endpoint of ordered.sort((a, b) => Number((cooldown.get(a)?.until || 0) > now()) - Number((cooldown.get(b)?.until || 0) > now())).slice(0, attempts)) {
      const blocked = cooldown.get(endpoint);
      if (blocked && blocked.until > now()) { errors.push(new OverpassError(blocked.error.code, blocked.error.message, { ...blocked.error, retryAfter: Math.ceil((blocked.until - now()) / 1000) })); continue; }
      const remaining = 50000 - (now() - started);
      // Allow the documented 15-second queue plus execution and body transfer.
      const httpTimeout = Math.min(remaining, Math.max(5000, options.timeoutMs || 20000) + 20000);
      if (httpTimeout < 20000) break;
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), httpTimeout);
      try {
        const response = await fetchImpl(endpoint, { method: 'POST', body: `data=${encodeURIComponent(query)}`, signal: controller.signal,
          headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', 'User-Agent': 'gdacs-facilities-ai/0.1' } });
        if (!response.ok) throw failure(response.status, (await response.text()).slice(0, 4000), response.headers?.get('retry-after'));
        let data;
        try { data = await response.json(); } catch { throw failure(502); }
        if (data.remark) throw failure(200, data.remark);
        if (!Array.isArray(data.elements)) throw failure(502);
        await durable?.set(query,data);
        await storage.setCachedOSM(key, { data, metadata: { timestamp: new Date(now()).toISOString() } }, 24);
        cooldown.delete(endpoint);
        return data;
      } catch (error) {
        const known = error instanceof OverpassError ? error : failure(controller.signal.aborted ? 504 : 503);
        errors.push(known);
        if (!known.retryable || known.subdivide) throw known;
        cooldown.set(endpoint, { until: now() + known.retryAfter * 1000, error: known });
      } finally { clearTimeout(timer); }
    }
    const last = errors.find(e => e.code === 'OSM_PROVIDER_BUSY') || errors[errors.length - 1] || failure(503);
    last.retryAfter = Math.max(last.retryAfter, ...errors.map(e => e.retryAfter));
    throw last;
  }
  return async function requestOverpass(query, options = {}) {
    const key = `${options.forceRefresh ? 'refresh:' : ''}${providerOffset(options)}:${query}`;
    if (pending.has(key)) return pending.get(key);
    const task = execute(query, options);
    pending.set(key, task);
    try { return await task; } finally { pending.delete(key); }
  };
}
module.exports = { OverpassError, failure, createOverpassClient, requestOverpass: createOverpassClient({ durable: extractStore }) };
