import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createChainRpc, verifyChainTransfer } from '../src/payments/chain-receipt.mjs';
import { verifyHspQaPayment } from '../src/payments/hsp-qa-query.mjs';
import { reconcileHspQaPayment } from '../src/payments/hsp-qa-reconcile.mjs';
import { openHspQaOrders } from '../src/payments/hsp-qa-order.mjs';
import { openHspEvidenceStore } from '../src/payments/hsp-evidence-store.mjs';

const hex = (digit, bytes) => '0x' + digit.repeat(bytes * 2);
const expected = {
  chainId: 177, transactionHash: hex('a', 32), token: hex('b', 20),
  payer: hex('c', 20), payee: hex('d', 20), amount: '20000', minConfirmations: 5, earliestBlock: '9',
};
const block = { number: '0xa', hash: hex('e', 32) };
const log = {
  address: expected.token, topics: [
    '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
    '0x' + expected.payer.slice(2).padStart(64, '0'), '0x' + expected.payee.slice(2).padStart(64, '0'),
  ],
  data: '0x' + Number(expected.amount).toString(16).padStart(64, '0'),
  logIndex: '0x2', transactionHash: expected.transactionHash, blockNumber: block.number, blockHash: block.hash,
};
const receipt = { transactionHash: expected.transactionHash, status: '0x1', blockNumber: block.number, blockHash: block.hash, logs: [log] };
const authorization = { nonce: hex('8', 32), validAfter: '0', validBefore: '1795651800' };
const authorizationLog = {
  ...log, logIndex: '0x1', data: '0x',
  topics: ['0x98de503528ee59b575ef0c0a2576a82497bfc029a5685b209e9ec333479b10a5', log.topics[1], authorization.nonce],
};
const authorizedReceipt = { ...receipt, logs: [authorizationLog, log] };
const rpc = (overrides = {}) => async (method) => ({
  eth_chainId: '0xb1', eth_getTransactionReceipt: receipt, eth_blockNumber: '0xe',
  eth_getBlockByNumber: block, ...overrides,
})[method];

test('matches the exact ERC-20 transfer on a canonical HSK block', async () => {
  const result = await verifyChainTransfer(rpc(), expected);
  assert.equal(result.logIndex, '2');
  assert.equal(result.confirmations, '5');
  assert.equal(result.chainId, 177);
});

test('rejects mismatched, old, failed, duplicated and non-canonical evidence', async () => {
  for (const [overrides, expectation, error] of [
    [{ eth_chainId: '0x85' }, {}, /CHAIN_MISMATCH/],
    [{ eth_getTransactionReceipt: null }, {}, /RECEIPT_UNAVAILABLE/],
    [{ eth_getTransactionReceipt: { ...receipt, status: '0x0' } }, {}, /RECEIPT_UNAVAILABLE/],
    [{}, { earliestBlock: '11' }, /TRANSFER_PRECEDES_ORDER/],
    [{ eth_blockNumber: '0xd' }, {}, /INSUFFICIENT_CONFIRMATIONS/],
    [{ eth_getBlockByNumber: { ...block, hash: hex('f', 32) } }, {}, /BLOCK_NOT_CANONICAL/],
    [{}, { token: hex('1', 20) }, /TRANSFER_MISSING/],
    [{}, { payer: hex('1', 20) }, /TRANSFER_MISSING/],
    [{}, { payee: hex('1', 20) }, /TRANSFER_MISSING/],
    [{}, { amount: '20001' }, /TRANSFER_MISSING/],
    [{ eth_getTransactionReceipt: { ...receipt, logs: [log, log] } }, {}, /AMBIGUOUS/],
    [{ eth_getTransactionReceipt: { ...receipt, logs: [{ ...log, removed: true }] } }, {}, /TRANSFER_LOG_MISMATCH/],
  ]) {
    await assert.rejects(verifyChainTransfer(rpc(overrides), { ...expected, ...expectation }), error);
  }
});

test('RPC rejects an invalid response id', async () => {
  const request = createChainRpc('https://rpc.invalid', async () =>
    Response.json({ jsonrpc: '2.0', id: 2, result: '0xb1' }));
  await assert.rejects(request('eth_chainId'), /RPC_RESPONSE_ERROR/);
});

test('an attributed QA order commits the verified transaction and private salt to its revision', async () => {
  const order = {
    ...expected, atomicAmount: expected.amount, chainId: 133, flowId: 'flow-1', paymentRequestId: 'request-1', merchantName: 'Bill:ION',
    revisionCommitment: hex('1', 32), proofSalt: hex('2', 32), authorization,
  };
  const options = {
    order, rpc: rpc({ eth_chainId: '0x85', eth_getTransactionReceipt: authorizedReceipt }),
    query: async () => ({
      status: 'payment-safe', attribution_verified: true,
      payment: { flow_id: order.flowId, payment_request_id: order.paymentRequestId, tx_signature: expected.transactionHash },
    }),
  };
  const evidence = await verifyHspQaPayment(options);
  assert.equal(evidence.revision, order.revisionCommitment);
  assert.equal(evidence.transfer.transactionHash, expected.transactionHash);
  assert.equal(evidence.terms.amount, expected.amount);
  assert.equal(JSON.stringify(evidence).includes(order.proofSalt), false);
  assert.notEqual((await verifyHspQaPayment({ ...options, order: { ...order, proofSalt: hex('3', 32) } })).proof, evidence.proof);
  await assert.rejects(verifyHspQaPayment({ ...options, rpc: rpc({ eth_chainId: '0x85' }) }), /AUTHORIZATION_LOG_MISMATCH/);
  await assert.rejects(verifyHspQaPayment({
    ...options, order: { ...order, authorization: { ...authorization, nonce: hex('9', 32) } },
  }), /AUTHORIZATION_LOG_MISMATCH/);
});

test('reconciliation can recover after the evidence write but before the order state update', async (t) => {
  const orders = openHspQaOrders(':memory:');
  const evidenceStore = openHspEvidenceStore(':memory:');
  t.after(() => {
    orders.close();
    evidenceStore.close();
  });
  const order = {
    ...expected, atomicAmount: expected.amount, chainId: 133, flowId: 'flow-1', paymentRequestId: 'request-1', merchantName: 'Bill:ION',
    revisionCommitment: hex('1', 32), proofSalt: hex('2', 32), authorization, status: 'FINALIZATION_UNRESOLVED',
  };
  orders.reserve({ ...order, status: 'CREATING' });
  assert.equal(orders.transition(order, 'CREATING'), true);
  const revision = order.revisionCommitment;
  const options = {
    orders, evidenceStore, revision, rpc: rpc({ eth_chainId: '0x85', eth_getTransactionReceipt: authorizedReceipt }),
    query: async () => ({
      status: 'payment-safe', attribution_verified: true,
      payment: { flow_id: order.flowId, payment_request_id: order.paymentRequestId, tx_signature: expected.transactionHash },
    }),
  };
  await assert.rejects(reconcileHspQaPayment({ ...options, query: async () => ({ status: 'payment-included' }) }), /NOT_SAFE/);
  assert.equal(orders.read(revision).status, 'FINALIZATION_UNRESOLVED');
  await assert.rejects(reconcileHspQaPayment({
    ...options, orders: { read: orders.read, transition: () => { throw new Error('simulated interruption'); } },
  }), /simulated interruption/);
  assert.ok(evidenceStore.get(order.flowId));
  assert.equal(orders.read(revision).status, 'FINALIZATION_UNRESOLVED');
  const recovered = await reconcileHspQaPayment(options);
  assert.equal(recovered.created, false);
  assert.equal(recovered.status, 'VERIFIED');
  assert.equal(orders.read(revision).verifiedTransfer.transactionHash, expected.transactionHash);
  assert.equal((await reconcileHspQaPayment(options)).created, false);
});
