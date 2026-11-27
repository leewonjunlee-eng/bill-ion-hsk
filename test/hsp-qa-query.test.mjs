import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHspQaQuery, verifyHspQaPayment } from '../src/payments/hsp-qa-query.mjs';

const order = {
  flowId: 'flow-1', paymentRequestId: 'request-1', merchantName: 'Bill:ION',
  revisionCommitment: '0x' + '1'.repeat(64), proofSalt: '0x' + '2'.repeat(64),
};
const reply = {
  status: 'payment-safe', attribution_verified: true,
  payment: { flow_id: order.flowId, payment_request_id: order.paymentRequestId, tx_signature: '0x' + 'a'.repeat(64) },
};
const schemas = {
  get_chain_config: [], create_order: ['merchant_name', 'pay_to', 'cart_mandate'], get_order: ['flow_id'],
  prepare_payment: ['flow_id', 'payer', 'protocol'], estimate_fee: [],
  finalize_payment: ['signature', 'payment_payload', 'payment_mandate_contents', 'cart_hash'],
  submit_payment: ['payment_mandate_json'], query_payment: ['flow_id', 'payment_request_id', 'expected_merchant_name'],
};
const toolList = (...omit) => Object.entries(schemas).filter(([name]) => !omit.includes(name))
  .map(([name, fields]) => ({
    name, inputSchema: { type: 'object', properties: Object.fromEntries(fields.map((field) => [field, {}])) },
  }));

test('queries the pinned QA server using only the saved order identifiers', async () => {
  const requests = [];
  const query = createHspQaQuery(async (url, options) => {
    assert.equal(url, 'https://mcp-qa.hashkeymerchant.com/');
    assert.equal(options.redirect, 'error');
    const body = JSON.parse(options.body);
    requests.push(body);
    if (body.method === 'notifications/initialized') return new Response(null, { status: 202 });
    if (body.method === 'initialize') {
      return Response.json({ jsonrpc: '2.0', id: body.id, result: { protocolVersion: '2025-03-26' } }, {
        headers: { 'mcp-session-id': 'test-session' },
      });
    }
    if (body.method === 'tools/list') {
      return Response.json({ jsonrpc: '2.0', id: body.id, result: { tools: toolList() } });
    }
    assert.equal(options.headers['mcp-session-id'], 'test-session');
    return new Response('data: ' + JSON.stringify({ jsonrpc: '2.0', id: body.id, result: {
      structuredContent: { code: 0, data: reply },
    } }) + '\n\n', { headers: { 'content-type': 'text/event-stream' } });
  });
  assert.deepEqual(await query(order), reply);
  assert.deepEqual(requests.map((request) => request.method), ['initialize', 'notifications/initialized', 'tools/list', 'tools/call']);
  assert.deepEqual(requests[3].params, { name: 'query_payment', arguments: {
    flow_id: 'flow-1', payment_request_id: 'request-1', expected_merchant_name: 'Bill:ION',
  } });
});

test('a server missing finalize_payment cannot advance to a tool call', async () => {
  const query = createHspQaQuery(async (_, { body }) => {
    const message = JSON.parse(body);
    if (message.method === 'notifications/initialized') return new Response(null, { status: 202 });
    if (message.method === 'initialize') {
      return Response.json({ jsonrpc: '2.0', id: message.id, result: { protocolVersion: '2025-03-26' } });
    }
    assert.equal(message.method, 'tools/list');
    return Response.json({ jsonrpc: '2.0', id: message.id, result: { tools: toolList('finalize_payment') } });
  });
  await assert.rejects(query(order), /REQUIRED_TOOLS_MISSING:finalize_payment/);
});

test('refuses unsafe or unrelated provider evidence before any chain lookup', async () => {
  for (const [response, expected] of [
    [{ ...reply, status: 'payment-included' }, /HSP_PAYMENT_NOT_SAFE/],
    [{ ...reply, attribution_verified: false }, /HSP_ATTRIBUTION_UNVERIFIED/],
    [{ ...reply, payment: { ...reply.payment, attribution_verified: false } }, /HSP_ATTRIBUTION_UNVERIFIED/],
    [{ ...reply, payment: { ...reply.payment, flow_id: 'other' } }, /HSP_ORDER_REFERENCE_MISMATCH/],
    [{ ...reply, payment: { ...reply.payment, payment_request_id: undefined } }, /HSP_ORDER_REFERENCE_MISMATCH/],
    [{ ...reply, tx_signature: '0x' + 'b'.repeat(64) }, /HSP_CONFLICTING_PAYMENT_EVIDENCE/],
  ]) {
    await assert.rejects(verifyHspQaPayment({
      order, query: async () => response, rpc: () => assert.fail('unexpected chain lookup'),
    }), expected);
  }
});

test('reports QA access denial without making a tool call', async () => {
  let requests = 0;
  const query = createHspQaQuery(async () => {
    requests += 1;
    return new Response(null, { status: 403 });
  });
  await assert.rejects(query(order), /HSP_QA_HTTP_403/);
  assert.equal(requests, 1);
});
