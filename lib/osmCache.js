/** OSM cache: memory first, with bounded optional Redis persistence. */
const sharedRedis = require('./redisFallback.cjs');

function createOSMCache({ redis = sharedRedis, now = () => Date.now(), maxEntries = 50 } = {}) {
  const memory = new Map();
  const valid = (data, allowStale) => {
    const age = now() - Date.parse(data?.metadata?.timestamp);
    const ttl = Number(data?.metadata?.ttl) || 24 * 60 * 60 * 1000;
    return Number.isFinite(age) && age < ttl * (allowStale ? 7 : 1);
  };
  function remember(key, data) {
    memory.delete(key);
    if (memory.size >= maxEntries) memory.delete(memory.keys().next().value);
    memory.set(key, data);
  }

  async function getCachedOSM(key, allowStale = false) {
    const local = memory.get(key);
    if (local && valid(local, allowStale)) return local;
    // Keep expired entries for the explicitly requested stale-data fallback.
    if (local && !valid(local, true)) memory.delete(key);
    const result = await redis.run(async client => {
      const value = await client.get(key);
      return value ? JSON.parse(value) : null;
    });
    if (result.ok && result.value && valid(result.value, allowStale)) {
      remember(key, result.value);
      return result.value;
    }
    return null;
  }

  async function setCachedOSM(key, data, ttlHours = 24) {
    const cached = { ...data, metadata: {
      ...data.metadata,
      timestamp: data.metadata?.timestamp || new Date(now()).toISOString(),
      ttl: ttlHours * 60 * 60 * 1000,
    } };
    // Always retain a local copy, even when Redis previously worked.
    remember(key, cached);
    await redis.run(client => client.set(key, JSON.stringify(cached), 'EX', Math.ceil(ttlHours * 60 * 60 * 7)));
  }

  async function clearOSMCache() {
    memory.clear();
    await redis.run(async client => {
      const keys = await client.keys('osm:*');
      if (keys.length) await client.del(...keys);
    });
  }

  return { getCachedOSM, setCachedOSM, clearOSMCache };
}

module.exports = { createOSMCache, ...createOSMCache() };
