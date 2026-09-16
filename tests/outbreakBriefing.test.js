import test from 'node:test';
import assert from 'node:assert/strict';
import { evidenceReadiness, comparisonRecord, actionFollowUp } from '../lib/outbreak/briefing.js';

test('readiness excludes future observations and distinguishes missing from zero and older reports',()=>{
  const [source]=evidenceReadiness([{id:'cases',label:'Cases',source:'Upload',records:[{location:'A',date:'2026-09-01',value:0},{location:'B',date:'2026-09-08',value:null},{location:'C',date:'2026-09-10',value:100}]}],'2026-09-08');
  assert.equal(source.available,1);assert.equal(source.missing,1);assert.equal(source.older,1);assert.equal(source.end,'2026-09-08');
});
test('comparison capture does not recursively nest snapshots',()=>{
  const copy=comparisonRecord({id:'a',asOf:'2026-09-01',datasets:[],actions:[],comparison:{id:'b'}});
  assert.equal(copy.id,'a');assert.equal(copy.comparison,undefined);
});
test('follow-up counts approved work as open but excludes completed work',()=>{
  assert.deepEqual(actionFollowUp([{status:'Approved',owner:'',due:'2026-09-01'},{status:'Completed',due:'2026-09-01'},{status:'Blocked',owner:'Coordinator',due:''}],'2026-09-08'),{unassigned:1,undated:1,overdue:1,blocked:1});
});
