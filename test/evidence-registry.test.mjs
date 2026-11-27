import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BrowserProvider, ContractFactory, ZeroAddress, ZeroHash, id } from 'ethers';
import ganache from 'ganache';
import { buildEvidenceRegistry } from '../scripts/build-evidence-registry.mjs';
import { prepareEvidenceRecord } from '../scripts/prepare-evidence-record.mjs';

const rejectsWith = (promise, name) => assert.rejects(promise, (error) => error.revert?.name === name);

test('only the designated writer can publish unique, nonzero evidence', async () => {
  const engine = ganache.provider({ logging: { quiet: true }, chain: { chainId: 133 } });
  try {
    const provider = new BrowserProvider(engine);
    const [writer, stranger] = await Promise.all([provider.getSigner(0), provider.getSigner(1)]);
    const artifact = await buildEvidenceRegistry();
    const factory = new ContractFactory(artifact.abi, artifact.bytecode, writer);
    await assert.rejects(factory.deploy(ZeroAddress));
    const registry = await factory.deploy(await writer.getAddress());
    await registry.waitForDeployment();
    assert.equal(await registry.writer(), await writer.getAddress());

    const revision = id('synthetic revision');
    const proof = id('synthetic evidence');
    const otherRevision = id('other revision');
    const options = {
      rpc: (method, params = []) => engine.request({ method, params }), chainId: 133,
      registry: await registry.getAddress(), writer: await writer.getAddress(),
      evidence: { status: 'payment-safe', revision, proof, transfer: { chainId: 11155111, transactionHash: id('synthetic transfer') } },
    };
    const prepared = await prepareEvidenceRecord(options);
    const transfer = prepared.transferKey;
    await assert.rejects(prepareEvidenceRecord({ ...options, writer: await stranger.getAddress() }), /REGISTRY_CODE_OR_WRITER_MISMATCH/);
    await rejectsWith(registry.connect(stranger).record.staticCall(revision, transfer, proof), 'UnauthorizedWriter');
    for (const args of [[ZeroHash, transfer, proof], [revision, ZeroHash, proof], [revision, transfer, ZeroHash]]) {
      await rejectsWith(registry.record.staticCall(...args), 'EmptyEvidence');
    }

    const receipt = await (await writer.sendTransaction(prepared.unsignedTransaction)).wait();
    const event = registry.interface.parseLog(receipt.logs[0]);
    assert.equal(event.name, 'EvidenceRecorded');
    assert.deepEqual([...event.args], [revision, transfer, proof]);
    assert.equal(await registry.proofOf(revision), proof);
    assert.equal(await registry.revisionOfTransfer(transfer), revision);
    assert.equal((await prepareEvidenceRecord(options)).alreadyRecorded, true);
    await assert.rejects(prepareEvidenceRecord({
      ...options, evidence: { ...options.evidence, revision: otherRevision },
    }), /REGISTRY_EVIDENCE_CONFLICT/);
    await rejectsWith(registry.record.staticCall(revision, id('replacement'), proof), 'RevisionAlreadyRecorded');
    await rejectsWith(registry.record.staticCall(otherRevision, transfer, proof), 'TransferAlreadyRecorded');
    assert.equal(await registry.proofOf(otherRevision), ZeroHash);
    provider.destroy();
  } finally {
    await engine.disconnect();
  }
});
