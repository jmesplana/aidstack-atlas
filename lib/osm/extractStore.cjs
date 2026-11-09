const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const DEFAULT_DIR = process.env.OSM_EXTRACT_DIR || (process.env.VERCEL || process.env.NODE_ENV === 'test' || process.env.NODE_TEST_CONTEXT ? null : path.join(process.cwd(), '.atlas-data', 'osm'));
const MAX_BYTES = 12 * 1024 * 1024;
function createExtractStore({ directory = DEFAULT_DIR, now = Date.now } = {}) {
  const file = query => path.join(directory, createHash('sha256').update(query).digest('hex') + '.json');
  const complete = record => record?.version === 1 && typeof record.query === 'string' && Array.isArray(record.data?.elements) && !record.data.remark && Number.isFinite(Date.parse(record.metadata?.timestamp));
  async function get(query, maxAgeMs = 86400000) {
    if (!directory) return null;
    try {
      const name = file(query);
      if ((await fs.stat(name)).size > MAX_BYTES) return null;
      const record = JSON.parse(await fs.readFile(name,'utf8'));
      return complete(record) && record.query === query && now() - Date.parse(record.metadata.timestamp) < maxAgeMs ? record : null;
    } catch { return null; }
  }
  async function list() {
    if (!directory) return [];
    try {
      const names = (await fs.readdir(directory)).filter(n => /^[a-f0-9]{64}\.json$/.test(n));
      const records = [];
      for (const name of names) {
        try {
          const stat = await fs.stat(path.join(directory,name));
          if (stat.size > MAX_BYTES) continue;
          const record = JSON.parse(await fs.readFile(path.join(directory,name),'utf8'));
          if (complete(record) && path.basename(file(record.query)) === name) records.push({ query: record.query, metadata: record.metadata, filename: name, bytes: stat.size });
        } catch {}
      }
      return records;
    } catch { return []; }
  }
  async function set(query,data) {
    if (!directory || !Array.isArray(data?.elements) || data.remark) return false;
    const record = { version: 1, query, data, metadata: { timestamp: new Date(now()).toISOString(), source: 'OpenStreetMap / Overpass', license: 'ODbL' } };
    const serialized = JSON.stringify(record);
    if (Buffer.byteLength(serialized) > MAX_BYTES) return false;
    let temp;
    try {
      await fs.mkdir(directory,{recursive:true,mode:0o700});
      temp = file(query) + '.' + randomUUID() + '.tmp';
      await fs.writeFile(temp,serialized,{mode:0o600});
      await fs.rename(temp,file(query));
      // Prune using file metadata; do not parse all saved road networks on the
      // request path just to enforce the disk budget.
      const records = [];
      for (const name of (await fs.readdir(directory)).filter(n => /^[a-f0-9]{64}\.json$/.test(n))) {
        const stat = await fs.stat(path.join(directory,name)).catch(() => null);
        if (stat) records.push({ filename: name, bytes: stat.size, modified: stat.mtimeMs });
      }
      records.sort((a,b) => a.modified-b.modified);
      let bytes = records.reduce((sum,r) => sum+r.bytes,0), remaining = records.length;
      for (const r of records) {
        if (remaining <= 128 && bytes <= 512*1024*1024 && now()-r.modified < 30*86400000) break;
        await fs.unlink(path.join(directory,r.filename)); remaining--; bytes-=r.bytes;
      }
      return true;
    } catch { if (temp) await fs.unlink(temp).catch(() => {}); return false; }
  }
  return { get, set, list, directory };
}
module.exports = { createExtractStore, ...createExtractStore() };
