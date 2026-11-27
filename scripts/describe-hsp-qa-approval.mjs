import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describeHspQaApproval } from '../src/payments/hsp-qa-approval.mjs';
import { openHspQaOrders } from '../src/payments/hsp-qa-order.mjs';

try {
  const publish = process.argv[3] === '--publish-local';
  if (process.argv.length !== 3 && !(process.argv.length === 4 && publish)) {
    throw new Error('Usage: node scripts/describe-hsp-qa-approval.mjs <current-manifest.json> [--publish-local]');
  }
  const manifest = JSON.parse(await readFile(process.argv[2], 'utf8'));
  const { approval, participants, message } = describeHspQaApproval(manifest);
  if (publish) {
    if (Date.parse(approval.validUntil) <= Date.now()) throw new Error('HSP_APPROVAL_MANIFEST_EXPIRED');
    const store = openHspQaOrders(fileURLToPath(new URL('../.hsp-qa-orders.sqlite', import.meta.url)));
    try {
      store.publishRevision({ ...approval, participants });
    } finally {
      store.close();
    }
  }
  console.log(JSON.stringify({ revisionCommitment: approval.revisionCommitment, message, publishedLocally: publish }, null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
