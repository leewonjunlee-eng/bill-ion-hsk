import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { openHspQaOrders } from '../src/payments/hsp-qa-order.mjs';
import { createHspQaClient } from '../src/payments/hsp-qa-query.mjs';
import { submitHspQaPayment } from '../src/payments/hsp-qa-submit.mjs';

try {
  const [revision, preparedFile, signatureFile] = process.argv.slice(2);
  if (!/^0x[0-9a-f]{64}$/i.test(revision ?? '') || !preparedFile || !signatureFile || process.argv.length !== 5) {
    throw new Error('Usage: node scripts/submit-hsp-qa-payment.mjs <revision-commitment> <prepared.json> <wallet-signature.txt>');
  }
  const [prepared, signature] = await Promise.all([
    readFile(preparedFile, 'utf8').then(JSON.parse),
    readFile(signatureFile, 'utf8').then((raw) => raw.trim()),
  ]);
  const store = openHspQaOrders(fileURLToPath(new URL('../.hsp-qa-orders.sqlite', import.meta.url)));
  try {
    const saved = store.read(revision.toLowerCase());
    if (saved?.status === 'ORDER_CREATED') {
      if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('Interactive QA submission confirmation required');
      console.log(JSON.stringify({
        network: saved.network, chainId: saved.chainId, payer: saved.payer, recipient: saved.payee,
        token: saved.token, token_total_raw: saved.atomicAmount, paymentRequestId: saved.paymentRequestId,
      }, null, 2));
      const prompt = createInterface({ input: process.stdin, output: process.stdout });
      try {
        if ((await prompt.question('Type the payment request ID to submit this QA payment: ')) !== saved.paymentRequestId) {
          throw new Error('QA submission not confirmed');
        }
      } finally {
        prompt.close();
      }
    }
    const order = await submitHspQaPayment({ store, call: createHspQaClient(), revision: revision.toLowerCase(), prepared, signature });
    console.log(JSON.stringify({ status: order.status, flowId: order.flowId, paymentRequestId: order.paymentRequestId }, null, 2));
    if (order.status !== 'SUBMITTED') process.exitCode = 1;
  } finally {
    store.close();
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
