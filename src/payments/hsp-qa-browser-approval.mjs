import { describeHspQaApproval } from './hsp-qa-approval.mjs';
import { openHspQaOrders } from './hsp-qa-order.mjs';

export function openQaApprovalDescription(database) {
  return createQaApprovalDescription(openHspQaOrders(database));
}

export function createQaApprovalDescription(orders) {
  return (manifest) => {
    const description = describeHspQaApproval(manifest);
    orders.assertCurrent(description.approval);
    if (Date.parse(description.approval.validUntil) <= Date.now()) throw new Error('HSP_APPROVAL_MANIFEST_EXPIRED');
    return description;
  };
}
