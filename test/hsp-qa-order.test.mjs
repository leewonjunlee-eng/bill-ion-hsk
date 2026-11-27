import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHspQaOrder, openHspQaOrders } from '../src/payments/hsp-qa-order.mjs';

const now = Date.parse('2026-11-26T00:00:00Z');
const address = (digit) => '0x' + digit.repeat(40);
const approval = {
  chainId: 133, payer: address('1'), payee: address('2'), token: address('3'),
  revisionCommitment: '0x' + 'a'.repeat(64), merchantName: 'Bill:ION', atomicAmount: '20000',
  validUntil: new Date(now + 120_000).toISOString(),
};
const rpc = async (method) => method === 'eth_chainId' ? '0x85' : '0x20';
const config = {
  networks: [{ chain_id: 133, name: 'hashkey-testnet', is_testnet: true }],
  tokens: [{ address: approval.token, chain_id: 133, symbol: 'USDC', payment_protocol: 'eip3009', decimals: 6 }],
};

test('persists before sending, transfers no funds, and does not repeat an ambiguous order', async (t) => {
  const store = openHspQaOrders(':memory:');
  t.after(() => store.close());
  let creates = 0;
  const call = async (method, args) => {
    if (method === 'get_chain_config') return config;
    assert.equal(method, 'create_order');
    creates++;
    const mandate = args.cart_mandate.contents;
    const saved = store.read(approval.revisionCommitment);
    assert.equal(saved.status, 'CREATING');
    assert.equal(saved.paymentRequestId, mandate.payment_request.details.id);
    assert.equal(saved.earliestBlock, '33');
    assert.deepEqual(mandate.payment_request.details.total.amount, { currency: 'USD', value: '0.02' });
    throw new Error('connection lost after request');
  };
  const options = { call, rpc, store, approval, clock: () => now };
  assert.equal((await createHspQaOrder(options)).status, 'UNKNOWN');
  const result = await createHspQaOrder(options);
  assert.equal(result.status, 'UNKNOWN');
  assert.equal(creates, 1);
  await assert.rejects(createHspQaOrder({ ...options, approval: { ...approval, atomicAmount: '30000' } }), /TERMS_CONFLICT/);
});

test('reuses one reservation for concurrent requests and saves the gateway flow link', async (t) => {
  const store = openHspQaOrders(':memory:');
  t.after(() => store.close());
  const calls = [];
  const call = async (method, args) => {
    calls.push(method);
    if (method === 'get_chain_config') return config;
    return { flow_id: 'flow-1', payment_request_id: args.cart_mandate.contents.payment_request.details.id };
  };
  const options = { call, rpc, store, approval, clock: () => now };
  const [a, b] = await Promise.all([createHspQaOrder(options), createHspQaOrder(options)]);
  assert.equal(a.paymentRequestId, b.paymentRequestId);
  assert.equal(calls.filter((method) => method === 'create_order').length, 1);
  assert.equal(store.read(approval.revisionCommitment).flowId, 'flow-1');
  assert.equal((await createHspQaOrder(options)).status, 'ORDER_CREATED');
});

test('a second revision cannot start another QA order for an already reserved room', async (t) => {
  const store = openHspQaOrders(':memory:');
  t.after(() => store.close());
  const call = async (method) => {
    if (method === 'get_chain_config') return config;
    throw new Error('response lost');
  };
  const participants = [approval.payer, approval.payee, address('4')];
  const base = { ...approval, roomId: 'same-room', version: 1 };
  store.publishRevision({ ...base, participants });
  const options = { call, rpc, store, approval: base, clock: () => now };
  assert.equal((await createHspQaOrder(options)).status, 'UNKNOWN');
  await assert.rejects(createHspQaOrder({
    ...options, approval: { ...base, revisionCommitment: '0x' + 'b'.repeat(64) },
  }), /STALE_OR_UNPUBLISHED_REVISION/);
  assert.throws(() => store.publishRevision({
    ...base, participants, version: 2, revisionCommitment: '0x' + 'b'.repeat(64),
  }), /ROOM_ALREADY_RESERVED/);
});

test('a revision changed while checking the gateway cannot reserve or create an order', async (t) => {
  const store = openHspQaOrders(':memory:');
  t.after(() => store.close());
  const base = { ...approval, roomId: 'same-room', version: 1 };
  const participants = [approval.payer, approval.payee, address('4')];
  store.publishRevision({ ...base, participants });
  const next = { ...base, participants, version: 2, revisionCommitment: '0x' + 'c'.repeat(64) };
  const call = async (method) => {
    assert.equal(method, 'get_chain_config');
    store.publishRevision(next);
    return config;
  };
  await assert.rejects(createHspQaOrder({ call, rpc, store, approval: base, clock: () => now }), /STALE_OR_UNPUBLISHED_REVISION/);
  assert.equal(store.read(base.revisionCommitment), null);
  assert.throws(() => store.publishRevision({ ...base, participants }), /REVISION_NOT_NEWER/);
  assert.throws(() => store.publishRevision({
    ...next, version: 3, participants: [approval.payer, approval.payee, address('5')],
  }), /ROSTER_CHANGED/);
});
