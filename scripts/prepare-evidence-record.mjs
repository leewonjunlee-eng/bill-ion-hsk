import { ContractFactory, Interface, ZeroAddress, ZeroHash, getAddress, keccak256, solidityPacked } from 'ethers';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createChainRpc } from '../src/payments/chain-receipt.mjs';
import { hspProof, verifyHspSourceTransfer } from '../src/payments/hsp-qa-query.mjs';
import { isDeepStrictEqual } from 'node:util';
import { openHspEvidenceStore } from '../src/payments/hsp-evidence-store.mjs';
import { openHspQaOrders } from '../src/payments/hsp-qa-order.mjs';
import { buildEvidenceRegistry } from './build-evidence-registry.mjs';

export async function prepareEvidenceRecord({ rpc, chainId, registry, writer, evidence }) {
  if (![133, 177].includes(chainId) || BigInt(await rpc('eth_chainId')) !== BigInt(chainId)) {
    throw new Error('REGISTRY_CHAIN_MISMATCH');
  }
  const to = getAddress(registry);
  const from = getAddress(writer);
  const commitment = (value) => typeof value === 'string' && /^0x[\da-f]{64}$/i.test(value) && value !== ZeroHash;
  if (to === ZeroAddress || from === ZeroAddress) throw new Error('REGISTRY_ADDRESS_REQUIRED');
  if (!evidence || !['payment-safe', 'payment-finalized'].includes(evidence.status) ||
      !commitment(evidence.revision) || !commitment(evidence.proof) ||
      ![133, 11155111].includes(evidence.transfer?.chainId) || !commitment(evidence.transfer.transactionHash)) {
    throw new Error('VERIFIED_HSP_QA_EVIDENCE_REQUIRED');
  }
  const artifact = await buildEvidenceRegistry();
  const contract = new Interface(artifact.abi);
  const deployment = await new ContractFactory(artifact.abi, artifact.bytecode).getDeployTransaction(from);
  const [actual, expected] = await Promise.all([
    rpc('eth_getCode', [to, 'latest']),
    rpc('eth_call', [{ data: deployment.data }, 'latest']),
  ]);
  // The runtime includes the immutable writer, so this checks deployment and writer together.
  if (typeof expected !== 'string' || expected.length !== artifact.deployedBytecode.length ||
      typeof actual !== 'string' || actual.toLowerCase() !== expected.toLowerCase()) {
    throw new Error('REGISTRY_CODE_OR_WRITER_MISMATCH');
  }
  const { revision, proof, transfer } = evidence;
  const transferKey = keccak256(solidityPacked(
    ['string', 'uint256', 'bytes32'], ['bill-ion/hsp-transfer/v1', transfer.chainId, transfer.transactionHash],
  ));
  const lookup = async (method, key) => contract.decodeFunctionResult(method,
    await rpc('eth_call', [{ to, data: contract.encodeFunctionData(method, [key]) }, 'latest']))[0];
  const [existingProof, existingRevision] = await Promise.all([
    lookup('proofOf', revision), lookup('revisionOfTransfer', transferKey),
  ]);
  if (existingProof === proof && existingRevision === revision) return { chainId, registry: to, revision, proof, transferKey, alreadyRecorded: true };
  if (existingProof !== ZeroHash || existingRevision !== ZeroHash) throw new Error('REGISTRY_EVIDENCE_CONFLICT');
  const data = contract.encodeFunctionData('record', [revision, transferKey, proof]);
  await rpc('eth_call', [{ from, to, data }, 'latest']);
  return { chainId, registry: to, revision, proof, transferKey, unsignedTransaction: { from, to, data, value: '0x0' } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [network, registry, writer, flowId] = process.argv.slice(2);
    if (!['133', '177'].includes(network) || !registry || !writer || !flowId || process.argv.length !== 6) {
      throw new Error('Usage: node scripts/prepare-evidence-record.mjs <133|177> <registry> <writer> <verified-flow-id>');
    }
    const database = fileURLToPath(new URL('../.hsp-qa-evidence.sqlite', import.meta.url));
    const store = openHspEvidenceStore(database);
    let orders;
    try {
      orders = openHspQaOrders(fileURLToPath(new URL('../.hsp-qa-orders.sqlite', import.meta.url)));
      const evidence = store.get(flowId);
      const order = evidence?.revision ? orders.read(evidence.revision) : null;
      if (!order || order.status !== 'VERIFIED' || order.flowId !== flowId ||
          order.verifiedTransfer?.proof !== evidence.proof) throw new Error('VERIFIED_HSP_QA_ORDER_REQUIRED');
      const sourceUrl = { 133: 'https://testnet.hsk.xyz', 11155111: 'https://ethereum-sepolia-rpc.publicnode.com' }[order.chainId];
      if (!sourceUrl) throw new Error('HSP_QA_SOURCE_NETWORK_REQUIRED');
      const source = await verifyHspSourceTransfer(createChainRpc(sourceUrl), order, evidence.transfer.transactionHash);
      const recomputed = hspProof(order, source);
      if (order.paymentRequestId !== evidence.paymentRequestId || evidence.revision !== recomputed.revision ||
          order.verifiedTransfer.chainId !== source.chainId || order.verifiedTransfer.transactionHash !== source.transactionHash ||
          evidence.transfer.chainId !== source.chainId || evidence.transfer.blockHash !== source.blockHash ||
          evidence.transfer.logIndex !== source.logIndex || evidence.proof !== recomputed.proof ||
          !isDeepStrictEqual(evidence.terms, recomputed.terms)) {
        throw new Error('HSP_SOURCE_EVIDENCE_CHANGED');
      }
      const chainId = Number(network);
      const rpc = createChainRpc(chainId === 133 ? 'https://testnet.hsk.xyz' : 'https://mainnet.hsk.xyz');
      console.log(JSON.stringify(await prepareEvidenceRecord({ rpc, chainId, registry, writer, evidence }), null, 2));
    } finally {
      orders?.close();
      store.close();
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
