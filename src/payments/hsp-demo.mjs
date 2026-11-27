import { createHash, randomUUID } from 'node:crypto';
import { HttpError, readJson, send } from '../http.mjs';
import { mediateWithGemini } from '../agents/mediate.mjs';

const ROOT = '/api/hsp-demo/rooms/:id';
const ROOM = 'shared-receipt';
const MEMBERS = ['a', 'b', 'c'];
const PAYABLE_EDGE = 'b-to-a';

// 합성 영수증과 이의. 원본 중재 비서에 그대로 넣는다. unit은 데모 단위다
const NAMES = MEMBERS.map((uid) => ({ uid, name: uid.toUpperCase() }));
const RECEIPT = {
  title: 'Event after-party', payer: 'a', method: 'card', time: '21:30', split: 'items', present: MEMBERS,
  items: [
    { id: 'supplies', name: 'Shared snacks', qty: 1, unit: 6, time: '19:00', tags: ['나눠 먹는 안주'] },
    { id: 'extras', name: 'Extra snacks', qty: 1, unit: 3, time: '20:40', tags: ['나눠 먹는 안주'] },
  ],
};
const DISPUTE = {
  by: 'b',
  claim: 'I left at 20:00, so I didn’t eat the extra snacks ordered after that.',
  evidence: [{ kind: 'left_at', time: '20:00', summary: 'B’s self-report: left at 20:00', requiresHumanApproval: true }],
};
const COUNTER = ['The extra snacks were ordered at 20:40 and the card was charged at 21:30.'];

// 비서가 낸 것은 누가 부담하는지(consumers)뿐이다. 몫과 지급액은 여기서 계산한다
function buildSnapshot(version, expiresAt, alloc, mediation) {
  const lines = RECEIPT.items.map((item) => ({
    id: item.id, label: item.name, time: item.time, halfUnits: item.unit * 2,
    members: alloc?.[item.id].consumers ?? MEMBERS, reason: alloc?.[item.id].reason ?? null,
  }));
  const shares = Object.fromEntries(MEMBERS.map((uid) => [
    uid, lines.reduce((total, line) => total + (line.members.includes(uid) ? line.halfUnits / line.members.length : 0), 0),
  ]));
  // 나누어떨어지지 않거나 B가 낼 몫이 없는 제안은 지급안이 될 수 없다
  if (!Object.values(shares).every(Number.isSafeInteger) || !(shares.b > 0)) throw new HttpError(409, 'MEDIATION_UNUSABLE');
  const snapshot = {
    roomId: ROOM, id: `v${version}`, version, expiresAt, lines, shares, mediation,
    payment: {
      id: PAYABLE_EDGE, payer: 'b', payee: 'a', token: 'MOCK', decimals: 6,
      atomicPerHalfUnit: '5000', atomicAmount: (BigInt(shares.b) * 5000n).toString(),
    },
    unpaidEdge: 'c-to-a',
  };
  const hash = createHash('sha256').update(JSON.stringify(['bill-ion-local-hsp-demo', snapshot])).digest('hex');
  return { ...snapshot, hash };
}

async function fields(req, allowed) {
  const body = await readJson(req);
  if (!body || typeof body !== 'object' || Object.keys(body).length !== allowed.length ||
      !allowed.every((field) => Object.hasOwn(body, field) && typeof body[field] === 'string' && body[field])) {
    throw new HttpError(400, 'INVALID_FIELDS');
  }
  return body;
}

export function registerHspDemoRoutes(routes, {
  authenticate,
  clock,
  createMockOrder = async ({ id }) => ({ id: `mock-order-${id}` }),
  hspDemoStore,
  gemini = null,
}) {
  function initial() {
    const expiresAt = new Date(clock().getTime() + 24 * 60 * 60 * 1000).toISOString();
    return { snapshots: [buildSnapshot(1, expiresAt, null, null)], version: 1, approvals: [], payment: null };
  }
  let memory;
  const read = () => hspDemoStore?.read() ?? memory;
  const change = (update) => {
    if (hspDemoStore) return hspDemoStore.change(initial, update);
    const draft = memory ? structuredClone(memory) : initial();
    const result = update(draft);
    memory = draft;
    return result;
  };
  const currentOf = (state) => state.snapshots[state.version - 1];

  async function member(req, id) {
    const { uid } = await authenticate(req);
    if (id !== ROOM || !MEMBERS.includes(uid)) throw new HttpError(404, 'ROOM_NOT_FOUND');
    return uid;
  }

  function matchSnapshot(current, id, hash) {
    if (id !== current.id) throw new HttpError(409, 'STALE_SNAPSHOT');
    if (hash !== current.hash) throw new HttpError(409, 'HASH_MISMATCH');
  }

  function requireUnexpired(current) {
    if (clock().getTime() >= Date.parse(current.expiresAt)) throw new HttpError(409, 'SNAPSHOT_EXPIRED');
  }

  function view(state) {
    return { mode: 'mock', current: currentOf(state), previous: state.version === 2 ? state.snapshots[0] : null, requiredApprovers: MEMBERS, approvals: state.approvals, payment: state.payment };
  }

  routes.get(ROOT, async ({ req, params }) => {
    await member(req, params.id);
    return view(read() ?? change((state) => state));
  });

  routes.post(`${ROOT}/revise`, async ({ req, params }) => {
    const uid = await member(req, params.id);
    const { snapshotId, snapshotHash } = await fields(req, ['snapshotId', 'snapshotHash']);
    if (uid !== 'b') throw new HttpError(403, 'REVISION_AUTHOR_REQUIRED');
    const check = (state) => {
      const current = currentOf(state);
      matchSnapshot(current, snapshotId, snapshotHash);
      requireUnexpired(current);
      if (state.payment || state.version !== 1) throw new HttpError(409, 'REVISION_LOCKED');
      return current;
    };
    // 막힌 요청으로는 비서를 부르지 않는다. 비서 호출은 저장 트랜잭션 밖에서 하고, 저장할 때 다시 검사한다
    check(read() ?? change((state) => state));
    const { summary, alloc, source } = await mediateWithGemini(gemini, {
      exp: RECEIPT, room: { members: NAMES }, dispute: DISPUTE, counter: COUNTER, memoryByUid: {},
    });
    return change((state) => {
      const { expiresAt } = check(state);
      state.snapshots = [state.snapshots[0], buildSnapshot(2, expiresAt, alloc, {
        source, summary, claim: DISPUTE.claim, counter: COUNTER[0],
      })];
      state.version = 2;
      state.approvals = [];
      return view(state);
    });
  });

  routes.post(`${ROOT}/snapshots/:snapshotId/approvals`, async ({ req, params }) => {
    const uid = await member(req, params.id);
    const { snapshotHash } = await fields(req, ['snapshotHash']);
    return change((state) => {
      const current = currentOf(state);
      matchSnapshot(current, params.snapshotId, snapshotHash);
      requireUnexpired(current);
      if (!state.approvals.includes(uid)) state.approvals.push(uid);
      return { snapshotId: current.id, approvedBy: uid, approvals: state.approvals };
    });
  });

  routes.post(`${ROOT}/payments`, async ({ req, res, params }) => {
    const uid = await member(req, params.id);
    const { snapshotId, snapshotHash, edgeId } = await fields(req, ['snapshotId', 'snapshotHash', 'edgeId']);
    const reservation = change((state) => {
      const current = currentOf(state);
      matchSnapshot(current, snapshotId, snapshotHash);
      if (edgeId !== PAYABLE_EDGE) throw new HttpError(409, 'EDGE_NOT_PAYABLE');
      if (uid !== current.payment.payer) throw new HttpError(403, 'PAYER_REQUIRED');
      if (state.payment) return { payment: state.payment };
      requireUnexpired(current);
      if (state.version !== 2) throw new HttpError(409, 'DISPUTE_OPEN');
      if (!MEMBERS.every((participant) => state.approvals.includes(participant))) throw new HttpError(409, 'APPROVALS_MISSING');
      state.payment = { id: randomUUID(), snapshotId, snapshotHash, edgeId, mode: 'mock', status: 'CREATING' };
      return { payment: state.payment, atomicAmount: current.payment.atomicAmount };
    });
    if (!reservation.atomicAmount) return reservation.payment;
    let result;
    try {
      const order = await createMockOrder({ ...reservation.payment, atomicAmount: reservation.atomicAmount });
      if (typeof order?.id !== 'string' || !order.id) throw new Error('Missing mock order ID');
      result = { status: 'ORDER_CREATED', orderId: order.id };
    } catch {
      result = { status: 'UNKNOWN' };
    }
    send(res, 201, change((state) => {
      state.payment = { ...state.payment, ...result };
      return state.payment;
    }));
  });
}
