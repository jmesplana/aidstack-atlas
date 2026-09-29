import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { clipMapRing, slideMapGeography } from '../lib/outbreak/slideMapGeography.js';
import { placeLabels } from '../lib/outbreak/mapInteraction.js';

const countries=JSON.parse(fs.readFileSync(new URL('../lib/outbreak/countries.json',import.meta.url))).features;
const admin1=JSON.parse(fs.readFileSync(new URL('../lib/outbreak/admin1.json',import.meta.url))).features;
const square=(name,w,s,e,n)=>({properties:{nom:name},geometry:{type:'Polygon',coordinates:[[[w,s],[e,s],[e,n],[w,n],[w,s]]]}});
const geometry={features:[square('Border area',29,1,30,2)]},rows=[{location:'Border area'}];

test('border-area slide maps retain neighbouring countries whose source label is outside the viewport',()=>{
  const g=slideMapGeography({geometry,rows,countries,admin1});
  const uganda=countries.find(f=>f.properties.name==='Uganda');
  assert.ok(uganda.properties.label[0]>g.geoView[2]);
  assert.ok(g.contextLabels.some(f=>f.fullName==='Uganda'));
  assert.ok(g.contextLabels.some(f=>f.fullName==='Democratic Republic of the Congo'));
  assert.ok(g.provinces.some(f=>f.country==='Uganda'));
  for(const f of g.contextLabels){assert.ok(f.center[0]>=45&&f.center[0]<=670);assert.ok(f.center[1]>=230&&f.center[1]<=710);}
  const candidates=[...g.shapes,...g.contextLabels];
  const labels=placeLabels(candidates,[45,230,625,480],'',new Set(candidates.map(f=>f.name)),1,[625,480]);
  assert.ok(labels.some(f=>f.name==='Border area'));
  assert.ok(labels.some(f=>f.fullName==='Uganda'));
});
test('context does not expand the viewport to remote countries or replace loaded boundaries',()=>{
  const g=slideMapGeography({geometry,rows,countries,admin1});
  assert.deepEqual(g.shapes.map(f=>f.name),['Border area']);
  assert.ok(!g.countries.some(f=>f.name==='Brazil'));
  const extra={features:[...geometry.features,square('Remote',-70,-10,-69,-9)]};
  assert.deepEqual(slideMapGeography({geometry:extra,rows,countries,admin1}).geoView,g.geoView);
  assert.equal(slideMapGeography({rows:[],countries,admin1}).shapes.length,0);
});
test('country clipping handles a viewport inside a large polygon and disjoint polygons',()=>{
  const clipped=clipMapRing([[-100,-100],[100,-100],[100,100],[-100,100]],[0,0,10,10]);
  assert.equal(clipped.length,4);
  assert.ok(clipped.every(([x,y])=>x>=0&&x<=10&&y>=0&&y<=10));
  assert.deepEqual(clipMapRing([[20,20],[30,20],[30,30],[20,30]],[0,0,10,10]),[]);
});

test('evidence maps fill the panel while national rings fit the full DRC even with partial coverage',()=>{
  const g=slideMapGeography({geometry,rows,countries,admin1});
  assert.ok(1/(g.geoView[3]-g.geoView[1])>.9,'Evidence area should occupy over 90% of map height');
  const fitCountry='Democratic Republic of the Congo';
  const national=slideMapGeography({geometry,rows,countries,admin1,fitCountry,width:640,height:501});
  const country=countries.find(f=>f.properties.name===fitCountry);
  const coordinates=country.geometry.type==='Polygon'?country.geometry.coordinates.flat():country.geometry.coordinates.flat(2);
  const xs=coordinates.map(p=>p[0]),ys=coordinates.map(p=>p[1]);
  assert.ok(national.geoView[0]<=Math.min(...xs)&&national.geoView[2]>=Math.max(...xs));
  assert.ok(national.geoView[1]<=Math.min(...ys)&&national.geoView[3]>=Math.max(...ys));
  const coverage=Math.max((Math.max(...xs)-Math.min(...xs))/(national.geoView[2]-national.geoView[0]),(Math.max(...ys)-Math.min(...ys))/(national.geoView[3]-national.geoView[1]));
  assert.ok(coverage>.9,'DRC should fill over 90% of one map dimension');
  assert.deepEqual(slideMapGeography({geometry:{features:[square('Elsewhere',12,-5,13,-4)]},rows:[{location:'Elsewhere'}],countries,admin1,fitCountry,width:640,height:501}).geoView,national.geoView);
});
