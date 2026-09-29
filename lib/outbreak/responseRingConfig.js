import { validDate } from './data.js';

export const RESPONSE_RINGS = {
  red: { label: 'Red · Active transmission', color: '#dc2626', actions: 'Activate programming for SDB, RCCE, MHPSS and WASH.' },
  orange: { label: 'Orange · High risk', color: '#f97316', actions: 'Strengthen surveillance; IPC training / refresher training; assist MoH to establish and equip isolation units; pre-position stores; enhance RCCE; simulation exercises (SimExes); strengthen cross-border screening.' },
  yellow: { label: 'Yellow · Prevention', color: '#facc15', actions: 'Strengthen infrastructure, training and capacity building; strengthen systems and preparedness; strengthen the National Society.' },
  unknown: { label: 'Unclassified · Review needed', color: '#cbd5e1' }
};
export function responseRingSettings(value = {}) {
  return { windowDays: [7,14,21,42].includes(value?.windowDays) ? value.windowDays : 21,
    overrides: Array.isArray(value?.overrides) ? value.overrides.filter(r => typeof r?.province === 'string' && validDate(r.date) && ['auto',...Object.keys(RESPONSE_RINGS)].includes(r.ring)).map(r => ({province:r.province,date:r.date,ring:r.ring,note:String(r.note||'')})) : [] };
}
