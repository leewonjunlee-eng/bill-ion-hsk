// 돈 계산은 모두 여기서 한다. 화면·서버·테스트가 함께 쓴다.
// AI는 '줄마다 누구 몫인가'만 추정하고, 환율 적용·나누기·송금 경로는 코드가 정한다.
// 모든 함수는 방(room)과 지출(expense)을 인자로 받는다. 사람 키는 member.uid다.

export const won = (n) => `₩${Math.round(n).toLocaleString('en-US')}`;
export const yen = (n) => `¥${Math.round(n).toLocaleString('en-US')}`;
// 원·엔이 아닌 외화는 센트 같은 소수 둘째 자리까지 보인다(#55 외화 방)
export const money = (n, currency) => (currency === 'KRW' ? won(n) : currency === 'JPY' ? yen(n) : `${(Math.round(n * 100) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })} ${currency}`);
// 'YYYY-MM-DD' → 'M/D'
export const dayLabel = (d) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

export const amountOf = (exp) => (exp.items ? exp.items.reduce((s, it) => s + it.qty * it.unit, 0) : exp.amount);

const nameOf = (members, uid) => members.find((m) => m.uid === uid)?.name ?? uid;

// 방에서 지금 함께하는 멤버. 탈퇴한 사람(deleted)과 방에서 나간 사람(left, #55)은 지출·송금 기록에만 남는다
export const active = (m) => !m.deleted && !m.left;
// 외화 지출을 정산하는 방(#55). 환율 정책은 이 방에만 있고, 원화 방(fx 없음)은 정책을 묻지도 보이지도 않는다.
// 예전 원화 방에 남은 policy·policyAgreedBy 값은 이 판단으로 읽을 때 무시한다
export const isForeign = (room) => Boolean(room?.fx?.currency);

// 환율 정책에 따라 이 지출을 원화로 바꾸고, 그 근거를 한 줄로 남긴다.
export function toKrw(exp, room, policy) {
  const amount = amountOf(exp);
  if (exp.currency === 'KRW') return { krw: amount, how: 'Paid in KRW' };
  const fx = room.fx;
  const cur = money(amount, exp.currency);
  const day = fx.base[exp.date];
  if (policy === 'settle' && fx.settle) {
    return { krw: Math.round((amount * fx.settle.rate) / 100), how: `${cur} × settlement-day (${dayLabel(fx.settle.date)}) base rate ${fx.settle.rate.toFixed(2)} KRW/100` };
  }
  // 정산일 환율은 청구서를 처음 보낼 때 정해진다(#55). 그 전에는 결제일 기준율로 미리 보여 준다
  if (policy === 'payday' || policy === 'settle') {
    const later = policy === 'settle' ? ' · the settlement-day rate is set when invoices are sent' : '';
    return { krw: Math.round((amount * day) / 100), how: `${cur} × payment-day (${dayLabel(exp.date)}) base rate ${day.toFixed(2)} KRW/100${later}` };
  }
  if (exp.method === 'card') {
    return {
      krw: Math.round(((amount * day) / 100) * (1 + fx.cardFee)),
      how: `Card charge: ${cur} × ${day.toFixed(2)} KRW/100 × foreign transaction fee ${(fx.cardFee * 100).toFixed(1)}%`,
    };
  }
  const rate = fx.cash?.[exp.payer];
  // 환전한 환율을 적지 않았으면(#55 실제 방) 결제일 기준율로 셈하고 그렇다고 밝힌다
  if (!rate) return { krw: Math.round((amount * day) / 100), how: `Cash: ${cur} × payment-day (${dayLabel(exp.date)}) base rate ${day.toFixed(2)} KRW/100 · no exchange rate recorded for ${nameOf(room.members, exp.payer)}` };
  return { krw: Math.round((amount * rate) / 100), how: `Cash: ${cur} × ${nameOf(room.members, exp.payer)}’s average exchange rate ${rate.toFixed(2)} KRW/100` };
}

// 사람별 몫. split이 'items'면 줄마다 그 줄의 몫인 사람끼리 나누고, 아니면 함께 있던 사람이 똑같이 나눈다.
// 원 단위로 나누고 남은 돈(rest)은 낸 사람 몫에 더한다.
export function shares(exp, room, policy, alloc = exp.alloc) {
  const { krw } = toKrw(exp, room, policy);
  const amount = amountOf(exp);
  const share = {};
  if (exp.split === 'items' && exp.items) {
    for (const it of exp.items) {
      const who = alloc?.[it.id]?.consumers?.length ? alloc[it.id].consumers : exp.present;
      for (const p of who) share[p] = (share[p] || 0) + (it.qty * it.unit) / who.length;
    }
  } else {
    for (const p of exp.present) share[p] = amount / exp.present.length;
  }
  const krwShare = {};
  let sum = 0;
  for (const p of Object.keys(share)) {
    krwShare[p] = Math.floor((krw * share[p]) / amount);
    sum += krwShare[p];
  }
  const rest = krw - sum;
  krwShare[exp.payer] = (krwShare[exp.payer] || 0) + rest;
  return { krw, share, krwShare, rest };
}

// 사람별 낸 돈, 내 몫, 차액(+면 받을 돈, −면 보낼 돈)
export function ledger(room, expenses, policy) {
  const rows = Object.fromEntries(room.members.map((m) => [m.uid, { paid: 0, owed: 0, net: 0 }]));
  for (const exp of expenses) {
    const s = shares(exp, room, policy);
    rows[exp.payer].paid += s.krw;
    for (const [p, v] of Object.entries(s.krwShare)) rows[p].owed += v;
  }
  for (const uid of Object.keys(rows)) rows[uid].net = rows[uid].paid - rows[uid].owed;
  return rows;
}

// 가장 많이 보낼 사람이 가장 많이 받을 사람에게 보내는 식으로 송금 횟수를 줄인다(사람 수 − 1번 이하).
export function settle(rows) {
  const uids = Object.keys(rows);
  const cred = uids.filter((p) => rows[p].net > 0).map((p) => ({ p, v: rows[p].net })).sort((a, b) => b.v - a.v);
  const debt = uids.filter((p) => rows[p].net < 0).map((p) => ({ p, v: -rows[p].net })).sort((a, b) => b.v - a.v);
  const out = [];
  let i = 0;
  let j = 0;
  while (i < debt.length && j < cred.length) {
    const amount = Math.min(debt[i].v, cred[j].v);
    if (amount > 0) out.push({ from: debt[i].p, to: cred[j].p, amount });
    debt[i].v -= amount;
    cred[j].v -= amount;
    if (debt[i].v === 0) i++;
    if (cred[j].v === 0) j++;
  }
  return out;
}

// --- Gemini가 없을 때 쓰는 규칙 배분. 서버의 대체 응답과 화면의 오프라인 모드가 함께 쓴다. ---
const mentions = (memory, p, re) => (memory[p] || []).find((m) => re.test(m));
// 비서 기억은 사람이 쓴 글이라 한국어와 영어를 모두 알아본다
const NO = String.raw`\b(?:don['’]?t|doesn['’]?t|do not|does not|can['’]?t|cannot|can not|won['’]?t|never)`;
const NO_ALCOHOL = new RegExp(String.raw`술을\s*(?:마시지|안\s*마시|못\s*마시)|${NO}\s+(?:drink|have)s?\s+(?:any\s+)?(?:alcohol|liquor)\b`, 'i');
const NO_RAW = new RegExp(String.raw`날생선|회를?\s*(?:먹지|안\s*먹|못\s*먹)|${NO}\s+(?:eat|have)s?\s+(?:any\s+)?(?:raw\s+(?:fish|seafood)|sashimi)\b`, 'i');
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function ruleAllocate(exp, memoryByUid, members, presentAt = () => exp.present) {
  const name = (uid) => nameOf(members, uid);
  const out = {};
  for (const it of exp.items) {
    const present = presentAt(it);
    const notes = [];
    const eligible = present.filter((p) => {
      const m = (it.tags.includes('술') && mentions(memoryByUid, p, NO_ALCOHOL)) || (it.tags.includes('날생선') && mentions(memoryByUid, p, NO_RAW));
      if (m) notes.push(`${name(p)}'s agent memory “${m}”`);
      return !m;
    });
    const itemRe = new RegExp(escapeRe(it.name), 'i');
    const named = eligible.filter((p) => mentions(memoryByUid, p, itemRe));
    const sober = present.filter((p) => mentions(memoryByUid, p, NO_ALCOHOL));
    const except = notes.length ? ` (${notes.join(', ')} → excluded)` : '';
    if (it.tags.includes('나눠 먹는 안주')) {
      out[it.id] = { consumers: eligible, confidence: 0.9, reason: `A shared dish for everyone present${except}.` };
    } else if (it.qty === eligible.length) {
      out[it.id] = { consumers: eligible, confidence: 0.85, reason: `${it.qty} items, one each for ${eligible.map(name).join(', ')}${except}.` };
    } else if (it.qty === 1 && named.length === 1) {
      out[it.id] = { consumers: named, confidence: 0.75, reason: `From ${name(named[0])}'s agent memory: “${mentions(memoryByUid, named[0], itemRe)}”.` };
    } else if (it.tags.includes('무알코올 음료') && sober.length === it.qty) {
      out[it.id] = { consumers: sober, confidence: 0.75, reason: `Treated as a drink for ${sober.map(name).join(', ')}, who do not drink alcohol.` };
    } else {
      out[it.id] = { consumers: eligible, confidence: 0.35, reason: 'Agent memories give no evidence for who owes this. Please confirm.' };
    }
  }
  return out;
}

// uid가 time에 자리를 떠났다면, 그 뒤의 주문에서는 그 사람을 뺀다.
export const presentAfter = (exp, uid, time) => (it) =>
  it.time > time ? exp.present.filter((p) => p !== uid) : exp.present;
