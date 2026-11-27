import { readFile } from 'node:fs/promises';
import { validateHspSigningRequest } from '../src/payments/hsp-signing-policy.mjs';

try {
  if (process.argv.length !== 4) throw new Error('Usage: node scripts/check-hsp-signing-request.mjs <prepared.json> <approved-terms.json>');
  const [prepared, terms] = await Promise.all(process.argv.slice(2).map(async (file) => JSON.parse(await readFile(file, 'utf8'))));
  console.log(JSON.stringify(validateHspSigningRequest(prepared, terms), null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
