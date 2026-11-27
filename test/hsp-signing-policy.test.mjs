import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Wallet } from 'ethers';
import { validateHspSigningRequest } from '../src/payments/hsp-signing-policy.mjs';
import { prepareHspQaSigningRequest, verifyHspQaWalletSignature } from '../src/payments/hsp-qa-prepare.mjs';
import { createHspQaOrder, openHspQaOrders } from '../src/payments/hsp-qa-order.mjs';
import { submitHspQaPayment } from '../src/payments/hsp-qa-submit.mjs';
import { describeHspQaApproval, verifyHspQaApproval } from '../src/payments/hsp-qa-approval.mjs';
import { reconcileHspQaPayment } from '../src/payments/hsp-qa-reconcile.mjs';
import { openHspEvidenceStore } from '../src/payments/hsp-evidence-store.mjs';

const now = Date.parse('2026-11-26T00:00:00Z');
const addr = (digit) => '0x' + digit.repeat(40);
const terms = {
  payer: addr('1'), payee: addr('2'), token: addr('3'), chainId: 133, domainName: 'USDC',
  domainVersion: '2', atomicAmount: '20000', validUntil: new Date(now + 600_000).toISOString(), paymentRequestId: 'order-a',
};
const fields = (entries) => entries.map(([name, type]) => ({ name, type }));
const enoughBalance = async (method) => method === 'eth_chainId' ? '0x85' : '0x' + 'f'.repeat(64);
function fixture(termsForFixture = terms) {
  const terms = termsForFixture;
  const message = {
    from: terms.payer, to: terms.payee, value: terms.atomicAmount, validAfter: '0',
    validBefore: String(now / 1000 + 450), nonce: '0x' + 'a'.repeat(64),
  };
  const paymentPayload = {
    x402Version: 2, accepted: { scheme: 'exact', network: 'eip155:133', amount: terms.atomicAmount,
      asset: terms.token, payTo: terms.payee, extra: { protocol: 'eip3009', name: 'USDC', version: '2' } },
    payload: { signature: '', authorization: { ...message } },
  };
  return {
    payment_request_id: terms.paymentRequestId, payer: terms.payer, pay_to: terms.payee,
    token_total_raw: terms.atomicAmount, quote_expires_at: new Date(now + 200_000).toISOString(),
    eip712: {
      primaryType: 'TransferWithAuthorization',
      domain: { name: 'USDC', version: '2', chainId: '0x85', verifyingContract: terms.token },
      types: {
        EIP712Domain: fields([['name', 'string'], ['version', 'string'], ['chainId', 'uint256'], ['verifyingContract', 'address']]),
        TransferWithAuthorization: fields([['from', 'address'], ['to', 'address'], ['value', 'uint256'],
          ['validAfter', 'uint256'], ['validBefore', 'uint256'], ['nonce', 'bytes32']]),
      },
      message,
    },
    payment_payload: paymentPayload,
    payment_mandate_contents: { payment_response: { details: {
      payment_payload: Buffer.from(JSON.stringify(paymentPayload)).toString('base64'),
    } } },
  };
}

test('returns only exact approved typed data with a normalized chain ID', () => {
  const prepared = fixture();
  const result = validateHspSigningRequest(prepared, terms, now);
  assert.equal(result.domain.chainId, 133);
  assert.equal(result.message.value, '20000');
  assert.deepEqual(Object.keys(result), ['domain', 'types', 'primaryType', 'message']);
  assert.notEqual(result.types.EIP712Domain, prepared.eip712.types.EIP712Domain);
});

test('persists before QA submission and does not replay an ambiguous signed payment', async (t) => {
  const signer = Wallet.createRandom();
  const store = openHspQaOrders(':memory:');
  t.after(() => store.close());
  const revision = '0x' + 'a'.repeat(64);
  const order = { ...terms, payer: signer.address, flowId: 'flow-a', merchantName: 'Bill:ION', revisionCommitment: revision, status: 'ORDER_CREATED' };
  const prepared = fixture(order);
  prepared.cart_hash = 'b'.repeat(64);
  prepared.payment_mandate_contents.payment_response.details.request_id = order.paymentRequestId;
  const typed = validateHspSigningRequest(prepared, order, now);
  const signature = await signer.signTypedData(typed.domain, { [typed.primaryType]: typed.types[typed.primaryType] }, typed.message);
  store.reserve({ ...order, status: 'CREATING' });
  assert.equal(store.transition(order, 'CREATING'), true);
  const calls = [];
  const call = async (method) => {
    calls.push(method);
    if (method === 'finalize_payment') {
      assert.equal(store.read(revision).status, 'FINALIZING');
      const payload = structuredClone(prepared.payment_payload);
      payload.payload.signature = signature;
      return { payment_mandate_json: JSON.stringify({ contents: { payment_response: { details: {
        request_id: order.paymentRequestId, payment_payload: Buffer.from(JSON.stringify(payload)).toString('base64'),
      } } } }) };
    }
    assert.equal(store.read(revision).status, 'SUBMITTING');
    throw new Error('response lost');
  };
  const options = { call, store, revision, prepared, signature, clock: () => now };
  const results = await Promise.all([submitHspQaPayment(options), submitHspQaPayment(options)]);
  assert.ok(results.some((result) => result.status === 'SUBMISSION_UNRESOLVED'));
  assert.equal((await submitHspQaPayment(options)).status, 'SUBMISSION_UNRESOLVED');
  assert.deepEqual(calls, ['finalize_payment', 'submit_payment']);
  assert.equal(JSON.stringify(store.read(revision)).includes(signature), false);

  const second = { ...order, revisionCommitment: '0x' + 'c'.repeat(64), flowId: 'flow-b', paymentRequestId: 'order-b' };
  store.reserve({ ...second, status: 'CREATING' });
  assert.equal(store.transition(second, 'CREATING'), true);
  const secondPrepared = fixture(second);
  secondPrepared.cart_hash = prepared.cart_hash;
  secondPrepared.payment_mandate_contents.payment_response.details.request_id = second.paymentRequestId;
  const rejected = await submitHspQaPayment({
    ...options, revision: second.revisionCommitment, prepared: secondPrepared,
    call: async (method) => {
      assert.equal(method, 'finalize_payment');
      return { payment_mandate_json: '{"contents":{}}' };
    },
  });
  assert.equal(rejected.status, 'FINALIZATION_UNRESOLVED');
});

test('only prepares the saved QA order and only accepts the approved payer wallet', async () => {
  const signer = Wallet.createRandom();
  const order = { ...terms, payer: signer.address, flowId: 'flow-a', merchantName: 'Bill:ION' };
  const calls = [];
  const call = async (name, args) => {
    calls.push([name, args]);
    if (name === 'get_order') return { merchant_name: order.merchantName, payment_request_id: order.paymentRequestId };
    if (name === 'prepare_payment') return fixture(order);
    assert.fail('unexpected gateway call');
  };
  const { prepared, walletRequest } = await prepareHspQaSigningRequest({ call, rpc: enoughBalance, order, clock: () => now });
  assert.deepEqual(calls, [
    ['get_order', { flow_id: 'flow-a' }],
    ['prepare_payment', { flow_id: 'flow-a', payer: signer.address, protocol: 'eip3009' }],
  ]);
  const types = { TransferWithAuthorization: walletRequest.types.TransferWithAuthorization };
  const signature = await signer.signTypedData(walletRequest.domain, types, walletRequest.message);
  assert.equal(verifyHspQaWalletSignature({ prepared, order, signature, now }), signer.address);
  const otherSignature = await Wallet.createRandom().signTypedData(walletRequest.domain, types, walletRequest.message);
  assert.throws(() => verifyHspQaWalletSignature({ prepared, order, signature: otherSignature, now }), /PAYER_MISMATCH/);
  assert.throws(() => verifyHspQaWalletSignature({ prepared, order, signature, now: now + 201_000 }), /QUOTE_EXPIRED/);
  await assert.rejects(prepareHspQaSigningRequest({
    call, order, clock: () => now, rpc: async (method) => method === 'eth_chainId' ? '0x85' : '0x' + '0'.repeat(64),
  }), /INSUFFICIENT_OR_UNAVAILABLE_TOKEN_BALANCE/);
  await assert.rejects(prepareHspQaSigningRequest({ call: async (name) => {
    assert.equal(name, 'get_order');
    return { merchant_name: 'Other', payment_request_id: order.paymentRequestId };
  }, order }), /PREPARE_ORDER_MISMATCH/);
});

test('rejects mutated quote, schema, destination, amount, validity and either payload representation', () => {
  const cases = [
    [(p) => { p.payment_request_id = 'other'; }, /QUOTE_MISMATCH/],
    [(p) => { p.token_total_raw = '20001'; }, /QUOTE_MISMATCH/],
    [(p) => { p.quote_expires_at = new Date(now).toISOString(); }, /QUOTE_EXPIRED/],
    [(p) => { p.eip712.types.TransferWithAuthorization.reverse(); }, /UNEXPECTED_SIGNING_SCHEMA/],
    [(p) => { p.eip712.domain.chainId = 177; }, /DOMAIN_MISMATCH/],
    [(p) => { p.eip712.domain.verifyingContract = addr('4'); }, /DOMAIN_MISMATCH/],
    [(p) => { p.eip712.message.from = addr('4'); }, /TERMS_MISMATCH/],
    [(p) => { p.eip712.message.to = addr('4'); }, /TERMS_MISMATCH/],
    [(p) => { p.eip712.message.value = '20001'; }, /TERMS_MISMATCH/],
    [(p) => { p.eip712.message.validBefore = String(now / 1000 + 601); }, /WINDOW_MISMATCH/],
    [(p) => { p.payment_payload.accepted.payTo = addr('4'); }, /X402_PAYLOAD_MISMATCH/],
    [(p) => { p.payment_payload.payload.authorization.nonce = '0x' + 'b'.repeat(64); }, /X402_PAYLOAD_MISMATCH/],
    [(p) => { p.payment_mandate_contents.payment_response.details.payment_payload = 'e30='; }, /ENCODED_PAYLOAD_MISMATCH/],
  ];
  for (const [mutate, error] of cases) {
    const prepared = fixture();
    mutate(prepared);
    assert.throws(() => validateHspSigningRequest(prepared, terms, now), error);
  }
});

test('three signed approvals can drive a QA fixture through order, wallet, submission and chain reconciliation', async (t) => {
  const [a, b, c] = Array.from({ length: 3 }, () => Wallet.createRandom());
  const orders = openHspQaOrders(':memory:');
  const evidenceStore = openHspEvidenceStore(':memory:');
  t.after(() => {
    orders.close();
    evidenceStore.close();
  });
  const manifest = {
    roomId: 'integration-room', version: 2, snapshotCommitment: '0x' + '1'.repeat(64),
    participants: [a.address, b.address, c.address], payer: b.address, payee: a.address,
    chainId: terms.chainId, token: terms.token, merchantName: 'Bill:ION',
    atomicAmount: terms.atomicAmount, validUntil: terms.validUntil,
  };
  const { message, participants, approval: description } = describeHspQaApproval(manifest);
  orders.publishRevision({ ...description, participants });
  const approval = verifyHspQaApproval(manifest, await Promise.all([a, b, c].map((wallet) => wallet.signMessage(message))), now);
  const calls = [];
  let order;
  let prepared;
  const transactionHash = '0x' + 'a'.repeat(64);
  const blockHash = '0x' + 'b'.repeat(64);
  const call = async (method, args) => {
    calls.push(method);
    switch (method) {
      case 'get_chain_config': return {
        networks: [{ chain_id: 133, name: 'hashkey-testnet', is_testnet: true }],
        tokens: [{ chain_id: 133, address: manifest.token, symbol: 'USDC', decimals: 6, payment_protocol: 'eip3009' }],
      };
      case 'create_order': return {
        flow_id: 'integrated-flow', payment_request_id: args.cart_mandate.contents.payment_request.details.id,
      };
      case 'get_order': return { flow_id: order.flowId, payment_request_id: order.paymentRequestId, merchant_name: manifest.merchantName };
      case 'prepare_payment':
        prepared = fixture(order);
        prepared.cart_hash = 'c'.repeat(64);
        prepared.payment_mandate_contents.payment_response.details.request_id = order.paymentRequestId;
        return prepared;
      case 'finalize_payment': {
        const signed = structuredClone(args.payment_payload);
        signed.payload.signature = args.signature;
        return { payment_mandate_json: JSON.stringify({ contents: { payment_response: { details: {
          request_id: order.paymentRequestId, payment_payload: Buffer.from(JSON.stringify(signed)).toString('base64'),
        } } } }) };
      }
      case 'submit_payment': return { status: 'payment-submitted' };
      case 'query_payment': return { status: 'payment-safe', attribution_verified: true, payment: {
        flow_id: order.flowId, payment_request_id: order.paymentRequestId, tx_signature: transactionHash,
      } };
      default: assert.fail(`unexpected tool ${method}`);
    }
  };
  const blockNumber = '0x21';
  const topic = (value) => '0x' + value.slice(2).padStart(64, '0');
  const receipt = { transactionHash, blockHash, blockNumber, status: '0x1', logs: [{
    transactionHash, blockHash, blockNumber, address: manifest.token, logIndex: '0x1', data: '0x',
    topics: ['0x98de503528ee59b575ef0c0a2576a82497bfc029a5685b209e9ec333479b10a5', topic(b.address), '0x' + 'a'.repeat(64)],
  }, {
    transactionHash, blockHash, blockNumber, address: manifest.token, logIndex: '0x0',
    topics: ['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef', topic(b.address), topic(a.address)],
    data: '0x' + BigInt(manifest.atomicAmount).toString(16).padStart(64, '0'),
  }] };
  const rpc = async (method) => ({
    eth_chainId: '0x85', eth_blockNumber: order ? '0x25' : '0x20',
    eth_getTransactionReceipt: receipt, eth_getBlockByNumber: { number: blockNumber, hash: blockHash },
    eth_call: '0x' + 'f'.repeat(64),
  })[method];
  order = await createHspQaOrder({ call, rpc, store: orders, approval, clock: () => now });
  const { walletRequest } = await prepareHspQaSigningRequest({ call, rpc, order, clock: () => now });
  const signature = await b.signTypedData(walletRequest.domain, {
    [walletRequest.primaryType]: walletRequest.types[walletRequest.primaryType],
  }, walletRequest.message);
  const revision = approval.revisionCommitment;
  const accepted = await submitHspQaPayment({ store: orders, call, revision, prepared, signature, clock: () => now });
  assert.equal(accepted.status, 'SUBMITTED');
  const verified = await reconcileHspQaPayment({ orders, evidenceStore, revision, rpc, query: (args) => call('query_payment', args) });
  assert.equal(verified.status, 'VERIFIED');
  assert.equal(verified.evidence.transfer.transactionHash, transactionHash);
  assert.deepEqual(calls, ['get_chain_config', 'create_order', 'get_order', 'prepare_payment', 'finalize_payment', 'submit_payment', 'query_payment']);
});
