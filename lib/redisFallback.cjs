const Redis = require('ioredis');

// Bound connection + command time, then stop contacting an unhealthy service
// for a minute across the cache and rate limiter in this server process.
function createRedisFallback({
  url = process.env.REDIS_URL,
  createClient = (address, options) => new Redis(address, options),
  now = () => Date.now(),
  timeoutMs = 500,
  cooldownMs = 60000,
  warn = message => console.warn(message),
} = {}) {
  let client = null, connecting = null, retryAt = 0, connectionReason = null;
  const safeReason = error => {
    if (['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'CERT_HAS_EXPIRED', 'ERR_TLS_CERT_ALTNAME_INVALID'].includes(error?.code)) return error.code;
    if (/^(WRONGPASS|NOAUTH)\b/.test(error?.message || '')) return 'authentication failed';
    if (error?.message === 'Redis deadline exceeded') return 'deadline exceeded';
    return null;
  };

  async function run(operation) {
    if (!url || now() < retryAt) return { ok: false };
    let active, timer;
    try {
      if (!client) {
        connectionReason = null;
        client = createClient(url, {
          lazyConnect: true,
          connectTimeout: timeoutMs,
          commandTimeout: timeoutMs,
          enableOfflineQueue: false,
          maxRetriesPerRequest: 0,
          retryStrategy: () => null,
          autoResendUnfulfilledCommands: false,
        });
        const created = client;
        client.on('error', error => {
          if (client === created) connectionReason = safeReason(error);
        });
      }
      active = client;
      const deadline = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Redis deadline exceeded')), timeoutMs);
      });
      const work = async () => {
        if (active.status !== 'ready') {
          if (!connecting) connecting = active.connect();
          await connecting;
        }
        // A timed-out connection must not execute work if it resolves late.
        if (client !== active) throw new Error('Redis connection superseded');
        return operation(active);
      };
      const value = await Promise.race([work(), deadline]);
      return { ok: true, value };
    } catch (error) {
      if (!active || client === active) {
        const reason = connectionReason || safeReason(error) || 'connection or command failed';
        retryAt = now() + cooldownMs;
        client = null;
        connecting = null;
        try { active?.disconnect(); } catch {}
        // Never print connection strings, credentials, or raw client errors.
        warn(`Redis unavailable (${reason}); using local fallbacks for ${cooldownMs / 1000} seconds.`);
      }
      return { ok: false };
    } finally {
      clearTimeout(timer);
    }
  }

  return { run };
}

module.exports = { createRedisFallback, ...createRedisFallback() };
