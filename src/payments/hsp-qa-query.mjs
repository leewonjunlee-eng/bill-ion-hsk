import { createHash } from 'node:crypto';
import { verifyChainTransfer } from './chain-receipt.mjs';

const QA_URL = 'https://mcp-qa.hashkeymerchant.com/';
const PROTOCOL = '2025-03-26';
const safeStatuses = new Set(['payment-safe', 'payment-finalized']);

const toolInputs = {
  get_chain_config: [], create_order: ['merchant_name', 'pay_to', 'cart_mandate'], get_order: ['flow_id'],
  prepare_payment: ['flow_id', 'payer', 'protocol'],
  finalize_payment: ['signature', 'payment_payload', 'payment_mandate_contents', 'cart_hash'],
  estimate_fee: [], submit_payment: ['payment_mandate_json'],
  query_payment: ['flow_id', 'payment_request_id', 'expected_merchant_name'],
};

export function createHspQaClient(fetchImpl = fetch) {
  let nextId = 0;
  let sessionId;
  let connected;
  let schemas;

  async function post(method, params, notify = false) {
    const id = notify ? undefined : ++nextId;
    const response = await fetchImpl(QA_URL, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        ...(sessionId ? { 'mcp-session-id': sessionId, 'mcp-protocol-version': PROTOCOL } : {}),
      },
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
    });
    if (!response.ok) throw new Error(`HSP_QA_HTTP_${response.status}`);
    if (method === 'initialize') sessionId = response.headers.get('mcp-session-id');
    if (notify) return;
    const raw = await response.text();
    const messages = response.headers.get('content-type')?.includes('text/event-stream')
      ? raw.split(/\r?\n\r?\n/).map((event) => event.split(/\r?\n/)
        .filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n')).filter(Boolean)
      : [raw];
    const replies = messages.map((message) => JSON.parse(message))
      .filter((message) => message?.jsonrpc === '2.0' && message.id === id);
    if (replies.length !== 1 || replies[0].error || !replies[0].result) throw new Error('HSP_QA_INVALID_REPLY');
    return replies[0].result;
  }

  async function connect() {
    const result = await post('initialize', {
      protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: 'bill-ion', version: '0.1.0' },
    });
    if (result.protocolVersion !== PROTOCOL) throw new Error('HSP_QA_PROTOCOL_MISMATCH');
    await post('notifications/initialized', undefined, true);
    const discovered = new Map();
    const cursors = new Set();
    let cursor;
    do {
      const page = await post('tools/list', cursor ? { cursor } : {});
      if (!Array.isArray(page.tools)) throw new Error('HSP_QA_INVALID_TOOL_LIST');
      for (const tool of page.tools) {
        if (!Object.hasOwn(toolInputs, tool?.name ?? '')) continue;
        if (discovered.has(tool.name)) throw new Error('HSP_QA_DUPLICATE_TOOL');
        const schema = tool.inputSchema;
        if (schema?.type !== 'object' || !toolInputs[tool.name].every((key) => Object.hasOwn(schema.properties ?? {}, key))) {
          throw new Error(`HSP_QA_TOOL_SCHEMA_MISMATCH:${tool.name}`);
        }
        discovered.set(tool.name, schema);
      }
      cursor = page.nextCursor;
      if (cursor !== undefined && (typeof cursor !== 'string' || !cursor || cursors.has(cursor) || cursors.size >= 8)) {
        throw new Error('HSP_QA_INVALID_TOOL_CURSOR');
      }
      if (cursor) cursors.add(cursor);
    } while (cursor);
    const missing = Object.keys(toolInputs).filter((name) => !discovered.has(name));
    if (missing.length) throw new Error(`HSP_QA_REQUIRED_TOOLS_MISSING:${missing.join(',')}`);
    schemas = discovered;
  }

  return async (name, args) => {
    if (!Object.hasOwn(toolInputs, name)) throw new Error('HSP_QA_UNSUPPORTED_TOOL');
    connected ??= connect().catch((error) => {
      connected = undefined;
      sessionId = undefined;
      throw error;
    });
    await connected;
    const schema = schemas.get(name);
    if (!args || typeof args !== 'object' || Array.isArray(args) ||
        (schema.required ?? []).some((key) => !Object.hasOwn(args, key)) ||
        Object.entries(args).some(([key, value]) => {
          const field = schema.properties?.[key];
          if (!field) return schema.additionalProperties === false;
          const types = Array.isArray(field.type) ? field.type : [field.type];
          return field.type !== undefined && !types.some((type) =>
            type === 'object' ? value !== null && typeof value === 'object' && !Array.isArray(value) :
              type === 'array' ? Array.isArray(value) :
                type === 'integer' ? Number.isInteger(value) :
                  type === 'null' ? value === null : type === typeof value);
        })) throw new Error(`HSP_QA_TOOL_ARGUMENT_MISMATCH:${name}`);
    const reply = await post('tools/call', {
      name, arguments: args,
    });
    if (reply.isError) throw new Error('HSP_QA_QUERY_FAILED');
    let result = reply.structuredContent ?? JSON.parse(
      (reply.content ?? []).filter((part) => part.type === 'text').map((part) => part.text).join(''),
    );
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('HSP_QA_INVALID_REPLY');
    if (Object.hasOwn(result, 'code')) {
      if (![0, '0', 200].includes(result.code)) throw new Error('HSP_QA_QUERY_FAILED');
      result = result.data;
    }
    return result;
  };
}

export function createHspQaQuery(fetchImpl = fetch) {
  const call = createHspQaClient(fetchImpl);
  return ({ flowId, paymentRequestId, merchantName }) => call('query_payment', {
    flow_id: flowId, payment_request_id: paymentRequestId, expected_merchant_name: merchantName,
  });
}

// order must come from the server's saved preparation record, never from a browser body.
export async function verifyHspQaPayment({ query, rpc, order }) {
  const { flowId, paymentRequestId, merchantName } = order;
  if (![flowId, paymentRequestId, merchantName].every((value) => typeof value === 'string' && value.trim())) {
    throw new Error('HSP_ORDER_REFERENCE_REQUIRED');
  }
  const { revisionCommitment, proofSalt } = order;
  const isCommitment = (value) => typeof value === 'string' && /^0x[0-9a-f]{64}$/i.test(value) && !/^0x0{64}$/i.test(value);
  if (!isCommitment(revisionCommitment) || !isCommitment(proofSalt)) throw new Error('HSP_REVISION_COMMITMENT_REQUIRED');
  const result = await query({ flowId, paymentRequestId, merchantName });
  const payment = result?.payment ?? result;
  const status = result?.status ?? payment?.status;
  if (!safeStatuses.has(status)) throw new Error('HSP_PAYMENT_NOT_SAFE');
  const attribution = [result.attribution_verified, payment.attribution_verified].filter((value) => value !== undefined);
  if (!attribution.length || attribution.some((value) => value !== true)) throw new Error('HSP_ATTRIBUTION_UNVERIFIED');
  // Require an explicit echo of both IDs before treating the query as order-linked.
  if ((payment.flow_id ?? result.flow_id) !== flowId ||
      (payment.payment_request_id ?? result.payment_request_id) !== paymentRequestId ||
      [payment.flow_id, result.flow_id].some((id) => id !== undefined && id !== flowId) ||
      [payment.payment_request_id, result.payment_request_id].some((id) => id !== undefined && id !== paymentRequestId)) {
    throw new Error('HSP_ORDER_REFERENCE_MISMATCH');
  }
  if ((payment.status && !safeStatuses.has(payment.status)) ||
      (result.tx_signature && payment.tx_signature &&
        result.tx_signature.toLowerCase() !== payment.tx_signature.toLowerCase())) {
    throw new Error('HSP_CONFLICTING_PAYMENT_EVIDENCE');
  }
  const transfer = await verifyHspSourceTransfer(rpc, order, payment.tx_signature ?? result.tx_signature);
  return { flowId, paymentRequestId, status, ...hspProof(order, transfer) };
}

export function verifyHspSourceTransfer(rpc, order, transactionHash) {
  if (typeof order.authorization?.nonce !== 'string' || !/^0x[0-9a-f]{64}$/i.test(order.authorization.nonce)) {
    throw new Error('HSP_SAVED_AUTHORIZATION_REQUIRED');
  }
  return verifyChainTransfer(rpc, {
    ...order, amount: order.atomicAmount, transactionHash, authorizationNonce: order.authorization.nonce,
  });
}

export function hspProof(order, transfer) {
  const { flowId, paymentRequestId, merchantName, proofSalt, revisionCommitment, authorization } = order;
  const terms = {
    merchantName, token: order.token.toLowerCase(), payer: order.payer.toLowerCase(),
    payee: order.payee.toLowerCase(), amount: order.atomicAmount,
  };
  const revision = revisionCommitment.toLowerCase();
  const proof = '0x' + createHash('sha256').update(JSON.stringify([
    'bill-ion/hsp-qa-proof/v2', proofSalt.toLowerCase(), revision, flowId, paymentRequestId,
    terms, authorization.nonce.toLowerCase(), authorization.validAfter, authorization.validBefore,
    transfer.chainId, transfer.transactionHash, transfer.blockHash, transfer.logIndex,
  ])).digest('hex');
  return { terms, transfer, revision, proof };
}
