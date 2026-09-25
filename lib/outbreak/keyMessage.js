import { formatValue } from './data.js';
import { recommendations } from './overview.js';
import { caseTrend } from './caseTrend.js';
import { activityMessages } from './areaHistory.js';
import { monitoringHighlights, highBurdenMovements } from './monitoring.js';

// Deterministic copy with explicit reporting periods; never a transmission forecast.
export function keyMessage({datasets=[],epi,mining,security,mobility,asOf,override='',monitoring}) {
  if(override.trim()) return {text:override.trim(),origin:'Coordinator message'};
  const paragraphs=[caseTrend({datasets,epi,asOf})];
  const sentences=[];
  const rising=epi?.growth.filter(z=>z.delta>0).slice(0,2)||[];
  const burden=epi?.burden.filter(z=>z.value>0).slice(0,1)||[];
  const place=z=>{const province=z.province||epi?.zones?.find(row=>row.location===z.location)?.province;return province?`${province} — ${z.location}`:z.location;};
  if(rising.length) sentences.push(`${rising.map(z=>`${place(z)} (+${formatValue(z.delta)})`).join(' and ')} have the largest ${epi.comparisonDays || 7}-day increases in reported cumulative totals (${epi.baseline}–${epi.date}).`);
  if(burden.length) sentences.push(`${place(burden[0])} has the largest reported cumulative burden: ${formatValue(burden[0].value)} (${epi.date}), not a measure of current caseload.`);
  else if(epi?.zones?.some(z=>z.value===0)) sentences.push(`No positive cumulative case counts are present among available area observations for ${epi.date}. Check reporting coverage before interpreting this as absence of cases.`);
  if(!sentences.length)sentences.push('Area-level case evidence is needed to identify geographic priorities.');
  paragraphs.push(sentences.join(' '));
  paragraphs.push(...activityMessages(epi?.activity));
  const actions=[];
  const suggestions=recommendations(epi,security,mining,mobility,asOf);
  const receiving=suggestions.find(s=>s.title==='Review receiving-area readiness');
  if(receiving) actions.push(`Assess surveillance readiness in ${receiving.areas.slice(0,2).join(' and ')}. Historical mobility data (${mobility.start}–${mobility.end}) connects these destinations to areas with cumulative case reports. Confirm whether these connections remain relevant; they do not establish current movement or imported infections.`);
  const mines=suggestions.find(s=>s.title==='Verify mining-community coverage');
  const access=suggestions.find(s=>s.title==='Check access constraints');
  if(access) actions.push(`Verify access in ${access.areas.slice(0,2).join(' and ')} because security events overlap reported case areas (${security.start}–${security.end}).`);
  else if(mines) actions.push(`Verify active mines and community coverage in ${mines.areas.slice(0,2).join(' and ')}; mapped sites are historical observations.`);
  if(!actions.length&&rising.length)actions.push(`Ask the teams in ${rising.map(z=>z.location).join(' and ')} to review case investigations and surveillance workload.`);
  else if(!actions.length&&burden.length)actions.push(`Confirm current caseloads, team availability and supplies in ${burden[0].location} before allocating resources.`);
  if(actions.length)paragraphs.push(actions.join(' '));
  const highlights=monitoringHighlights(monitoring);
  if(monitoring) {
    const leading=highBurdenMovements(epi,mobility,asOf,{topZones:5}).slice(0,3);
    if(leading.length)highlights.unshift({view:'burden',text:`Highest reported cumulative burdens: ${leading.map(z=>`${z.location} (${formatValue(z.value)})${z.outgoing.length?`; leading outbound connection to ${z.outgoing[0].destination} (${formatValue(z.outgoing[0].value)} ${mobility.unit})`:'; no eligible positive outbound connection available'}`).join('. ')}.${leading.some(z=>z.outgoing.length)?` Movement observations: ${mobility.start}–${mobility.end}; historical connections do not establish current travel or transmission.`:''}`});
    paragraphs.push(...highlights.map(h=>h.text));
  }
  return {text:paragraphs.join('\n\n'),origin:'Summary from loaded data',...(monitoring?{highlights}:{})};
}
