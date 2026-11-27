import { verifyHspQaPayment } from './hsp-qa-query.mjs';

const reconcilable = new Set([
  'FINALIZING', 'FINALIZATION_UNRESOLVED', 'SUBMITTING', 'SUBMITTED', 'SUBMISSION_UNRESOLVED', 'VERIFIED',
]);

export async function reconcileHspQaPayment({ orders, evidenceStore, revision, query, rpc }) {
  if (typeof revision !== 'string' || !/^0x[0-9a-f]{64}$/i.test(revision)) {
    throw new Error('HSP_REVISION_COMMITMENT_REQUIRED');
  }
  const key = revision.toLowerCase();
  const order = orders.read(key);
  if (!order || order.revisionCommitment !== key || ![133, 11155111].includes(order.chainId) ||
      !reconcilable.has(order.status)) throw new Error('HSP_ORDER_NOT_RECONCILABLE');

  const evidence = await verifyHspQaPayment({ order, query, rpc });
  const claim = evidenceStore.claim(evidence);
  const verifiedOrder = {
    ...order,
    status: 'VERIFIED',
    verifiedTransfer: {
      chainId: evidence.transfer.chainId,
      transactionHash: evidence.transfer.transactionHash,
      proof: evidence.proof,
    },
  };
  // Evidence is durable first. A crash between the writes can recover via the same claim.
  let current = orders.read(key);
  while (current && current.status !== 'VERIFIED') {
    if (!reconcilable.has(current.status) || current.paymentRequestId !== order.paymentRequestId ||
        current.flowId !== order.flowId) throw new Error('HSP_ORDER_CHANGED_DURING_RECONCILIATION');
    if (orders.transition(verifiedOrder, current.status)) {
      current = verifiedOrder;
      break;
    }
    current = orders.read(key);
  }
  if (current?.paymentRequestId !== order.paymentRequestId || current.flowId !== order.flowId ||
      current.verifiedTransfer?.proof !== evidence.proof) throw new Error('HSP_VERIFIED_ORDER_EVIDENCE_CONFLICT');
  return { status: current.status, ...claim };
}
