import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
const source = JSON.parse(await fs.readFile('lib/outbreak/admin1.json', 'utf8'));
const groups = new Map();
for (const feature of source.features) {
  const country = feature.properties.country;
  if (!groups.has(country)) groups.set(country, []);
  groups.get(country).push(feature);
}
await fs.mkdir('public/basemap/admin1', { recursive: true });
const index = [];
for (const [country, features] of groups) {
  const json = JSON.stringify({ type: 'FeatureCollection', features });
  const file = createHash('sha256').update(json).digest('hex').slice(0, 16) + '.json';
  await fs.writeFile(`public/basemap/admin1/${file}`, json);
  index.push({ country, file, bounds: [Math.min(...features.map(f => f.bbox[0])), Math.min(...features.map(f => f.bbox[1])), Math.max(...features.map(f => f.bbox[2])), Math.max(...features.map(f => f.bbox[3]))] });
}
await fs.writeFile('lib/outbreak/basemapIndex.json', JSON.stringify(index));
console.log(`Created ${index.length} regional briefing assets from the existing Natural Earth dataset.`);
