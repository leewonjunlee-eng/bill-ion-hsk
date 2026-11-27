// 방에서 빠지는 조건(#55). 서버(src/rooms/policy.mjs)가 나가기·내보내기를 막을 때와, 화면이 누르기 전에 이유를 보여 줄 때 같은 규칙을 쓴다.
import { won } from './core.js';
import { disputeLive } from './ui.js';

// 이 사람이 지금 방에서 빠지면 정산이 안 끝난 돈이 남는지. 남으면 사람에게 보여 줄 이유를, 아니면 null을 돌려준다.
// 완료된 방은 늘 빠질 수 있다. 정산 전에는 그 사람이 낀 지출이 없어야 하고, 정산 중에는 방 전체가 끝나야 한다
// (내 송금이 끝났어도 남의 이의가 받아들여져 다시 나누면 내 몫이 바뀔 수 있다). self: 본인이 나가는지, 내보내는지
export function leaveBlock({ room, expenses = [], invoices = [], disputes = [], transfers = [] }, uid, { self = true } = {}) {
  if (room.status === 'done') return null;
  const name = (u) => room.members.find((m) => m.uid === u)?.name ?? u;
  const mine = expenses.filter((e) => e.payer === uid || e.present.includes(uid));
  if (!mine.length) return null; // 낀 돈이 없다. 청구서를 받았어도 0원이다
  const verb = self ? 'leave' : 'remove them';
  if (room.status !== 'settling') {
    const more = mine.length > 1 ? ` (and ${mine.length - 1} more)` : '';
    return `The expense “${mine[0].title}”${more} includes ${self ? 'your' : `${name(uid)}’s`} share. Take that share out or delete the expense, then you can ${verb}.`;
  }
  const current = (x) => x.version === room.version;
  const left = [
    ...transfers.filter((t) => current(t) && t.status !== 'confirmed' && t.status !== 'superseded' && (t.from === uid || t.to === uid))
      .map((t) => (t.from === uid ? `${won(t.amount)} to send to ${name(t.to)}` : `${won(t.amount)} to receive from ${name(t.from)}`)),
    ...(invoices.some((i) => current(i) && i.to === uid && i.status === 'asked') ? ['an invoice to review'] : []),
    ...(disputes.some((d) => disputeLive(d) && (d.by === uid || expenses.find((e) => e.id === d.expenseId)?.payer === uid)) ? ['an open dispute'] : []),
  ];
  if (left.length) return `Settlement isn’t finished, so you can’t ${verb} yet. Still open: ${left.join(', ')}`;
  return `This room’s settlement isn’t finished, so you can’t ${verb} yet. You can once every transfer ends with “Received”.`;
}
