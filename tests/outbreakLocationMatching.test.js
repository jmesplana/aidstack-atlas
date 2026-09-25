import test from 'node:test';
import assert from 'node:assert/strict';
import { locationReference, locationResolver, reconcileLocations } from '../lib/outbreak/locationMatching.js';
import { epidemiology } from '../lib/outbreak/insights.js';
import { provinceCoverage, provinceHorizon } from '../lib/outbreak/areaHistory.js';

const geometry = names => ({type:'FeatureCollection',features:names.map(nom=>({properties:{nom,province:'Tshopo'}}))});
const row = (location,date,value) => ({location,date,value});
const source = records => ({id:'insp:cumulative_confirmed_cases',origin:'public',status:'ready',level:'health_zone',kind:'cumulative',purpose:'cases',records});
const match = (records,names) => reconcileLocations(source(records),geometry(names),'health_zone');

test('all six upstream case-history mismatches resolve; non-geographic records remain available',()=>{
  const variants={'Makiso-Kisangani':'Makiso Kisangani','Miti-Murhesa':'Miti Murhesa','Nia-Nia':'Nia Nia',Gethy:'Gety',Lubunga:'Lubunga (Tshopo)',Rumba:'Rimba'};
  const records=[...Object.keys(variants),'NA','Sans Fiche'].map(n=>row(n,'2026-09-21',1));
  const fixed=match(records,[...Object.values(variants),'Lubunga (Kasaï-Central)']);
  assert.deepEqual(fixed.records.map(r=>r.location),[...Object.values(variants),'NA','Sans Fiche']);
  assert.deepEqual(fixed.sourceRecords,records);
  assert.equal(fixed.locationMatching.locations.filter(r=>r.status==='Non-geographic source total').length,2);
  assert.equal(fixed.records.length,records.length);
});

test('Kisangani spelling change preserves history, growth and province coverage',()=>{
  const geo=geometry(['Makiso Kisangani']);
  const fixed=reconcileLocations(source([row('Makiso Kisangani','2026-07-18',3),row('Makiso-Kisangani','2026-07-25',5)]),geo,'health_zone');
  const epi=epidemiology([fixed],geo,'2026-07-25',null,'health_zone');
  assert.equal(epi.zones.length,1); assert.equal(epi.absent,0); assert.equal(epi.unmatched,0);
  assert.equal(epi.zones[0].delta,2); assert.equal(epi.total,5);
  const coverage=provinceCoverage(epi,geo,'health_zone');
  assert.equal(coverage.rows[0].cases,5); assert.equal(coverage.rows[0].affected,1);
  assert.equal(provinceHorizon(epi,coverage).groups[0].rows[0].values.at(-1),2);
});

test('duplicates are consolidated without summing; conflicts and missing values are not guessed',()=>{
  const records=[row('Makiso Kisangani','2026-09-01',3),row('Makiso-Kisangani','2026-09-01',3),row('Makiso Kisangani','2026-09-02',4),row('Makiso-Kisangani','2026-09-02',5),row('Makiso Kisangani','2026-09-03',null),row('Makiso-Kisangani','2026-09-03',6)];
  const fixed=match(records,['Makiso Kisangani']);
  assert.deepEqual(fixed.records.map(r=>r.value),[3,null,null]);
  assert.equal(fixed.locationMatching.duplicates,3);assert.equal(fixed.locationMatching.conflicts.length,2);
  assert.deepEqual(fixed.sourceRecords,records);
});

test('restored snapshots can be re-matched to old, new or absent geography without losing raw observations',()=>{
  const input=source([row('Makiso-Kisangani','2026-09-21',22)]);
  const fixed=reconcileLocations(input,geometry(['Makiso Kisangani']),'health_zone');
  assert.deepEqual(reconcileLocations(JSON.parse(JSON.stringify(fixed)),geometry(['Makiso Kisangani']),'health_zone'),fixed);
  const old=reconcileLocations(fixed,geometry(['Makiso-Kisangani']),'health_zone');
  assert.deepEqual(old.records,input.records);
  assert.deepEqual(reconcileLocations(fixed,null,'health_zone').records,input.records);
  assert.equal(input.sourceRecords,undefined);
});

test('documented aliases match older boundary spellings in both directions',()=>{
  const fixed=match([row('Gety','2026-09-21',7)],['Gethy']);
  assert.equal(fixed.records[0].location,'Gethy');
});

test('case, accents and hyphens normalize only when the boundary match is unique',()=>{
  const resolve=locationResolver(geometry(['Équateur Nord','A-B','A B','Lubunga (Tshopo)','Lubunga (Kasaï-Central)']));
  assert.equal(resolve(' equateur–nord ').location,'Équateur Nord');
  assert.equal(resolve('a b').status,'Ambiguous boundary name');
  assert.equal(resolve('A-B').location,'A-B');
  assert.equal(resolve('Lubunga').location,null);
  assert.equal(resolve('Equater Nord').location,null);
});

test('INSP aliases never apply to unrelated uploads or other geographic levels',()=>{
  const records=[row('Lubunga','2026-09-21',1),row('Gethy','2026-09-21',2)];
  const geo=geometry(['Lubunga (Tshopo)','Gety']);
  const uploaded=reconcileLocations({...source(records),origin:'upload'},geo,'health_zone');
  assert.deepEqual(uploaded.records,records);
  for(const level of ['national','province','site']) {
    const fixed=reconcileLocations({...source(records),level},geo,'health_zone');
    assert.deepEqual(fixed.records,records);assert.equal(fixed.locationMatching,undefined);
  }
});

test('unknown locations are retained and reported without a speculative match',()=>{
  const fixed=match([row('Kisangani','2026-09-21',5)],['Makiso Kisangani']);
  assert.equal(fixed.records[0].value,5);
  assert.equal(fixed.locationMatching.locations[0].status,'No matching boundary');
});

test('another country can use its own reference config without changing matching code',()=>{
  const references=[{id:'other-country',label:'Other country districts',appliesTo:{origin:'public',idPrefix:'other:',levels:['district']},aliases:{'Old district':'New district'},nonGeographicNames:['Unallocated'],source:'https://example.org/reference'}];
  const dataset={...source([row('Old district','2026-09-21',5),row('Unallocated','2026-09-21',2)]),id:'other:cases',level:'district'};
  const fixed=reconcileLocations(dataset,geometry(['New district']),'district',references);
  assert.equal(fixed.records[0].location,'New district');
  assert.equal(fixed.locationMatching.referenceId,'other-country');
  assert.equal(fixed.locationMatching.locations[1].status,'Non-geographic source total');
  assert.equal(locationReference(dataset),null);
  assert.equal(locationReference(dataset,[references[0],{...references[0],id:'conflicting-reference'}]),null);
  const replaced=reconcileLocations(fixed,geometry(['Different district']),'district',references);
  assert.equal(replaced.records[0].location,'Old district');
  assert.equal(replaced.locationMatching.locations[0].status,'No matching boundary');
});
