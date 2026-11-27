// 심사자용 정적 데모, 지갑 전송 페이지의 검사, 배포 제외 목록
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHspBrowserServer } from '../public/demo/hsp-server.js';
import { walletTransaction } from '../public/registry-send.js';
import { paymentRequest } from '../public/hsp-payment-sign.js';
import { Wallet, verifyTypedData } from 'ethers';

const root = path.join(import.meta.dirname, '..');

test('browser-only HSP demo enforces the same gates as the server', async () => {
  const handle = createHspBrowserServer();
  const base = '/api/hsp-demo/rooms/shared-receipt';
  const post = (url, uid, body) => handle('POST', base + url, uid, JSON.stringify(body));
  const draft = (await handle('GET', base, 'a')).body.current;
  const revised = await post('/revise', 'b', { snapshotId: draft.id, snapshotHash: draft.hash });
  const { current } = revised.body;
  const terms = (s) => ({ snapshotId: s.id, snapshotHash: s.hash, edgeId: 'b-to-a' });
  assert.deepEqual(await post('/payments', 'b', terms(draft)), { status: 409, body: { error: 'STALE_SNAPSHOT' } });
  for (const uid of ['a', 'b']) await post(`/snapshots/${current.id}/approvals`, uid, { snapshotHash: current.hash });
  assert.equal((await post('/payments', 'b', terms(current))).body.error, 'APPROVALS_MISSING');
  await post(`/snapshots/${current.id}/approvals`, 'c', { snapshotHash: current.hash });
  const paid = await post('/payments', 'b', terms(current));
  assert.equal(paid.status, 201);
  assert.equal(paid.body.status, 'ORDER_CREATED');
  assert.equal((await handle('GET', '/api/unknown', 'a')).status, 404);
});

test('wallet sender accepts only zero-value HSK deployment or record data', () => {
  const writer = '0x' + '1'.repeat(40);
  const deployment = { chainId: 177, writer, unsignedTransaction: { data: '0x6000', value: '0x0' } };
  assert.deepEqual(walletTransaction(deployment), { chainId: 177, from: writer, tx: { data: '0x6000', value: '0x0' } });
  const to = '0x' + '2'.repeat(40);
  const record = { chainId: 133, unsignedTransaction: { from: writer, to, data: '0xabcd', value: '0x0' } };
  assert.deepEqual(walletTransaction(record), { chainId: 133, from: writer, tx: { to, data: '0xabcd', value: '0x0' } });
  for (const bad of [
    null, {}, { ...deployment, chainId: 1 }, { ...deployment, writer: undefined },
    { ...deployment, unsignedTransaction: { data: '0x6000', value: '0x1' } },
    { ...deployment, unsignedTransaction: { data: '0x', value: '0x0' } },
    { ...record, unsignedTransaction: { ...record.unsignedTransaction, to: '0x12' } },
    { ...record, unsignedTransaction: { ...record.unsignedTransaction, gas: '0xffffff' } },
  ]) assert.throws(() => walletTransaction(bad), /INVALID_TRANSACTION_FILE/);
});

test('local payment databases never enter a container or cloud upload', () => {
  for (const name of ['.dockerignore', '.gcloudignore', '.gitignore']) {
    assert.match(fs.readFileSync(path.join(root, name), 'utf8'), /^\*\.sqlite\*\r?$/m, name);
  }
});

test('payment signing page forwards only an exact transfer authorization, and the wallet signature recovers to the payer', async () => {
  const wallet = Wallet.createRandom();
  const request = {
    domain: { name: 'USDC', version: '2', chainId: 11155111, verifyingContract: '0x' + '3'.repeat(40) },
    types: {
      EIP712Domain: [['name', 'string'], ['version', 'string'], ['chainId', 'uint256'], ['verifyingContract', 'address']].map(([name, type]) => ({ name, type })),
      TransferWithAuthorization: [['from', 'address'], ['to', 'address'], ['value', 'uint256'], ['validAfter', 'uint256'], ['validBefore', 'uint256'], ['nonce', 'bytes32']].map(([name, type]) => ({ name, type })),
    },
    primaryType: 'TransferWithAuthorization',
    message: { from: wallet.address, to: '0x' + '2'.repeat(40), value: '20000', validAfter: '1', validBefore: '4000000000', nonce: '0x' + 'a'.repeat(64) },
  };
  const checked = paymentRequest(request, 1_800_000_000_000);
  assert.equal(checked.chainId, 11155111);
  assert.equal(checked.from, wallet.address);
  const { EIP712Domain, ...types } = checked.typedData.types;
  const signature = await wallet.signTypedData(checked.typedData.domain, types, checked.typedData.message);
  assert.equal(verifyTypedData(checked.typedData.domain, types, checked.typedData.message, signature), wallet.address);
  for (const bad of [
    null, { ...request, primaryType: 'Permit' },
    { ...request, types: { ...request.types, Permit: [] } },
    { ...request, domain: { ...request.domain, chainId: 1 } },
    { ...request, message: { ...request.message, value: '0' } },
    { ...request, message: { ...request.message, extra: '1' } },
    { ...request, message: { ...request.message, validBefore: '1700000000' } },
  ]) assert.throws(() => paymentRequest(bad, 1_800_000_000_000), /INVALID_PAYMENT_REQUEST/);
});
