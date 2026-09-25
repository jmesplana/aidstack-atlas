import test from 'node:test';
import assert from 'node:assert/strict';
import { actionEvidence, evidenceKey, validEvidencePackage, validateActions, fallbackActions, toSuggestion } from '../lib/outbreak/actionPlan.js';

const epi={date:'2026-09-21',baseline:'2026-09-14',total:120,missing:1,absent:0,
  affected:[{location:'Bunia'},{location:'Mambasa'}],
  growth:[{location:'Bunia',province:'Ituri',previous:80,value:100,delta:20,baseline:'2026-09-14',date:'2026-09-21'},{location:'Mambasa',previous:20,value:20,delta:0}],
  burden:[{location:'Bunia',province:'Ituri',value:100,date:'2026-09-21'},{location:'Mambasa',value:20,date:'2026-09-21'}]};
const mobility={start:'2026-08-01',end:'2026-08-31',unit:'trips',routes:[{origin:'Bunia',destination:'Aru',value:340},{origin:'Aru',destination:'Bunia',value:10}]};
const evidence=actionEvidence({epi,alerts:[{location:'Mambasa',date:'2026-09-19',priorZero:true}],mobility,asOf:'2026-09-21',
  actions:[{status:'Proposed',owner:'',due:'',location:'Bunia',action:'Review contact tracing'}]});
const id=text=>evidence.find(e=>e.text.includes(text)).id;

test('evidence package cites dated facts, flags gaps and puts plan items last',()=>{
  assert.ok(validEvidencePackage(evidence));
  assert.match(evidence.find(e=>e.kind==='growth').text,/80 on 2026-09-14 → 100 on 2026-09-21 \(\+20\)/);
  assert.deepEqual(evidence.find(e=>e.kind==='mobility').areas,['Bunia','Aru']);
  assert.ok(evidence.some(e=>e.kind==='gap'&&/security/.test(e.text)));
  assert.equal(evidence.at(-1).kind,'plan');
  const withMore=actionEvidence({epi,alerts:[{location:'Mambasa',date:'2026-09-19',priorZero:true}],mobility,asOf:'2026-09-21',actions:[]});
  assert.equal(evidenceKey(withMore),evidenceKey(evidence),'plan changes do not invalidate a draft');
});

test('validation keeps grounded actions and drops invented evidence, areas and numbers',()=>{
  const base={pillar:'surveillance',urgency:'24h',confidence:'high',rationale:'Bunia rose by 20 in seven days.',dataNeeded:''};
  const raw={actions:[
    {...base,rationale:'First positive report on 2026-09-19.',title:'Investigate new cases in Mambasa',areas:['Mambasa'],evidence:[id('first positive')],action:'Deploy an investigation team within 48 hours.',urgency:'72h'},
    {...base,title:'Reinforce Bunia surveillance',areas:['Bunia'],evidence:[id('→ 100')],action:'Confirm 21-day follow-up of listed contacts.'},
    {...base,title:'Unknown evidence',areas:['Bunia'],evidence:['E99'],action:'x'},
    {...base,title:'Invented area',areas:['Kinshasa'],evidence:[id('→ 100')],action:'x'},
    {...base,title:'Invented number',areas:['Bunia'],evidence:[id('→ 100')],action:'Vaccinate 5,000 people.'},
    {...base,title:'Bad pillar',pillar:'magic',areas:[],evidence:[id('→ 100')],action:'x'}
  ],dataGaps:['Vaccination coverage in Bunia is unknown.','Only 3,000 contacts listed.']};
  const {actions,dataGaps}=validateActions(raw,evidence);
  assert.deepEqual(actions.map(a=>a.title),['Reinforce Bunia surveillance','Investigate new cases in Mambasa']);
  assert.deepEqual(dataGaps,['Vaccination coverage in Bunia is unknown.']);
  const suggestion=toSuggestion(actions[0],evidence);
  assert.match(suggestion.why,/→ 100/);
  assert.match(suggestion.action,/AI-drafted/);
});

test('rule-based fallback keeps the original suggestion identity',()=>{
  const [item]=fallbackActions([{title:'Check response capacity',areas:['Bunia'],why:'Bunia: 100',action:'Confirm caseloads.'}]);
  assert.deepEqual(toSuggestion(item),{title:'Check response capacity',areas:['Bunia'],why:'Bunia: 100',action:'Confirm caseloads.'});
  assert.equal(validEvidencePackage([{id:'bad',kind:'x',text:'',areas:[]}]),false);
});
