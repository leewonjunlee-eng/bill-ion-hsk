import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createChainRpc } from '../src/payments/chain-receipt.mjs';
import { createHspQaClient } from '../src/payments/hsp-qa-query.mjs';
import { createHspQaOrder, openHspQaOrders } from '../src/payments/hsp-qa-order.mjs';
import { verifyHspQaApproval } from '../src/payments/hsp-qa-approval.mjs';

const urls = new Map([[133, 'https://testnet.hsk.xyz'], [11155111, 'https://ethereum-sepolia-rpc.publicnode.com']]);
try {
  const [manifestFile, signaturesFile, orderFile] = process.argv.slice(2);
  if (!manifestFile || !signaturesFile || !orderFile || process.argv.length !== 5) {
    throw new Error('Usage: node scripts/create-hsp-qa-order.mjs <current-manifest.json> <participant-signatures.json> <new-saved-order.json>');
  }
  const [manifest, signatures] = await Promise.all([manifestFile, signaturesFile].map(async (file) => JSON.parse(await readFile(file, 'utf8'))));
  const approval = verifyHspQaApproval(manifest, signatures);
  const url = urls.get(approval.chainId);
  if (!url) throw new Error('Expected a supported QA testnet');
  const store = openHspQaOrders(fileURLToPath(new URL('../.hsp-qa-orders.sqlite', import.meta.url)));
  try {
    const order = await createHspQaOrder({ call: createHspQaClient(), rpc: createChainRpc(url), store, approval });
    if (order.status !== 'ORDER_CREATED') throw new Error(`HSP order ${order.status}; preserve ${order.paymentRequestId} for reconciliation`);
    await writeFile(orderFile, JSON.stringify(order, null, 2), { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify({ status: order.status, flowId: order.flowId, paymentRequestId: order.paymentRequestId }, null, 2));
  } finally {
    store.close();
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
