export function formatTravelMinutes(minutes) {
  if (minutes == null) return 'Unknown';
  if (minutes < 60) return `${minutes.toLocaleString(undefined, { maximumFractionDigits: 1 })} min`;
  const rounded = Math.round(minutes);
  return `${Math.floor(rounded / 60)} h ${rounded % 60} min`;
}
