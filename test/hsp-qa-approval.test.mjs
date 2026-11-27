import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Wallet } from 'ethers';
import { describeHspQaApproval, verifyHspQaApproval } from '../src/payments/hsp-qa-approval.mjs';

test('all enrolled wallets must approve the same revision and exact payment terms', async () => {
  const wallets = Array.from({ length: 3 }, () => Wallet.createRandom());
  const now = Date.parse('2026-11-26T00:00:00Z');
  const manifest = {
    roomId: 'sample-qa-room', version: 2, snapshotCommitment: '0x' + 'a'.repeat(64),
    participants: wallets.map(({ address }) => address), chainId: 133,
    payer: wallets[1].address, payee: wallets[0].address, token: '0x' + '1'.repeat(40),
    merchantName: 'Bill:ION', atomicAmount: '20000', validUntil: new Date(now + 120_000).toISOString(),
  };
  const { message, approval } = describeHspQaApproval(manifest);
  const signatures = await Promise.all(wallets.map((wallet) => wallet.signMessage(message)));
  assert.deepEqual(verifyHspQaApproval(manifest, signatures, now), approval);
  assert.throws(() => verifyHspQaApproval(manifest, signatures.slice(0, 2), now), /ALL_APPROVALS_REQUIRED/);
  assert.throws(() => verifyHspQaApproval(manifest, [signatures[0], signatures[0], signatures[1]], now), /ALL_APPROVALS_REQUIRED/);
  assert.throws(() => verifyHspQaApproval({ ...manifest, version: 3 }, signatures, now), /ALL_APPROVALS_REQUIRED/);
  assert.throws(() => verifyHspQaApproval({ ...manifest, atomicAmount: '30000' }, signatures, now), /ALL_APPROVALS_REQUIRED/);
  assert.throws(() => verifyHspQaApproval(manifest, signatures, now + 120_000), /EXPIRED/);
});
