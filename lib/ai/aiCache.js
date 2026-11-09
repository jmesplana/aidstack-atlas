import sharedRedis from '../redisFallback.cjs';

export function createAIResultCache({ redis = sharedRedis, now = Date.now, maxEntries = 100, maxBytes = 2 * 1024 * 1024 } = {}) {
  const memory = new Map();
  let bytes = 0;
  function remove(key) { const entry = memory.get(key); if (entry) bytes -= entry.bytes; memory.delete(key); }
  function remember(key, json, expires) {
    remove(key);
    const size = Buffer.byteLength(json);
    if (size > maxBytes) return;
    for (const [oldKey, entry] of memory) if (entry.expires <= now()) remove(oldKey);
    while (memory.size >= maxEntries || bytes + size > maxBytes) remove(memory.keys().next().value);
    memory.set(key, { json, expires, bytes: size }); bytes += size;
  }
  return {
    async getCachedAIResult(key) {
      const local = memory.get(key);
      if (local?.expires > now()) return JSON.parse(local.json);
      remove(key);
      const result = await redis.run(async client => {
        const [json, ttl] = await Promise.all([client.get(key), client.pttl(key)]);
        if (!json || ttl <= 0) return null;
        const value = JSON.parse(json);
        remember(key, json, now() + ttl);
        return value;
      });
      return result.ok ? result.value : null;
    },
    async setCachedAIResult(key, value, ttlSeconds = 86400) {
      const json = JSON.stringify(value);
      remember(key, json, now() + ttlSeconds * 1000);
      await redis.run(client => client.set(key, json, 'EX', ttlSeconds));
      return true;
    },
  };
}
export const { getCachedAIResult, setCachedAIResult } = createAIResultCache();
