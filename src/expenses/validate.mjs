// 지출 입력 검증. 화면이 보낸 값을 믿지 않고, 방 멤버·통화·환율이 맞는지 확인한 뒤 정리된 지출을 돌려준다.
import { TAGS } from '../domain/types.mjs';
import { active } from '../../public/core.js';
import { decimalsOf } from '../../public/currencies.js';

const KINDS = ['stay', 'food', 'ticket', 'drink', 'shop', 'bus'];
const isInt = (n) => Number.isInteger(n);
// 외화 방(#55)의 달러·유로 같은 통화는 0.01 단위까지 받는다. 원·엔은 정수
const fits = (n, places) => Number.isFinite(n) && Math.abs(Math.round(n * 10 ** places) - n * 10 ** places) < 1e-6;
const unitText = (places) => (places ? `use steps of 0.${'0'.repeat(places - 1)}1.` : 'use a whole number.');
// 영수증 줄 id는 AI 프롬프트의 표와 배분 결과의 키로 쓰인다. 줄바꿈 등으로 프롬프트 모양을 바꾸지 못하게 형식을 좁힌다(#10)
const SAFE_ID = /^[A-Za-z0-9_-]{1,40}$/;

export function validateExpense(input, room) {
  const errors = [];
  const uids = room.members.filter(active).map((m) => m.uid);
  // 금액의 소수 자리는 그 방에서 쓰는 통화를 따른다. 방에 없는 통화는 아래에서 걸러진다
  const places = input?.currency !== 'KRW' && input?.currency === room.fx?.currency ? decimalsOf(input.currency) : 0;
  const title = String(input?.title ?? '').replace(/\s+/g, ' ').trim().slice(0, 40) || 'Expense';

  let items;
  let amount;
  if (Array.isArray(input?.items) && input.items.length) {
    if (input.items.length > 50) errors.push('A receipt can have up to 50 lines.');
    items = input.items.slice(0, 50).map((it, i) => ({
      id: String(it.id || `line-${i + 1}`),
      name: String(it.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 40) || `Item ${i + 1}`,
      qty: Number(it.qty),
      unit: Number(it.unit),
      ...(/^\d{2}:\d{2}$/.test(it.time ?? '') ? { time: it.time } : {}),
      tags: (Array.isArray(it.tags) ? it.tags : []).map((t) => (TAGS.includes(t) ? t : '기타')).filter((t, j, a) => a.indexOf(t) === j),
    }));
    if (items.some((it) => !SAFE_ID.test(it.id))) errors.push('A receipt line id has an invalid format.');
    if (items.some((it) => !isInt(it.qty) || it.qty < 1 || it.qty > 99)) errors.push('Quantity must be a whole number from 1 to 99.');
    if (items.some((it) => !fits(it.unit, places))) errors.push(`For the unit price, ${unitText(places)}`);
    const sum = items.reduce((s, it) => s + it.qty * it.unit, 0);
    if (!(sum >= (places ? 0.01 : 1))) errors.push(`The amount (sum of lines) must be ${places ? 'greater than 0' : 'at least 1'}.`);
  } else {
    amount = Number(input?.amount);
    if (!fits(amount, places) || amount < (places ? 0.01 : 1)) errors.push(places ? `The amount must be greater than 0; ${unitText(places)}` : 'The amount must be a whole number of at least 1.');
  }

  const payer = String(input?.payer ?? '');
  if (!uids.includes(payer)) errors.push('The payer is not a member of this room.');
  const presentIn = Array.isArray(input?.present) ? input.present.map(String) : [];
  if (!presentIn.length) errors.push('Choose at least one person who was there.');
  if (presentIn.some((u) => !uids.includes(u))) errors.push('Some of the people chosen are not members of this room.');
  const present = uids.filter((u) => presentIn.includes(u));

  const method = input?.method;
  if (method !== 'card' && method !== 'cash') errors.push('The payment method must be card or cash.');
  const currency = String(input?.currency ?? '');
  const date = String(input?.date ?? '');
  const time = String(input?.time ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) errors.push('The date format is invalid.');
  if (!/^\d{2}:\d{2}$/.test(time)) errors.push('The time format is invalid.');
  if (currency !== 'KRW' && currency !== room.fx?.currency) {
    errors.push('This room does not use that currency.');
  } else if (currency !== 'KRW' && !room.fx.base[date]) {
    // 실제 방은 저장 전에 결제일 환율을 받아 넣는다(src/rooms/fx.mjs의 withDayRate). 여기 오면 받지 못한 것이다
    errors.push('There is no exchange rate for this date.');
  }
  // 현금으로 낸 외화에 낸 사람의 환전 환율이 없으면 결제일 기준율로 셈한다(public/core.js의 toKrw)

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    expense: {
      title,
      kind: KINDS.includes(input?.kind) ? input.kind : 'shop',
      date,
      time,
      payer,
      method,
      currency,
      ...(items ? { items } : { amount }),
      split: items ? 'items' : 'equal',
      present,
      source: input?.source === 'receipt' ? 'receipt' : 'manual',
    },
  };
}
