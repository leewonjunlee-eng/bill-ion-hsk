import { readFile, writeFile } from 'node:fs/promises';
import { createHspQaClient } from '../src/payments/hsp-qa-query.mjs';
import { prepareHspQaSigningRequest } from '../src/payments/hsp-qa-prepare.mjs';
import { createChainRpc } from '../src/payments/chain-receipt.mjs';

try {
  const [orderFile, preparedFile] = process.argv.slice(2);
  if (!orderFile || !preparedFile || process.argv.length !== 4) {
    throw new Error('Usage: node scripts/prepare-hsp-qa-signature.mjs <saved-order.json> <new-prepared.json>');
  }
  const order = JSON.parse(await readFile(orderFile, 'utf8'));
  const rpcUrl = new Map([[133, 'https://testnet.hsk.xyz'], [11155111, 'https://ethereum-sepolia-rpc.publicnode.com']]).get(order.chainId);
  if (!rpcUrl) throw new Error('Expected a supported QA testnet');
  const { prepared, walletRequest } = await prepareHspQaSigningRequest({
    call: createHspQaClient(), rpc: createChainRpc(rpcUrl), order,
  });
  await writeFile(preparedFile, JSON.stringify(prepared, null, 2), { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify(walletRequest, null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
