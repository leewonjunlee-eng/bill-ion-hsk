import { createHash, randomBytes } from 'node:crypto';
import { describeHspQaApproval } from './hsp-qa-approval.mjs';

const participants = ['a', 'b', 'c'];
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function prepareQaManifestFromRoom({ roomStore, config, now = Date.now() }) {
  const missing = () => { throw new Error('HSP_QA_ROOM_NOT_INITIALIZED'); };
  return roomStore.change(missing, (state) => {
    const snapshot = state.snapshots?.[state.version - 1];
    if (state.version !== 2 || snapshot?.version !== 2 || snapshot.roomId !== 'shared-receipt' ||
        snapshot.payment?.id !== 'b-to-a' || snapshot.payment.payer !== 'b' || snapshot.payment.payee !== 'a') {
      throw new Error('HSP_QA_ROOM_REVISION_NOT_READY');
    }
    if (!(Date.parse(snapshot.expiresAt) > now)) throw new Error('HSP_QA_ROOM_REVISION_EXPIRED');
    const { hash: recordedHash, ...contents } = snapshot;
    if (hash(['bill-ion-local-hsp-demo', contents]) !== recordedHash) throw new Error('HSP_QA_ROOM_SNAPSHOT_MISMATCH');
    const shares = participants.map((id) => snapshot.shares?.[id]);
    if (shares.some((value) => !Number.isSafeInteger(value) || value < 0) ||
        shares.reduce((sum, value) => sum + value, 0) !== 18 || shares[1] === 0) {
      throw new Error('HSP_QA_ROOM_ALLOCATION_INVALID');
    }
    const salt = state.qaManifestSalt ?? randomBytes(32).toString('hex');
    const manifest = {
      roomId: snapshot.roomId, version: snapshot.version,
      snapshotCommitment: '0x' + hash(['bill-ion/qa-room-snapshot/v1', salt, contents]),
      participants: participants.map((id) => config.wallets?.[id]),
      payer: config.wallets?.b, payee: config.wallets?.a,
      chainId: config.chainId, token: config.token, merchantName: config.merchantName,
      atomicAmount: (BigInt(shares[1]) * 5000n).toString(), validUntil: snapshot.expiresAt,
    };
    const described = describeHspQaApproval(manifest);
    if (state.qaRevisionCommitment && state.qaRevisionCommitment !== described.approval.revisionCommitment) {
      throw new Error('HSP_QA_ROOM_TERMS_ALREADY_EXPORTED');
    }
    state.qaManifestSalt = salt;
    state.qaRevisionCommitment = described.approval.revisionCommitment;
    return { manifest, ...described };
  });
}
