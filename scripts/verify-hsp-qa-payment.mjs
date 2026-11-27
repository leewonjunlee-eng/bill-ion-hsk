import { fileURLToPath } from 'node:url';
import { createChainRpc } from '../src/payments/chain-receipt.mjs';
import { createHspQaQuery } from '../src/payments/hsp-qa-query.mjs';
import { openHspEvidenceStore } from '../src/payments/hsp-evidence-store.mjs';
import { openHspQaOrders } from '../src/payments/hsp-qa-order.mjs';
import { reconcileHspQaPayment } from '../src/payments/hsp-qa-reconcile.mjs';

const rpcUrls = new Map([[133, 'https://testnet.hsk.xyz'], [11155111, 'https://ethereum-sepolia-rpc.publicnode.com']]);
try {
  const revision = process.argv[2]?.toLowerCase();
  if (process.argv.length !== 3 || !/^0x[0-9a-f]{64}$/.test(revision ?? '')) {
    throw new Error('Usage: node scripts/verify-hsp-qa-payment.mjs <revision-commitment>');
  }
  const orders = openHspQaOrders(fileURLToPath(new URL('../.hsp-qa-orders.sqlite', import.meta.url)));
  let evidenceStore;
  try {
    const url = rpcUrls.get(orders.read(revision)?.chainId);
    if (!url) throw new Error('Expected an HSK testnet or Sepolia HSP QA order');
    evidenceStore = openHspEvidenceStore(fileURLToPath(new URL('../.hsp-qa-evidence.sqlite', import.meta.url)));
    const result = await reconcileHspQaPayment({
      orders, evidenceStore, revision, query: createHspQaQuery(), rpc: createChainRpc(url),
    });
    console.log(JSON.stringify(result, null, 2));
  } finally {
    evidenceStore?.close();
    orders.close();
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
