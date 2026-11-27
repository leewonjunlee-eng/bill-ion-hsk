// 사람이 처리해야 할 일. 이벤트 기록이 아니라 현재 상태에서 계산하므로, 처리한 일은 자연히 빠진다.

import { won } from '../public/core.js';

export const isFlagged = (line) => Boolean(line) && line.confidence < 0.7 && !line.confirmed;

// 보내는 사람이 답할 차례인 송금: 아직 안 보냈거나, 보냈다고 했는데 받는 사람이 "아직 안 들어왔어요"라고 한 것(#8 송금 확인).
// 뒤의 경우는 돈이 오갔을 수 있어서 상태를 sent로 둔다(대체·계좌 다시 채우기 같은 안 보낸 돈 규칙이 걸리지 않게)
export const awaitsSender = (t) => ['scheduled', 'due', 'opened'].includes(t.status) || (t.status === 'sent' && Boolean(t.notReceivedAt));

export function pendingActions({ room, expenses = [], invoices = [], disputes = [], transfers = [] }) {
  // 지출이 바뀌어 방 version이 오르면 이전 version의 청구서·송금은 다시 보낼 때까지 할 일에서 뺀다
  const current = (x) => !room || x.version === room.version;
  const name = (uid) => room?.members.find((m) => m.uid === uid)?.name ?? uid;
  const out = [];
  for (const exp of expenses) {
    for (const it of exp.items ?? []) {
      if (isFlagged(exp.alloc?.[it.id])) {
        out.push({ type: 'confirm_line', ref: `${exp.id}:${it.id}`, for: exp.createdBy, text: `How should ‘${it.name}’ be split?`, expenseId: exp.id, itemId: it.id });
      }
    }
  }
  // 자동 수락 한도를 넘어 비서가 주인에게 물은 청구서
  for (const inv of invoices.filter((i) => i.status === 'asked' && current(i))) {
    out.push({ type: 'answer_invoice', ref: inv.id, for: inv.to, text: `Accept the ${won(-inv.net)} invoice?`, invoiceId: inv.id });
  }
  // 이의: 중재 전에는 지출을 낸 사람에게 중재를 맡길지, 중재안이 나오면 아직 동의하지 않은 당사자에게 묻는다.
  // 상대가 중재안을 고쳤으면(#62) 누가 고쳤는지 함께 알린다
  for (const d of disputes) {
    const exp = expenses.find((e) => e.id === d.expenseId);
    if (!exp) continue;
    const base = { type: 'agree_dispute', ref: d.id, disputeId: d.id, expenseId: exp.id };
    if (d.status === 'open') out.push({ ...base, for: exp.payer, text: `‘${exp.title}’ has a dispute. Send it to the mediator agent?` });
    if (d.status === 'proposed') {
      const by = d.proposal?.revisedBy;
      for (const uid of [...new Set([exp.payer, d.by])].filter((u) => !d.agreedBy.includes(u))) {
        out.push({ ...base, for: uid, text: by && by !== uid ? `${name(by)} revised the mediation proposal for ‘${exp.title}’. Do you agree?` : `Do you agree to the mediation proposal for ‘${exp.title}’?` });
      }
    }
  }
  // 송금: 때가 된 것은 보내는 사람에게, 받는 계좌가 없으면 받는 사람에게(한 번만), 보낸 뒤에는 받는 사람에게 확인을
  const live = transfers.filter((t) => ['scheduled', 'due', 'opened'].includes(t.status) && current(t));
  for (const t of live.filter((x) => x.status !== 'scheduled')) {
    const text = t.status === 'opened' ? `Did you send ${won(t.amount)} to ${name(t.to)}?` : `Send ${won(t.amount)} to ${name(t.to)}?`;
    out.push({ type: 'approve_transfer', ref: t.id, for: t.from, transferId: t.id, text });
  }
  // 받는 사람이 "아직 안 들어왔어요"라고 한 송금(#8 송금 확인). 보냈다고 한 기록이라 지출이 바뀌어도(이전 version이어도) 묻는다
  for (const t of transfers.filter((x) => x.status === 'sent' && awaitsSender(x))) {
    out.push({ type: 'approve_transfer', ref: t.id, for: t.from, transferId: t.id, text: `${name(t.to)} reported not receiving ${won(t.amount)} yet` });
  }
  for (const to of new Set(live.filter((t) => !t.link && !t.fallback).map((t) => t.to))) {
    out.push({ type: 'set_payout', ref: `payout:${to}`, for: to, text: 'Add your receiving account so money can be sent to you right away' });
  }
  // 보낸 뒤에는 받는 사람에게 확인을. 안 들어왔다고 한 뒤에도 남겨서, 돈이 늦게 들어오면 여기서 끝낼 수 있게 한다
  for (const t of transfers.filter((x) => x.status === 'sent')) {
    const text = t.notReceivedAt ? `Let us know when the ${won(t.amount)} from ${name(t.from)} arrives`
      : t.recheckedAt ? `${name(t.from)} checked the transfer history. Did you receive ${won(t.amount)}?`
      : `Did you receive ${won(t.amount)} from ${name(t.from)}?`;
    out.push({ type: 'confirm_receipt', ref: t.id, for: t.to, transferId: t.id, text });
  }
  return out;
}
