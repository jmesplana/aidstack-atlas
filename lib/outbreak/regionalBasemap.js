import index from './basemapIndex.json' with { type: 'json' };
const cached = new Map();
export function basemapFiles(bounds) {
  if (!bounds?.length) return [];
  return index.filter(({ bounds: b }) => b[0] <= bounds[2] && b[2] >= bounds[0] && b[1] <= bounds[3] && b[3] >= bounds[1]).map(row => row.file);
}
export async function loadRegionalBasemap(bounds) {
  return (await Promise.all(basemapFiles(bounds).map(file => {
    if (!cached.has(file)) {
      const request = fetch(`/basemap/admin1/${file}`, { signal: AbortSignal.timeout(15000) })
        .then(async response => { if (!response.ok) throw new Error('Regional basemap unavailable.'); return (await response.json()).features; })
        .catch(error => { cached.delete(file); throw error; });
      if (cached.size >= 64) cached.delete(cached.keys().next().value);
      cached.set(file, request);
    }
    return cached.get(file);
  }))).flat();
}
