const SQRT3 = Math.sqrt(3);

// Round fractional axial coordinates onto a shared, pointy-top hexagon grid.
function hexAddress(x, y, radius) {
  const q = (SQRT3 * x / 3 - y / 3) / radius;
  const r = (2 * y / 3) / radius;
  let a = Math.round(q), b = Math.round(r);
  const c = Math.round(-q - r);
  const da = Math.abs(a - q), db = Math.abs(b - r), dc = Math.abs(c + q + r);
  if (da > db && da > dc) a = -b - c;
  else if (db > dc) b = -a - c;
  return [a, b];
}

// Display-only grouping: each source row belongs to exactly one hexagon.
// Project into world pixels (not viewport pixels) so panning preserves the grid.
export function accessHexagons(rows, project, radius = 12) {
  const bins = new Map();
  for (const row of rows) {
    const point = project(row);
    const [q, r] = hexAddress(point.x, point.y, radius);
    const key = `${q}:${r}`;
    if (!bins.has(key)) {
      const x = radius * SQRT3 * (q + r / 2), y = radius * 1.5 * r;
      bins.set(key, {
        key, center: { x, y }, rows: [], population: 0, counts: {}, populations: {}, minMinutes: null, maxMinutes: null,
        vertices: Array.from({ length: 6 }, (_, i) => {
          const angle = (60 * i - 30) * Math.PI / 180;
          return { x: x + radius * Math.cos(angle), y: y + radius * Math.sin(angle) };
        }),
      });
    }
    const bin = bins.get(key);
    bin.rows.push(row);
    bin.population += row.population;
    bin.counts[row.status] = (bin.counts[row.status] || 0) + 1;
    bin.populations[row.status] = (bin.populations[row.status] || 0) + row.population;
    if (row.minutes != null) {
      bin.minMinutes = bin.minMinutes == null ? row.minutes : Math.min(bin.minMinutes, row.minutes);
      bin.maxMinutes = bin.maxMinutes == null ? row.minutes : Math.max(bin.maxMinutes, row.minutes);
    }
  }
  return Array.from(bins.values(), bin => ({
    ...bin, status: Object.keys(bin.counts).length === 1 ? bin.rows[0].status : 'mixed',
  }));
}
