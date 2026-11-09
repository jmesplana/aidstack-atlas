import { childBuildingTiles } from './buildingTiles.js';
const tiles = new Map();
let bytes = 0;
const MAX_BYTES = 16 * 1024 * 1024;
function remember(key, data) {
  const size = JSON.stringify(data).length * 2;
  const previous = tiles.get(key);
  if (previous) { bytes -= previous.size; tiles.delete(key); }
  if (size > MAX_BYTES) return;
  while (tiles.size >= 64 || bytes + size > MAX_BYTES) {
    const first = tiles.keys().next().value; bytes -= tiles.get(first).size; tiles.delete(first);
  }
  tiles.set(key, { data, size, expires: Date.now() + 86400000 }); bytes += size;
}
export async function loadBuildingTile(tile, signal, request = fetch) {
  signal?.throwIfAborted();
  const key = `${tile.z}/${tile.x}/${tile.y}`;
  const saved = tiles.get(key);
  if (saved?.expires > Date.now()) return saved.data;
  const response = await request('/api/building-footprints', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(tile), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(60000)]) : AbortSignal.timeout(60000) });
  const data = await response.json();
  if (!response.ok) {
    const children = data.subdivide && childBuildingTiles(tile);
    if (children?.length) {
      const parts = [];
      for (const child of children) parts.push(await loadBuildingTile(child, signal, request));
      const merged = { type: 'FeatureCollection', features: [...new Map(parts.flatMap(p => p.features).map(f => [f.id, f])).values()], metadata: { ...parts[0].metadata, timestamp: parts.map(p => p.metadata.timestamp).sort()[0] } };
      remember(key, merged); return merged;
    }
    throw new Error(data.error || 'Building outlines could not be loaded.');
  }
  if (data.type !== 'FeatureCollection' || !Array.isArray(data.features) || !data.metadata?.timestamp) throw new Error('Incomplete building tile.');
  signal?.throwIfAborted();
  remember(key, data); return data;
}
