const shift = (date, days) => new Date(Date.parse(date) + days * 86400000).toISOString().slice(0, 10);

export function observationIndex(records) {
  const index = new Map();
  for (const row of records) {
    const key = JSON.stringify([row.location, row.date]);
    index.set(key, index.has(key) ? null : row.value);
  }
  return (location, date) => {
    const value = index.get(JSON.stringify([location, date]));
    return Number.isFinite(value) ? value : null;
  };
}

// One shared baseline for every location in a comparison. Prefer seven days,
// then six, then eight. Never fill values or mix different area intervals.
export function comparisonBaseline(valueAt, locations, end, requireAll = false) {
  for (const days of [7, 6, 8]) {
    const start = shift(end, -days);
    const paired = locations.filter(location => valueAt(location, end) !== null && valueAt(location, start) !== null);
    if (paired.length && (!requireAll || paired.length === locations.length)) return { start, end, days };
  }
  return { start: shift(end, -7), end, days: 7 };
}
