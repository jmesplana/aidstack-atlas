// Leaflet accepts an HTMLElement: external labels never pass through innerHTML.
export function infrastructurePopup(feature, document = globalThis.document) {
  const properties = feature.properties || {}, tags = properties.tags || {};
  const root = document.createElement('div');
  root.style.maxWidth = '280px';
  const title = document.createElement('strong');
  title.textContent = properties.name || tags.name || 'Mapped infrastructure';
  root.appendChild(title);
  for (const [label, value] of [
    ['Category', properties.category], ['Operator', tags.operator],
    ['Capacity', tags.capacity || tags.beds], ['Type', tags.amenity || tags.highway],
  ]) {
    if (value == null || value === '') continue;
    const row = document.createElement('p'); row.textContent = `${label}: ${value}`; root.appendChild(row);
  }
  if (['node', 'way', 'relation'].includes(properties.osmType) && /^\d+$/.test(String(properties.osmId))) {
    const link = document.createElement('a');
    link.href = `https://www.openstreetmap.org/${properties.osmType}/${properties.osmId}`;
    link.textContent = 'View on OpenStreetMap'; link.target = '_blank'; link.rel = 'noopener noreferrer'; root.appendChild(link);
  }
  return root;
}
