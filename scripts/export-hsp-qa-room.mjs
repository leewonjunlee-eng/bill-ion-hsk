import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { openHspDemoStore } from '../src/payments/hsp-demo-store.mjs';
import { openHspQaOrders } from '../src/payments/hsp-qa-order.mjs';
import { prepareQaManifestFromRoom } from '../src/payments/hsp-room-manifest.mjs';

try {
  const [configFile, manifestFile] = process.argv.slice(2);
  if (!configFile || !manifestFile || process.argv.length !== 4) {
    throw new Error('Usage: node scripts/export-hsp-qa-room.mjs <qa-wallet-config.json> <new-current-manifest.json>');
  }
  const config = JSON.parse(await readFile(configFile, 'utf8'));
  const room = openHspDemoStore(fileURLToPath(new URL('../.hsp-demo.sqlite', import.meta.url)));
  let orders;
  try {
    const { manifest, approval, participants, message } = prepareQaManifestFromRoom({ roomStore: room, config });
    orders = openHspQaOrders(fileURLToPath(new URL('../.hsp-qa-orders.sqlite', import.meta.url)));
    orders.publishRevision({ ...approval, participants });
    await writeFile(manifestFile, JSON.stringify(manifest, null, 2), { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify({ revisionCommitment: approval.revisionCommitment, message }, null, 2));
  } finally {
    orders?.close();
    room.close();
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
