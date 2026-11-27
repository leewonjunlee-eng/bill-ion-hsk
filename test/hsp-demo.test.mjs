import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.mjs';
import { MemoryStore } from '../src/store/memory.mjs';
import { openHspDemoStore } from '../src/payments/hsp-demo-store.mjs';
import { Wallet } from 'ethers';
import { prepareQaManifestFromRoom } from '../src/payments/hsp-room-manifest.mjs';
import { verifyHspQaApproval } from '../src/payments/hsp-qa-approval.mjs';
import { createQaApprovalDescription } from '../src/payments/hsp-qa-browser-approval.mjs';
import { openHspQaOrders } from '../src/payments/hsp-qa-order.mjs';

const room = '/api/hsp-demo/rooms/shared-receipt';
const enabled = { DEV_SEED: '1', BILLION_HSP_DEMO: '1' };

async function start(t, options = {}) {
  const server = createApp({ store: new MemoryStore(), env: enabled, ...options });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return async (path, uid, body) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        ...(uid ? { 'x-demo-user': uid } : {}),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, data: await response.json() };
  };
}

const payload = ({ id, hash }) => ({ snapshotId: id, snapshotHash: hash, edgeId: 'b-to-a' });
const approve = (request, { id, hash }, uid) => request(`${room}/snapshots/${id}/approvals`, uid, { snapshotHash: hash });
const pay = (request, snapshot, uid = 'b') => request(`${room}/payments`, uid, payload(snapshot));

async function revise(request, snapshot) {
  const { id: snapshotId, hash: snapshotHash } = snapshot;
  const result = await request(`${room}/revise`, 'b', { snapshotId, snapshotHash });
  assert.equal(result.status, 200);
  return result.data.current;
}

test('the local demo requires opt-in and room membership', async (t) => {
  const disabled = await start(t, { env: { ...enabled, NODE_ENV: 'production' } });
  assert.equal((await disabled(room, 'a')).status, 404);
  const request = await start(t);
  assert.equal((await request(room)).status, 401);
  assert.equal((await request(room, 'outsider')).status, 404);
  assert.equal((await request(room, 'a')).data.mode, 'mock');
  assert.equal((await request('/api/rooms/shared-receipt/invoices/send', 'a', {})).status, 404);
});

test('a revised receipt needs fresh approval from all three members and the payer reserves once', async (t) => {
  let calls = 0;
  let releaseOrder;
  const gatewayResponse = new Promise((resolve) => { releaseOrder = resolve; });
  const request = await start(t, { createMockOrder: async (order) => {
    calls += 1;
    assert.equal(order.atomicAmount, '20000');
    assert.equal(order.status, 'CREATING');
    return gatewayResponse;
  } });
  const v1 = (await request(room, 'a')).data.current;
  for (const uid of ['a', 'b', 'c']) assert.equal((await approve(request, v1, uid)).status, 200);
  assert.equal((await pay(request, v1)).data.error, 'DISPUTE_OPEN');
  const v2 = await revise(request, v1);
  assert.deepEqual(v2.shares, { a: 7, b: 4, c: 7 });
  assert.equal((await pay(request, v1)).data.error, 'STALE_SNAPSHOT');
  assert.equal((await approve(request, v1, 'c')).data.error, 'STALE_SNAPSHOT');
  assert.equal((await approve(request, { ...v2, hash: v1.hash }, 'a')).data.error, 'HASH_MISMATCH');
  assert.equal((await request(`${room}/payments`, 'b', { ...payload(v2), amount: '999' })).status, 400);
  await approve(request, v2, 'a');
  await approve(request, v2, 'a');
  await approve(request, v2, 'b');
  assert.equal((await pay(request, v2)).data.error, 'APPROVALS_MISSING');
  assert.equal(calls, 0);
  await approve(request, v2, 'c');
  assert.equal((await pay(request, v2, 'a')).status, 403);
  assert.equal((await request(`${room}/payments`, 'b', { ...payload(v2), edgeId: 'c-to-a' })).data.error, 'EDGE_NOT_PAYABLE');

  const first = pay(request, v2);
  try {
    let creating;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      creating = (await request(room, 'b')).data.payment;
      if (creating) break;
    }
    assert.equal(creating?.status, 'CREATING');
    const duplicates = await Promise.all(Array.from({ length: 19 }, () => pay(request, v2)));
    assert.ok(duplicates.every(({ status, data }) => status === 200 && data.id === creating.id));
    assert.equal(calls, 1);
  } finally {
    releaseOrder({ id: 'mock-order-one' });
  }
  const result = await first;
  assert.equal(result.status, 201);
  assert.equal(result.data.status, 'ORDER_CREATED');
  assert.equal((await pay(request, v2)).data.id, result.data.id);
});

test('an ambiguous adapter response keeps the same reservation after expiry', async (t) => {
  let now = Date.parse('2026-11-26T00:00:00Z');
  let calls = 0;
  const request = await start(t, { clock: () => new Date(now), createMockOrder: async () => {
    calls += 1;
    throw new Error('simulated timeout');
  } });
  const v2 = await revise(request, (await request(room, 'a')).data.current);
  for (const uid of ['a', 'b', 'c']) await approve(request, v2, uid);
  const first = (await pay(request, v2)).data;
  assert.equal(first.status, 'UNKNOWN');
  now += 25 * 60 * 60 * 1000;
  assert.equal((await approve(request, v2, 'c')).data.error, 'SNAPSHOT_EXPIRED');
  assert.deepEqual((await pay(request, v2)).data, first);
  assert.equal(calls, 1);
});

test('a persisted reservation is shared by two servers and is restored on reopening the database', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'bellion-hsp-'));
  const filename = join(directory, 'state.sqlite');
  const firstStore = openHspDemoStore(filename);
  const secondStore = openHspDemoStore(filename);
  t.after(async () => {
    firstStore.close();
    secondStore.close();
    await rm(filename, { force: true });
    await rmdir(directory);
  });
  let calls = 0;
  const createMockOrder = async () => {
    calls += 1;
    return { id: 'persisted-order' };
  };
  const first = await start(t, { hspDemoStore: firstStore, createMockOrder });
  const second = await start(t, { hspDemoStore: secondStore, createMockOrder });
  const v2 = await revise(first, (await first(room, 'a')).data.current);
  for (const uid of ['a', 'b', 'c']) assert.equal((await approve(second, v2, uid)).status, 200);
  const results = await Promise.all(Array.from({ length: 20 }, (_, i) => pay(i % 2 ? first : second, v2)));
  assert.equal(results.filter(({ status }) => status === 201).length, 1);
  assert.equal(new Set(results.map(({ data }) => data.id)).size, 1);
  assert.equal(calls, 1);

  const reopened = openHspDemoStore(filename);
  try {
    const restarted = await start(t, { hspDemoStore: reopened, createMockOrder });
    assert.deepEqual((await restarted(room, 'a')).data.approvals, ['a', 'b', 'c']);
    assert.equal((await pay(restarted, v2)).data.orderId, 'persisted-order');
    assert.equal(calls, 1);
  } finally {
    reopened.close();
  }
});

test('QA manifest is derived from the revised stored room and still requires wallet signatures', async (t) => {
  const roomStore = openHspDemoStore(':memory:');
  t.after(() => roomStore.close());
  const orders = openHspQaOrders(':memory:');
  t.after(() => orders.close());
  const request = await start(t, { hspDemoStore: roomStore, hspQaApproval: createQaApprovalDescription(orders) });
  const [a, b, c] = Array.from({ length: 3 }, () => Wallet.createRandom());
  const config = {
    chainId: 133, token: '0x' + '1'.repeat(40), merchantName: 'Bill:ION',
    wallets: { a: a.address, b: b.address, c: c.address }, atomicAmount: '9990000',
  };
  const v1 = (await request(room, 'a')).data.current;
  assert.throws(() => prepareQaManifestFromRoom({ roomStore, config }), /REVISION_NOT_READY/);
  const v2 = await revise(request, v1);
  const { manifest, message, approval, participants } = prepareQaManifestFromRoom({ roomStore, config });
  assert.equal(manifest.atomicAmount, '20000');
  assert.equal(manifest.version, v2.version);
  assert.equal(manifest.payer, b.address);
  assert.notEqual(manifest.snapshotCommitment, '0x' + v2.hash);
  assert.deepEqual(prepareQaManifestFromRoom({ roomStore, config }).approval, approval);
  assert.throws(() => prepareQaManifestFromRoom({ roomStore, config: { ...config, merchantName: 'Other' } }), /ALREADY_EXPORTED/);
  for (const uid of ['a', 'b', 'c']) await approve(request, v2, uid);
  assert.throws(() => verifyHspQaApproval(manifest, []), /ALL_APPROVALS_REQUIRED/);
  const signatures = await Promise.all([a, b, c].map((wallet) => wallet.signMessage(message)));
  assert.deepEqual(verifyHspQaApproval(manifest, signatures), approval);
  const descriptionPath = '/api/hsp-demo/approval-description';
  assert.equal((await request(descriptionPath, 'a', manifest)).status, 400);
  orders.publishRevision({ ...approval, participants });
  assert.equal((await request(descriptionPath, 'a', manifest)).data.message, message);
  assert.equal((await request(descriptionPath, 'a', { ...manifest, atomicAmount: '30000' })).status, 400);
});
