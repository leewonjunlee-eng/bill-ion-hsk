import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import solc from 'solc';

export async function buildEvidenceRegistry() {
  const name = 'SettlementEvidenceRegistry.sol';
  const content = await readFile(new URL(`../contracts/${name}`, import.meta.url), 'utf8');
  const input = {
    language: 'Solidity',
    sources: { [name]: { content } },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: 'paris',
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object'] } },
    },
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = (output.errors ?? []).filter(({ severity }) => severity === 'error');
  if (errors.length) throw new Error(errors.map(({ formattedMessage }) => formattedMessage).join('\n'));
  const result = output.contracts[name].SettlementEvidenceRegistry;
  return {
    abi: result.abi,
    bytecode: '0x' + result.evm.bytecode.object,
    deployedBytecode: '0x' + result.evm.deployedBytecode.object,
    compiler: solc.version(),
    input,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(await buildEvidenceRegistry(), null, 2));
}
