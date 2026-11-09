import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {createExtractStore}=require('../lib/osm/extractStore.cjs');
const {createOverpassClient}=require('../lib/osm/overpassClient.cjs');
test('public road extracts survive process-cache loss, expire, and reject incomplete responses',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'atlas-osm-extract-'));let clock=Date.now();
 try{
  const store=createExtractStore({directory,now:()=>clock});
  const data={elements:[{type:'way',id:9,nodes:[1,2],geometry:[{lon:7,lat:46},{lon:7.1,lat:46}]}]};
  assert.equal(await store.set('test-query',data),true);
  const fresh=createExtractStore({directory,now:()=>clock});
  const client=createOverpassClient({durable:fresh,storage:{getCachedOSM:async()=>null,setCachedOSM:async()=>{}},fetchImpl:async()=>assert.fail('must reuse disk extract')});
  assert.deepEqual(await client('test-query'),data);
  assert.equal(await fresh.set('test-query',{elements:[],remark:'runtime error'}),false);
  assert.deepEqual((await fresh.get('test-query')).data,data);
  assert.equal(await fresh.get('different-query'),null);
  clock+=86400001;assert.equal(await fresh.get('test-query'),null);
  assert.equal((await fresh.list()).length,1,'expired data stays available to the refresh job');
 }finally{await rm(directory,{recursive:true,force:true});}
});
