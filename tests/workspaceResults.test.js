import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createModuleStorage } from '../lib/platform/moduleStorage.js';
import { createWorkspaceResults } from '../lib/platform/workspaceResults.js';
import { handleAppRequest } from '../lib/platform/appBridge.js';

const result = { kind: 'access-gaps', schemaVersion: 1, method: 'road-network-v1', computedAt: '2026-01-01', scope: { areas: [] }, totals: { population: 10 } };
test('publication is explicit, immutable, workspace scoped and separate from private module plans', async () => {
  const store = createModuleStorage({ workspaceId: 'A', moduleId: 'access-gaps' });
  const publisher = createWorkspaceResults({ workspaceId: 'A', moduleId: 'access-gaps' });
  const consumer = createWorkspaceResults({ workspaceId: 'A', moduleId: 'immunization' });
  let plan = await store.savePlan({ id: 'assessment', metadata: { name: 'Access' }, result });
  assert.deepEqual(await consumer.list(), []);
  assert.equal(consumer.publish, undefined);
  const published = await publisher.publish(plan);
  assert.deepEqual(await createModuleStorage({ workspaceId: 'A', moduleId: 'workspace-results' }).listPlans(), []);
  assert.equal((await consumer.list()).length, 1);
  assert.deepEqual(await publisher.publish(plan), published);
  assert.equal(await createWorkspaceResults({ workspaceId: 'B', moduleId: 'immunization' }).load(published.id), undefined);
  assert.equal(await createModuleStorage({ workspaceId: 'A', moduleId: 'immunization' }).loadPlan(plan.id), undefined);
  plan = await store.savePlan({ ...plan, result: { ...result, totals: { population: 20 } } }, plan.revision);
  assert.equal((await consumer.load(published.id)).result.totals.population, 10);
  await assert.rejects(publisher.publish({ ...plan, revision: 1 }), /changed/);
  await assert.rejects(publisher.publish({ ...plan, result }), /changed/);
  assert.equal((await publisher.publish(plan)).source.revision, 2);
  const attached = await consumer.load(published.id);
  await publisher.withdraw(published.id);
  assert.equal(await consumer.load(published.id), undefined);
  assert.equal(attached.result.totals.population, 10);
  assert.equal((await consumer.list()).length, 1);
});
test('unsupported modules and iframe bridge cannot access shared results or another module storage', async () => {
  assert.equal(createWorkspaceResults({ workspaceId: 'A', moduleId: 'uploaded-app' }), undefined);
  const context = { manifest: { capabilities: ['write:plans'] }, workspaceId: 'A', districts: [], facilities: [], storage: createModuleStorage({ workspaceId: 'A', moduleId: 'uploaded-app' }), setDirty() {} };
  for (const method of ['listResults', 'publish', 'loadResult', 'withdraw']) await assert.rejects(handleAppRequest({ method }, context), /Unsupported/);
  assert.deepEqual(await handleAppRequest({ method: 'workspace' }, context), { workspaceId: 'A', districts: [], facilities: [] });
});
