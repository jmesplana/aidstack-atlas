// Offline network travel times. Input lines must retain shared junction vertices.
// No inferred roads, detours, live closures, or straight-line fallback.
export function distanceKm(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * rad, dLon = (b[0] - a[0]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2;
  return 6371.0088 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

const validPoint = (p) => Array.isArray(p) && p.length >= 2 && p.slice(0, 2).every(Number.isFinite) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90;
const prohibited = (value) => ['no', 'private'].includes(String(value).toLowerCase());

export function buildTravelNetwork(collection, { mode, speedKph }) {
  if (!['walking', 'driving'].includes(mode) || !Number.isFinite(speedKph) || speedKph <= 0 || speedKph > 130) throw new Error('Choose a valid travel mode and speed (up to 130 km/h).');
  if (collection?.type !== 'FeatureCollection' || !Array.isArray(collection.features)) throw new Error('Upload a road network as a GeoJSON FeatureCollection.');
  const nodes = [], index = new Map(), segments = [], reverse = [];
  let excluded = 0;
  function node(point, osmId) {
    const key = osmId == null ? JSON.stringify(point.slice(0, 2)) : `osm:${osmId}`;
    if (!index.has(key)) { index.set(key, nodes.length); nodes.push(point.slice(0, 2)); reverse.push([]); }
    return index.get(key);
  }
  function edge(a, b, minutes) { reverse[b].push([a, minutes]); }
  for (const feature of collection.features) {
    const tags = { ...feature.properties, ...feature.properties?.tags };
    const permission = mode === 'walking' ? (tags.foot ?? tags.access) : (tags.motorcar ?? tags.motor_vehicle ?? tags.vehicle ?? tags.access);
    if (prohibited(permission) || ['yes', true, 1].includes(tags.closed) || ['construction', 'proposed'].includes(tags.highway) ||
      (mode === 'walking' && ['motorway', 'motorway_link'].includes(tags.highway) && tags.foot !== 'yes') ||
      (mode === 'driving' && ['footway', 'path', 'steps', 'pedestrian', 'cycleway', 'bridleway'].includes(tags.highway) && !['yes', 'designated', 'permissive'].includes(permission))) { excluded++; continue; }
    const lines = feature.geometry?.type === 'LineString' ? [feature.geometry.coordinates] : feature.geometry?.type === 'MultiLineString' ? feature.geometry.coordinates : null;
    if (!lines) throw new Error('Road network must contain only LineString or MultiLineString features.');
    const direction = mode === 'walking' ? tags['oneway:foot'] : (tags.oneway ?? (tags.junction === 'roundabout' ? 'yes' : undefined));
    const forwardOnly = ['yes', '1', 'true'].includes(String(direction));
    const backwardOnly = String(direction) === '-1';
    // A numeric posted limit caps the user-provided planning speed.
    const limitMatch = String(tags.maxspeed || '').match(/^(\d+(?:\.\d+)?)\s*(mph|km\/h|kph)?$/i);
    const limit = limitMatch ? Number(limitMatch[1]) * (limitMatch[2]?.toLowerCase() === 'mph' ? 1.609344 : 1) : speedKph;
    const speed = mode === 'driving' && limit > 0 ? Math.min(speedKph, limit) : speedKph;
    for (const line of lines) {
      if (!Array.isArray(line) || line.length < 2 || !line.every(validPoint)) throw new Error('Road network contains invalid WGS84 coordinates.');
      for (let i = 1; i < line.length; i++) {
        if (Math.abs(line[i][0] - line[i - 1][0]) > 180) throw new Error('Split roads at the antimeridian before importing.');
        const nodeIds = feature.geometry.type === 'LineString' ? feature.properties?.nodeIds : null;
        const a = node(line[i - 1], nodeIds?.[i - 1]), b = node(line[i], nodeIds?.[i]);
        if (a === b) continue;
        const minutes = distanceKm(nodes[a], nodes[b]) / speed * 60;
        if (!backwardOnly) edge(a, b, minutes);
        if (!forwardOnly) edge(b, a, minutes);
        segments.push({ a, b, minutes, forward: !backwardOnly, backward: !forwardOnly });
        if (segments.length > 100000) throw new Error('Road network exceeds 100,000 segments. Export a smaller operational area.');
      }
    }
  }
  if (!segments.length) throw new Error('No traversable road segments for the selected mode.');
  const spatial = new Map(), longSegments = [], binSize = .01;
  segments.forEach((s, index) => {
    const a = nodes[s.a], b = nodes[s.b];
    const x0 = Math.floor(Math.min(a[0], b[0]) / binSize), x1 = Math.floor(Math.max(a[0], b[0]) / binSize);
    const y0 = Math.floor(Math.min(a[1], b[1]) / binSize), y1 = Math.floor(Math.max(a[1], b[1]) / binSize);
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > 2500) { longSegments.push(index); return; }
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) { const key = `${x}:${y}`; if (!spatial.has(key)) spatial.set(key, []); spatial.get(key).push(index); }
  });
  return { nodes, segments, reverse, excluded, spatial, longSegments, binSize };
}

export function snapToNetwork(point, network, maxSnapKm) {
  if (!validPoint(point)) throw new Error('Invalid point coordinates.');
  let best = null;
  const cos = Math.max(0.000001, Math.cos(point[1] * Math.PI / 180));
  const nearby = new Set(network.longSegments || []);
  if (network.spatial) {
    const dy = maxSnapKm / 110 + 1e-8, dx = dy / cos;
    for (let x = Math.floor((point[0] - dx) / network.binSize); x <= Math.floor((point[0] + dx) / network.binSize); x++) for (let y = Math.floor((point[1] - dy) / network.binSize); y <= Math.floor((point[1] + dy) / network.binSize); y++) for (const index of network.spatial.get(`${x}:${y}`) || []) nearby.add(index);
  } else network.segments.forEach((_, index) => nearby.add(index));
  for (const i of nearby) {
    const segment = network.segments[i], a = network.nodes[segment.a], b = network.nodes[segment.b];
    const dx = (b[0] - a[0]) * cos, dy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, (((point[0] - a[0]) * cos * dx) + (point[1] - a[1]) * dy) / (dx * dx + dy * dy)));
    const projected = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    const km = distanceKm(point, projected);
    if (km <= maxSnapKm && (!best || km < best.km)) best = { segment: i, t, km, connectorMinutes: km / 4 * 60 };
  }
  return best;
}

// Small binary heap keeps Dijkstra O((V + E) log V), including in the browser worker.
class Queue {
  items = [];
  push(item) {
    let i = this.items.length; this.items.push(item);
    while (i > 0) { const p = (i - 1) >> 1; if (this.items[p][1] <= item[1]) break; this.items[i] = this.items[p]; i = p; }
    this.items[i] = item;
  }
  pop() {
    const first = this.items[0], last = this.items.pop();
    if (this.items.length) {
      let i = 0;
      while (i * 2 + 1 < this.items.length) {
        let c = i * 2 + 1;
        if (c + 1 < this.items.length && this.items[c + 1][1] < this.items[c][1]) c++;
        if (this.items[c][1] >= last[1]) break;
        this.items[i] = this.items[c]; i = c;
      }
      this.items[i] = last;
    }
    return first;
  }
}

export function timesToDestinations(network, origins, destinations) {
  const distances = new Float64Array(network.nodes.length).fill(Infinity), queue = new Queue();
  function relax(id, minutes) { if (minutes < distances[id]) { distances[id] = minutes; queue.push([id, minutes]); } }
  const onSegment = new Map();
  for (const target of destinations.filter(Boolean)) {
    const s = network.segments[target.segment];
    if (s.forward || target.t === 0) relax(s.a, target.connectorMinutes + target.t * s.minutes);
    if (s.backward || target.t === 1) relax(s.b, target.connectorMinutes + (1 - target.t) * s.minutes);
    onSegment.set(target.segment, [...(onSegment.get(target.segment) || []), target]);
  }
  while (queue.items.length) {
    const [id, cost] = queue.pop();
    if (cost !== distances[id]) continue;
    for (const [neighbor, weight] of network.reverse[id]) relax(neighbor, cost + weight);
  }
  return origins.map((origin) => {
    if (!origin) return null;
    const s = network.segments[origin.segment];
    let best = Infinity;
    if (s.backward || origin.t === 0) best = Math.min(best, distances[s.a] + origin.t * s.minutes);
    if (s.forward || origin.t === 1) best = Math.min(best, distances[s.b] + (1 - origin.t) * s.minutes);
    for (const target of onSegment.get(origin.segment) || []) {
      if ((target.t >= origin.t && s.forward) || (target.t <= origin.t && s.backward)) best = Math.min(best, Math.abs(target.t - origin.t) * s.minutes + target.connectorMinutes);
    }
    return Number.isFinite(best) ? best + origin.connectorMinutes : null;
  });
}
