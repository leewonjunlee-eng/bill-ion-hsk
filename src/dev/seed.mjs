// 개발용 시드: 데모 시나리오(오사카 2박 3일)를 실제 방 데이터 모양으로 넣는다.
// 데모 화면은 이름을 uid로 쓰지만, 실제 방의 uid는 ASCII여야 해서(HTTP 헤더·Firebase uid) 여기서 바꾼다.
// #4 방 만들기가 생기면 이 시드는 개발·데모 확인용으로만 남는다.
import { DEMO_ROOM, DEMO_EXPENSES, DEMO_MEMORY, DEMO_RULES } from '../../public/data.js';
import { ON_DISPUTE } from '../../public/agent-rules.js';

// public/data.js의 데모 이름. 영어 이름과 예전 한국어 이름을 모두 같은 uid로 읽는다
export const DEMO_UIDS = { Me: 'me', Chulsoo: 'cs', Younghee: 'yh', Minsu: 'ms', 나: 'me', 철수: 'cs', 영희: 'yh', 민수: 'ms' };
const uid = (name) => DEMO_UIDS[name] ?? name;
// 데모 규칙은 표시 문구로 적혀 있다. 보낼 시기는 문구에 날짜가 있으면 매달 그날, 없으면(예전의 '바로' 포함) 편할 때다
const sendWhenFrom = (label) => {
  const day = Number(/\d+/.exec(label)?.[0]);
  return day ? { payday: day } : 'manual';
};
// 이의 처리는 지금 표시 문구(ON_DISPUTE)와 예전 한국어 문구를 모두 읽는다
const LEGACY_ON_DISPUTE = { '중재 비서에게 맡기기': 'mediator', '나에게 묻기': 'ask', '근거가 있으면 이의 제기': 'evidence' };
const onDisputeFrom = (label) => Object.keys(ON_DISPUTE).find((k) => k === label || ON_DISPUTE[k] === label) ?? LEGACY_ON_DISPUTE[label] ?? 'ask';
const mapKeys = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [uid(k), v]));

// 시연 전에 같은 시나리오로 돌아가도록 네 사람의 비서 문서를 시드 값으로 덮어쓴다(다른 데모 방에도 적용된다. 비서 설정은 사람마다 하나)
export async function seedDemoRoom(store, { id }) {
  const room = {
    ...structuredClone(DEMO_ROOM),
    id,
    members: DEMO_ROOM.members.map((m) => ({ uid: uid(m.uid), name: m.name })),
    policyAgreedBy: DEMO_ROOM.policyAgreedBy.map(uid),
    createdBy: uid(DEMO_ROOM.createdBy),
    fx: { ...structuredClone(DEMO_ROOM.fx), cash: mapKeys(DEMO_ROOM.fx.cash) },
  };
  await store.put('rooms', room);

  for (const e of DEMO_EXPENSES) {
    const { source, ...rest } = structuredClone(e);
    await store.put('expenses', {
      ...rest,
      id: `${id}-${e.id}`,
      roomId: id,
      payer: uid(e.payer),
      present: e.present.map(uid),
      source: /영수증|receipt/i.test(source) ? 'receipt' : 'manual',
      createdBy: uid(e.payer),
    });
  }

  // 가상 계좌다. 실제 계좌가 아니다.
  for (const [i, m] of DEMO_ROOM.members.entries()) {
    const r = DEMO_RULES[m.uid];
    await store.put('agents', {
      id: uid(m.uid),
      uid: uid(m.uid),
      memory: [...DEMO_MEMORY[m.uid]],
      rules: { autoAccept: r.autoAccept, sendWhen: sendWhenFrom(r.sendWhen), onDispute: onDisputeFrom(r.onDispute) },
      payout: { bank: 'Toss Bank', accountNo: `10000000000${i + 1}`, holder: m.name },
      onboardedAt: new Date().toISOString(),
    });
  }

  await store.appendEvent(id, { from: 'system', to: 'all', kind: 'room_created', text: `Created a demo room for development. It has ${DEMO_EXPENSES.length} expenses.` });
  return room;
}
