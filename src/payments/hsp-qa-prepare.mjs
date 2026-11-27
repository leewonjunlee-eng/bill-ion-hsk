import { verifyTypedData } from 'ethers';
import { validateHspSigningRequest } from './hsp-signing-policy.mjs';

export async function prepareHspQaSigningRequest({ call, rpc, order, clock = Date.now }) {
  const { flowId, merchantName, paymentRequestId, payer } = order;
  if (![flowId, merchantName, paymentRequestId].every((value) => typeof value === 'string' && value.trim()) ||
      typeof payer !== 'string' || !/^0x[0-9a-f]{40}$/i.test(payer)) {
    throw new Error('HSP_SAVED_ORDER_REQUIRED');
  }
  const stored = await call('get_order', { flow_id: flowId });
  if (stored?.merchant_name !== merchantName || stored.payment_request_id !== paymentRequestId ||
      (stored.flow_id !== undefined && stored.flow_id !== flowId)) {
    throw new Error('HSP_PREPARE_ORDER_MISMATCH');
  }
  const prepared = await call('prepare_payment', { flow_id: flowId, payer, protocol: 'eip3009' });
  const walletRequest = validateHspSigningRequest(prepared, order, clock());
  const network = await rpc('eth_chainId');
  if (typeof network !== 'string' || !/^0x[0-9a-f]+$/i.test(network) || BigInt(network) !== BigInt(order.chainId)) {
    throw new Error('HSP_BALANCE_CHAIN_MISMATCH');
  }
  const balance = await rpc('eth_call', [{
    to: order.token, data: '0x70a08231' + payer.slice(2).toLowerCase().padStart(64, '0'),
  }, 'latest']);
  if (typeof balance !== 'string' || !/^0x[0-9a-f]{64}$/i.test(balance) || BigInt(balance) < BigInt(order.atomicAmount)) {
    throw new Error('HSP_INSUFFICIENT_OR_UNAVAILABLE_TOKEN_BALANCE');
  }
  validateHspSigningRequest(prepared, order, clock());
  return { prepared, walletRequest };
}

// Revalidate the provider quote when the wallet returns, since it may have expired while open.
export function verifyHspQaWalletSignature({ prepared, order, signature, now = Date.now() }) {
  const typed = validateHspSigningRequest(prepared, order, now);
  if (typeof signature !== 'string' || !/^0x[0-9a-f]{130}$/i.test(signature)) throw new Error('HSP_INVALID_WALLET_SIGNATURE');
  let signer;
  try {
    signer = verifyTypedData(typed.domain, { [typed.primaryType]: typed.types[typed.primaryType] }, typed.message, signature);
  } catch {
    throw new Error('HSP_INVALID_WALLET_SIGNATURE');
  }
  if (signer.toLowerCase() !== order.payer.toLowerCase()) throw new Error('HSP_SIGNATURE_PAYER_MISMATCH');
  return signer;
}
