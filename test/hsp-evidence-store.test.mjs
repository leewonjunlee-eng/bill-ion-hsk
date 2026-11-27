import assert from 'node:assert/strict';
import { mkdtemp, rm, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { openHspEvidenceStore } from '../src/payments/hsp-evidence-store.mjs';

test('the evidence claim survives reopening and cannot credit another order', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'bill-ion-evidence-'));
  const path = join(directory, 'proof.sqlite');
  const first = openHspEvidenceStore(path);
  const hash = '0x' + 'a'.repeat(64);
  const evidence = {
    flowId: 'flow-1', paymentRequestId: 'request-1', status: 'payment-safe',
    terms: { merchantName: 'Bill:ION', amount: '20' },
    transfer: { chainId: 133, transactionHash: hash, logIndex: '0', blockHash: '0x' + 'b'.repeat(64), confirmations: '5' },
  };
  try {
    assert.deepEqual(first.claim(evidence), { created: true, evidence });
  } finally {
    first.close();
  }
  const reopened = openHspEvidenceStore(path);
  try {
    assert.deepEqual(reopened.claim({ ...evidence, status: 'payment-finalized' }), { created: false, evidence });
    assert.throws(() => reopened.claim({ ...evidence, paymentRequestId: 'request-2' }), /ORDER_EVIDENCE_CONFLICT/);
    assert.throws(() => reopened.claim({ ...evidence, flowId: 'flow-3' }), /ORDER_EVIDENCE_CONFLICT/);
    assert.throws(() => reopened.claim({ ...evidence, terms: { ...evidence.terms, amount: '21' } }), /ORDER_EVIDENCE_CONFLICT/);
    assert.throws(() => reopened.claim({
      ...evidence, flowId: 'flow-2', paymentRequestId: 'request-2',
      transfer: { ...evidence.transfer, logIndex: '1', transactionHash: '0x' + 'A'.repeat(64) },
    }), /TRANSFER_ALREADY_CLAIMED/);
    assert.equal(reopened.claim({
      ...evidence, flowId: 'flow-2', paymentRequestId: 'request-2',
      transfer: { ...evidence.transfer, chainId: 11155111 },
    }).created, true);
  } finally {
    reopened.close();
    await rm(path, { force: true });
    await rmdir(directory);
  }
});
