import { ContractFactory, getAddress, ZeroAddress } from 'ethers';
import { buildEvidenceRegistry } from './build-evidence-registry.mjs';

try {
  const [network, writerArg] = process.argv.slice(2);
  if (!['133', '177'].includes(network) || !writerArg || process.argv.length !== 4) {
    throw new Error('Usage: node scripts/prepare-evidence-registry-deployment.mjs <133|177> <writer-address>');
  }
  const writer = getAddress(writerArg);
  if (writer === ZeroAddress) throw new Error('The writer address must be nonzero');
  const { abi, bytecode, compiler } = await buildEvidenceRegistry();
  const transaction = await new ContractFactory(abi, bytecode).getDeployTransaction(writer);
  console.log(JSON.stringify({
    chainId: Number(network), writer, compiler,
    unsignedTransaction: { data: transaction.data, value: '0x0' },
  }, null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
