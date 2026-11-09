export const BUILDING_MIN_ZOOM = 14;
export const BUILDING_TILE_ZOOM = 13;
export const BUILDING_MAX_TILE_ZOOM = 17;
export const BUILDING_LIMIT = 1500;

export function buildingTileBounds({ z, x, y }) {
  if (![z, x, y].every(Number.isInteger) || z < BUILDING_TILE_ZOOM || z > BUILDING_MAX_TILE_ZOOM || x < 0 || y < 0 || x >= 2 ** z || y >= 2 ** z) throw new Error('Invalid building tile.');
  const n = 2 ** z, latitude = v => Math.atan(Math.sinh(Math.PI * (1 - 2 * v / n))) * 180 / Math.PI;
  return [x / n * 360 - 180, latitude(y + 1), (x + 1) / n * 360 - 180, latitude(y)];
}
export function visibleBuildingTiles([west, south, east, north]) {
  const z = BUILDING_TILE_ZOOM, n = 2 ** z;
  const row = lat => Math.floor((1 - Math.asinh(Math.tan(Math.max(-85.05, Math.min(85.05, lat)) * Math.PI / 180)) / Math.PI) / 2 * n);
  if (east < west) east += 360;
  const start = Math.floor((west + 180) / 360 * n), end = Math.floor((east + 180) / 360 * n);
  const tiles = [];
  for (let x = start; x <= end; x++) for (let y = Math.max(0, row(north)); y <= Math.min(n - 1, row(south)); y++) tiles.push({ z, x: ((x % n) + n) % n, y });
  return tiles;
}
export function childBuildingTiles({ z, x, y }) {
  if (z >= BUILDING_MAX_TILE_ZOOM) return [];
  return [0, 1].flatMap(dx => [0, 1].map(dy => ({ z: z + 1, x: x * 2 + dx, y: y * 2 + dy })));
}
