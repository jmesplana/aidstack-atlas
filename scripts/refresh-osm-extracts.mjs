// Run on the same persistent volume as Atlas. This refreshes complete public
// OSM extracts already requested by the app, never user plans or private sites.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
try { process.loadEnvFile('.env.local'); } catch {}
const store = require('../lib/osm/extractStore.cjs');
const { requestOverpass } = require('../lib/osm/overpassClient.cjs');
if (!store.directory) throw new Error('Configure OSM_EXTRACT_DIR on persistent storage before scheduling refreshes.');
async function refresh() {
  const records = await store.list();
  let refreshed = 0;
  for (const record of records) {
    if (Date.now() - Date.parse(record.metadata.timestamp) < 18*3600000) continue;
    try {
      const seconds = Number(record.query.match(/\[timeout:(\d+)\]/)?.[1] || 20);
      await requestOverpass(record.query,{forceRefresh:true,timeoutMs:Math.min(30000,seconds*1000),maxRetries:1});
      refreshed++;
    } catch (error) {
      console.warn(`OSM refresh paused (${error.code || 'provider unavailable'}); existing extracts retained.`);
      break;
    }
  }
  console.log(`OSM extract refresh: ${refreshed} updated, ${records.length} stored.`);
}
await refresh();
if (process.argv.includes('--watch')) {
  // Sequential cycles: slow providers cannot create overlapping refresh jobs.
  for (;;) { await new Promise(resolve => setTimeout(resolve,6*3600000)); await refresh(); }
}
