import test from 'node:test';
import assert from 'node:assert/strict';
import { reportingSlideDeck, rateChangeLabel } from '../lib/outbreak/reportingBriefing.js';

const rows=Array.from({length:9},(_,i)=>({location:`Zone ${i}`,province:i<5?'East':'West',age:i<7?0:30,sustainedIncrease:i<7,visibilityLost:i>=7,lastTrend:{observations:[{rate:i+1}]}}));
test('grouped decks summarize both criteria and never mix provinces on detail pages',()=>{
  const deck=reportingSlideDeck(rows,{mode:'sustained',grouped:true});
  assert.equal(deck.total,9);assert.equal(deck.matching,7);assert.equal(deck.pages.length,4);
  assert.deepEqual(deck.provinces,[{province:'East',total:5,sustained:5,lost:0,unavailable:0},{province:'West',total:4,sustained:2,lost:2,unavailable:0}]);
  assert.equal(deck.pages[0].kind,'summary');
  for(const page of deck.pages.slice(1)){
    assert.ok(page.rows.length<=4);assert.ok(page.rows.every(r=>r.province===page.province));
  }
  assert.deepEqual(deck.pages.slice(1).map(p=>p.rows.length),[4,1,2]);
  assert.equal(deck.pages[1].rows[0].location,'Zone 4');
  const lost=reportingSlideDeck(rows,{mode:'lost',grouped:true,province:'West'});
  assert.equal(lost.total,4);assert.equal(lost.matching,2);
  assert.deepEqual(lost.pages[1].rows.map(r=>r.location),['Zone 8','Zone 7']);
});
test('summary pagination includes zero matches and keeps unmapped source locations separate',()=>{
  const source=Array.from({length:9},(_,i)=>({location:`Z${i}`,province:`Province ${i}`,age:0}));
  source.push({location:'Unknown',province:null,matched:false,age:null});
  const deck=reportingSlideDeck(source,{mode:'sustained',grouped:true});
  assert.equal(deck.matching,0);assert.equal(deck.pages.length,2);
  assert.deepEqual(deck.pages.map(p=>p.summaries.length),[8,2]);
  assert.equal(deck.provinces.find(p=>p.province==='Unmapped source locations').unavailable,1);
  const empty=reportingSlideDeck(source,{mode:'sustained',grouped:false});
  assert.deepEqual(empty.pages[0].rows,[]);assert.equal(empty.pages[0].total,0);
});
test('rebuilding the deck reflects refreshed evidence and shrinking filters without mutating inputs',()=>{
  const initial=reportingSlideDeck(rows,{mode:'sustained',grouped:true});
  const refreshed=rows.map(r=>({...r,sustainedIncrease:false,visibilityLost:true,age:30}));
  assert.equal(reportingSlideDeck(refreshed,{mode:'sustained',grouped:true}).matching,0);
  assert.equal(reportingSlideDeck(refreshed,{mode:'lost',grouped:true}).matching,9);
  assert.equal(initial.matching,7);assert.equal(rows[0].location,'Zone 0');
  const availability=reportingSlideDeck(rows,{selected:'Zone 0'});
  assert.equal(availability.pages[0].rows[0].location,'Zone 0');assert.equal(availability.pages[0].rows.length,6);
  assert.equal(reportingSlideDeck(rows,{mode:'sustained',grouped:true,province:'West'}).pages.length,2);
});
test('rate percentages retain count context and never invent a percentage from zero',()=>{
  assert.equal(rateChangeLabel(null,0),'from zero; % undefined');
  assert.equal(rateChangeLabel(200,1),'+200%');assert.equal(rateChangeLabel(-25,4),'-25%');
});
