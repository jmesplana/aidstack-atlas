// Evidence package and validation for AI-drafted response actions. The model only
// sees numbered, deterministic evidence sentences; every drafted action must cite
// them, name only areas they mention and repeat only numbers they contain.
import playbook from './actionPlaybook.json' with {type:'json'};
import { validDate, formatValue } from './data.js';

export const ACTION_PLAYBOOK = playbook;
export const MAX_EVIDENCE = 80, MAX_ACTIONS = 6, MAX_GAPS = 4;
const fv = value => Number.isFinite(value) ? formatValue(value) : 'unknown';
const PILLAR_IDS = new Set(playbook.pillars.map(p => p.id));
const URGENCY_IDS = playbook.urgency.map(u => u.id);

export function actionEvidence({ epi, alerts = [], monitoring, security, mining, mobility, response, actions = [], asOf }) {
  const items = [];
  const add = (kind, text, areas = []) => { if (items.length < MAX_EVIDENCE) items.push({ id: `E${items.length + 1}`, kind, text: text.slice(0, 500), areas: [...new Set(areas.filter(Boolean))] }); };
  if (!epi) add('gap', `No sub-national cumulative case data is available at the ${asOf} cut-off.`);
  const affected = new Set(epi?.affected.map(z => z.location) || []);
  if (epi) {
    add('situation', `Reported cumulative confirmed cases: ${fv(epi.total)} across ${affected.size} areas on ${epi.date}. ${epi.missing + epi.absent} case-series locations have missing or absent reports at this date. Cumulative totals are not current caseload.`);
    alerts.slice(0, 8).forEach(a => add('new-area', `${a.location}: first positive cumulative case report in the loaded history on ${a.date}${a.priorZero ? ' (previously reported zero)' : ''}.`, [a.location]));
    epi.growth.filter(z => z.delta > 0).slice(0, 8).forEach(z => add('growth', `${z.location}${z.province ? ` (${z.province})` : ''}: cumulative confirmed cases ${fv(z.previous)} on ${z.baseline} → ${fv(z.value)} on ${z.date} (+${fv(z.delta)}).`, [z.location]));
    epi.burden.filter(z => z.value > 0).slice(0, 5).forEach(z => add('burden', `${z.location}${z.province ? ` (${z.province})` : ''}: ${fv(z.value)} cumulative confirmed cases on ${z.date}, among the highest reported totals.`, [z.location]));
  }
  if (monitoring) {
    const rows = monitoring.rows.filter(r => r.hasHistory);
    rows.filter(r => r.status === 'rising').slice(0, 6).forEach(r => add('trend', `${r.location}: reported weekly accumulation rate rising across the last three reporting intervals.`, [r.location]));
    rows.filter(r => r.status === 'declining').slice(0, 4).forEach(r => add('trend', `${r.location}: reported rate declined by at least ${monitoring.settings.threshold}% in each of two successive weekly comparisons.`, [r.location]));
    const gaps = rows.filter(r => r.age >= 21 && r.value > 0).sort((a, b) => b.age - a.age);
    gaps.slice(0, 8).forEach(r => add('reporting-gap', `${r.location}: no valid case report for ${r.age} days before the cut-off (last valid report ${r.lastReport}, cumulative total ${fv(r.value)}).`, [r.location]));
    if (gaps.length > 8) add('reporting-gap', `${gaps.length - 8} further areas with previous cases have no valid report for at least 21 days.`);
  }
  if (security) [...security.byZone].filter(([n, s]) => affected.has(n) && s.events > 0).sort((a, b) => b[1].events - a[1].events).slice(0, 5)
    .forEach(([n, s]) => add('security', `${n}: ${s.events} recorded security events during ${security.start}–${security.end} in an area reporting cases. Event overlap alone does not establish access disruption.`, [n]));
  else add('gap', 'No security event data is loaded for this cut-off.');
  if (mining) [...mining.byZone].filter(([n, v]) => affected.has(n) && v > 0).sort((a, b) => b[1] - a[1]).slice(0, 5)
    .forEach(([n, v]) => add('mining', `${n}: ${v} documented mining sites in an area reporting cases.`, [n]));
  if (mobility && validDate(mobility.end) && mobility.end <= asOf) {
    mobility.routes.filter(r => r.origin !== r.destination && affected.has(r.origin) && r.value > 0).sort((a, b) => b.value - a.value).slice(0, 6)
      .forEach(r => add('mobility', `${r.origin} → ${r.destination}: ${fv(r.value)} ${mobility.unit} during ${mobility.start}–${mobility.end}; historical movement from an area reporting cases${affected.has(r.destination) ? '' : ' to an area with no reported cases'}. Not evidence of imported cases.`, [r.origin, r.destination]));
  } else add('gap', 'No population movement estimates are eligible at this cut-off.');
  response?.pillars.forEach(p => p.loaded ? add('response', `${p.label} indicators: ${p.note}`) : add('gap', `${p.label}: no dated response indicators loaded.`));
  add('gap', 'The evidence package contains no vaccination, contact follow-up, laboratory or treatment-capacity indicators.');
  // Plan items go last so adding an action does not renumber the situation evidence.
  actions.filter(a => a.status !== 'Completed' && a.action?.trim()).slice(0, 8).forEach(a => add('plan', `Existing plan action [${a.status}; ${a.owner?.trim() ? 'owner assigned' : 'no owner'}; ${a.due ? `due ${a.due}` : 'no due date'}]: ${a.action.trim().slice(0, 240)}`, a.location ? a.location.split(/,\s*/) : []));
  return items;
}

// Plan changes are excluded so adding a drafted action does not mark the draft outdated.
export function evidenceKey(evidence) {
  const text = JSON.stringify(evidence.filter(e => e.kind !== 'plan').map(e => [e.id, e.text, e.areas]));
  let hash = 5381;
  for (let i = 0; i < text.length; i++) hash = ((hash * 33) ^ text.charCodeAt(i)) >>> 0;
  return hash.toString(36);
}

export function validEvidencePackage(evidence) {
  return Array.isArray(evidence) && evidence.length > 0 && evidence.length <= MAX_EVIDENCE && evidence.every(e =>
    /^E\d{1,3}$/.test(e?.id) && typeof e.text === 'string' && e.text.length <= 500 && typeof e.kind === 'string' && e.kind.length <= 30 &&
    Array.isArray(e.areas) && e.areas.length <= 10 && e.areas.every(a => typeof a === 'string' && a.length <= 120)) &&
    new Set(evidence.map(e => e.id)).size === evidence.length;
}

const numbersIn = text => (String(text).replace(/\bE\d+\b/g, '').match(/\d+(?:[.,]\d+)*/g) || []).map(n => String(Number(n.replace(/,/g, ''))));
const clean = (value, max) => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : '';

// Drops any drafted action that cites unknown evidence, names an area absent from the
// evidence, or introduces a number not present in its cited evidence.
export function validateActions(raw, evidence) {
  const byId = new Map(evidence.map(e => [e.id, e]));
  const knownAreas = new Set(evidence.flatMap(e => e.areas));
  const allowed = cited => new Set([...cited.flatMap(e => numbersIn(e.text)), ...playbook.timeframes.map(String)]);
  const grounded = (texts, cited) => { const ok = allowed(cited); return texts.every(t => numbersIn(t).every(n => ok.has(n))); };
  const actions = [], titles = new Set();
  for (const a of Array.isArray(raw?.actions) ? raw.actions : []) {
    if (actions.length >= MAX_ACTIONS) break;
    const ids = Array.isArray(a?.evidence) ? [...new Set(a.evidence)] : [];
    if (!ids.length || ids.some(id => !byId.has(id))) continue;
    const item = { title: clean(a.title, 120), action: clean(a.action, 400), rationale: clean(a.rationale, 400), dataNeeded: clean(a.dataNeeded, 200) };
    const areas = Array.isArray(a.areas) ? [...new Set(a.areas.filter(n => typeof n === 'string'))] : null;
    if (!item.title || !item.action || !item.rationale || !PILLAR_IDS.has(a.pillar) || !URGENCY_IDS.includes(a.urgency) || !playbook.confidence.includes(a.confidence)) continue;
    if (!areas || areas.length > 8 || areas.some(n => !knownAreas.has(n))) continue;
    if (titles.has(item.title.toLowerCase()) || !grounded(Object.values(item), ids.map(id => byId.get(id)))) continue;
    titles.add(item.title.toLowerCase());
    actions.push({ id: `ai-${actions.length + 1}`, source: 'ai', ...item, pillar: a.pillar, urgency: a.urgency, confidence: a.confidence, areas, evidence: ids });
  }
  actions.sort((a, b) => URGENCY_IDS.indexOf(a.urgency) - URGENCY_IDS.indexOf(b.urgency));
  const dataGaps = (Array.isArray(raw?.dataGaps) ? raw.dataGaps : []).map(g => clean(typeof g === 'string' ? g : g?.text, 200))
    .filter(text => text && grounded([text], evidence)).slice(0, MAX_GAPS);
  return { actions, dataGaps };
}

// Rule-based suggestions from overview.recommendations, shown when AI is unavailable.
export const fallbackActions = suggestions => suggestions.map((s, i) => ({ id: `rule-${i + 1}`, source: 'rules', title: s.title, areas: s.areas, action: s.action, rationale: s.why, evidence: [] }));

// Shape expected by the Actions tab. AI prose stays in the action; the preserved
// basis holds only the cited evidence sentences.
export function toSuggestion(item, evidence = []) {
  if (item.source !== 'ai') return { title: item.title, areas: item.areas, why: item.rationale, action: item.action };
  const why = evidence.filter(e => item.evidence.includes(e.id)).map(e => e.text).join(' ');
  return { title: item.title, areas: item.areas, why, action: `${item.action} (AI-drafted from the cited evidence; verify before approving.)` };
}
