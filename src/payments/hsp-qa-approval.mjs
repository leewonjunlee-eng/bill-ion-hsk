import { getAddress, ZeroAddress, id, verifyMessage } from 'ethers';

const digest = /^0x[0-9a-f]{64}$/i;

export function describeHspQaApproval(manifest) {
  if (!manifest || !/^[a-zA-Z0-9_-]{1,80}$/.test(manifest.roomId ?? '') ||
      !Number.isSafeInteger(manifest.version) || manifest.version < 1 ||
      typeof manifest.snapshotCommitment !== 'string' || !digest.test(manifest.snapshotCommitment) ||
      /^0x0{64}$/i.test(manifest.snapshotCommitment) ||
      !Array.isArray(manifest.participants) || manifest.participants.length !== 3 ||
      typeof manifest.merchantName !== 'string' || !/^[^\r\n\t]{1,100}$/.test(manifest.merchantName) ||
      ![133, 11155111].includes(manifest.chainId) ||
      typeof manifest.atomicAmount !== 'string' || !/^[1-9][0-9]{0,11}0000$/.test(manifest.atomicAmount) ||
      typeof manifest.validUntil !== 'string' || !Number.isFinite(Date.parse(manifest.validUntil))) {
    throw new Error('HSP_APPROVAL_MANIFEST_INVALID');
  }
  const participants = manifest.participants.map(getAddress);
  const payer = getAddress(manifest.payer);
  const payee = getAddress(manifest.payee);
  const token = getAddress(manifest.token);
  if (new Set(participants).size !== 3 || participants.includes(ZeroAddress) || token === ZeroAddress ||
      payer === payee || !participants.includes(payer) || !participants.includes(payee)) {
    throw new Error('HSP_APPROVAL_PARTICIPANTS_INVALID');
  }
  const approval = {
    roomId: manifest.roomId, version: manifest.version, snapshotCommitment: manifest.snapshotCommitment.toLowerCase(),
    chainId: manifest.chainId, payer, payee, token, merchantName: manifest.merchantName,
    atomicAmount: manifest.atomicAmount, validUntil: new Date(manifest.validUntil).toISOString(),
  };
  const message = [
    'Bill:ION QA settlement approval v1',
    `Room: ${approval.roomId}`, `Revision: ${approval.version}`, `Snapshot: ${approval.snapshotCommitment}`,
    `Participants: ${participants.join(', ')}`, `Chain ID: ${approval.chainId}`,
    `Payer: ${payer}`, `Recipient: ${payee}`, `Token: ${token}`, `Merchant: ${approval.merchantName}`,
    `Amount (atomic units): ${approval.atomicAmount}`, `Expires: ${approval.validUntil}`,
  ].join('\n');
  return { approval: { ...approval, revisionCommitment: id(message) }, participants, message };
}

export function verifyHspQaApproval(manifest, signatures, now = Date.now()) {
  const { approval, participants, message } = describeHspQaApproval(manifest);
  if (Date.parse(approval.validUntil) <= now) throw new Error('HSP_APPROVAL_MANIFEST_EXPIRED');
  if (!Array.isArray(signatures) || signatures.length !== participants.length) throw new Error('HSP_ALL_APPROVALS_REQUIRED');
  let signers;
  try {
    signers = signatures.map((signature) => verifyMessage(message, signature));
  } catch {
    throw new Error('HSP_APPROVAL_SIGNATURE_INVALID');
  }
  if (!participants.every((participant) => signers.includes(participant))) throw new Error('HSP_ALL_APPROVALS_REQUIRED');
  return approval;
}
