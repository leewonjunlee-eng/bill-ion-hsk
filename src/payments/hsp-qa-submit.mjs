import { isDeepStrictEqual } from 'node:util';
import { verifyHspQaWalletSignature } from './hsp-qa-prepare.mjs';

function boundMandate(finalized, prepared, order, signature) {
  const json = finalized?.payment_mandate_json;
  if (typeof json !== 'string' || json.length > 40_000) throw new Error('HSP_FINALIZED_MANDATE_INVALID');
  const mandate = JSON.parse(json);
  const contents = mandate?.contents ?? mandate?.payment_mandate_contents;
  const details = contents?.payment_response?.details;
  if (details?.request_id !== order.paymentRequestId || typeof details.payment_payload !== 'string' ||
      details.payment_payload.length > 20_000) throw new Error('HSP_FINALIZED_ORDER_MISMATCH');
  const payload = JSON.parse(Buffer.from(details.payment_payload, 'base64').toString('utf8'));
  const expected = structuredClone(prepared.payment_payload);
  expected.payload.signature = signature;
  if (!isDeepStrictEqual(payload, expected)) throw new Error('HSP_FINALIZED_PAYLOAD_MISMATCH');
  return json;
}

export async function submitHspQaPayment({ store, call, revision, prepared, signature, clock = Date.now }) {
  const order = store.read(revision);
  if (!order || ![133, 11155111].includes(order.chainId) || !order.flowId) throw new Error('HSP_SAVED_QA_ORDER_REQUIRED');
  if (order.status !== 'ORDER_CREATED') return order;
  verifyHspQaWalletSignature({ prepared, order, signature, now: clock() });
  const details = prepared.payment_mandate_contents?.payment_response?.details;
  if (typeof prepared.cart_hash !== 'string' || !/^(?:0x)?[0-9a-f]{64}$/i.test(prepared.cart_hash) ||
      details?.request_id !== order.paymentRequestId ||
      typeof details.payment_payload !== 'string') throw new Error('HSP_PREPARED_MANDATE_REQUIRED');
  const { nonce, validAfter, validBefore } = prepared.eip712.message;
  const authorization = { nonce: nonce.toLowerCase(), validAfter, validBefore };
  const save = (status, previous) => store.transition({ ...order, status, authorization }, previous);
  if (!save('FINALIZING', 'ORDER_CREATED')) return store.read(revision);

  let mandate;
  try {
    const finalized = await call('finalize_payment', {
      signature, payment_payload: prepared.payment_payload,
      payment_mandate_contents: prepared.payment_mandate_contents, cart_hash: prepared.cart_hash,
    });
    mandate = boundMandate(finalized, prepared, order, signature);
    verifyHspQaWalletSignature({ prepared, order, signature, now: clock() });
  } catch {
    save('FINALIZATION_UNRESOLVED', 'FINALIZING');
    return store.read(revision);
  }
  if (!save('SUBMITTING', 'FINALIZING')) return store.read(revision);
  try {
    const reply = await call('submit_payment', { payment_mandate_json: mandate });
    save(reply?.status === 'payment-submitted' ? 'SUBMITTED' : 'SUBMISSION_UNRESOLVED', 'SUBMITTING');
  } catch {
    save('SUBMISSION_UNRESOLVED', 'SUBMITTING');
  }
  return store.read(revision);
}
