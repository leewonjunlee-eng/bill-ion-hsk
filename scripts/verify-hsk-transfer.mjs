import { readFile } from 'node:fs/promises';
import { createChainRpc, verifyChainTransfer } from '../src/payments/chain-receipt.mjs';

const rpcUrls = new Map([[177, 'https://mainnet.hsk.xyz'], [133, 'https://testnet.hsk.xyz']]);
try {
  const filename = process.argv[2];
  if (!filename || process.argv.length !== 3) throw new Error('Usage: node scripts/verify-hsk-transfer.mjs <expectation.json>');
  const expected = JSON.parse(await readFile(filename, 'utf8'));
  const url = rpcUrls.get(expected.chainId);
  if (!url) throw new Error('Expected HSK Chain ID 177 or 133');
  const result = await verifyChainTransfer(createChainRpc(url), expected);
  console.log(JSON.stringify({ ...result, evidence: 'chain-transfer' }, null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
