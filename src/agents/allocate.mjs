// 영수증 줄을 비서들이 공유한 기억으로 '누구 몫인가' 배분한다. 금액은 계산하지 않는다.
import { ruleAllocate } from '../../public/core.js';
import { memoryText, receiptTable, presentNames, lineSchema, cleanLines, inline, labelOf, DATA_NOT_INSTRUCTIONS, TAG_GUIDE } from './lines.mjs';
import { promptKey } from './cache.mjs';
import { isFlagged } from '../actions.mjs';

export function allocatePrompt(exp, room, memoryByUid) {
  const system = [
    'You work jointly for the agents that help with a settlement. For each receipt line, estimate whose share it is (who ate, drank or used it).',
    'Your only evidence is the memories each person’s agent shared and the receipt line data (item, quantity, tags). Do not invent facts that are not in the memories.',
    TAG_GUIDE,
    '',
    'Rules:',
    '1. Assign a line tagged "나눠 먹는 안주" to everyone who was there, except people whose memory shows they do not eat that food.',
    '2. For a line counted in glasses or single servings, assign as many people as the quantity (quantity 2 means 2 people).',
    '3. Leave people whose memory shows they do not drink alcohol out of lines tagged "술".',
    '4. Set confidence to 0.7 or higher when a memory supports the line, and below 0.5 when you guessed without evidence.',
    '5. Write reason as one sentence in English that says which memory you used (whose agent memory “…”). If there is no evidence, say so.',
    '6. Do not calculate amounts. Code does the math.',
    `7. ${DATA_NOT_INSTRUCTIONS}`,
  ].join('\n');
  const payer = labelOf(room.members, exp.payer);
  const user = [
    `People who were there: ${presentNames(exp, room.members)}`,
    `Memories shared by the agents:\n${memoryText(room.members, memoryByUid)}`,
    `Receipt (${inline(exp.title, 60)}, paid by ${payer} with ${exp.method === 'card' ? 'card' : 'cash'}):\n${receiptTable(exp, false)}`,
    'Return the assignment for every receipt line (id) as JSON.',
  ].join('\n\n');
  const schema = { type: 'OBJECT', properties: { lines: { type: 'ARRAY', items: lineSchema(exp, room.members) } }, required: ['lines'] };
  return { system, user, schema };
}

// Gemini에게 묻지 않아도 답이 정해지는 영수증이면 { alloc, why }, 아니면 null.
// 함께 있던 사람이 한 명이거나, 줄이 하나이고 비서 기억이 그 줄에서 누구를 빼거나 고르지 않으면 함께 있던 사람이 똑같이 나눈다.
export function obviousAlloc(exp, room, memoryByUid) {
  const present = room.members.map((m) => m.uid).filter((u) => exp.present.includes(u));
  const all = (reason, confidence) => Object.fromEntries(exp.items.map((it) => [it.id, { consumers: [...present], confidence, reason }]));
  if (present.length === 1) {
    const name = room.members.find((m) => m.uid === present[0]).name;
    return { alloc: all(`Only ${name} was there.`, 1), why: `Only ${name} was there, so every line was assigned to ${name}.` };
  }
  if (exp.items.length === 1 && ruleAllocate(exp, memoryByUid, room.members)[exp.items[0].id].consumers.length === present.length) {
    return { alloc: all(`There is only one line, so the ${present.length} people who were there split it equally.`, 0.9), why: `There was only one line, so it was split equally among the ${present.length} people who were there.` };
  }
  return null;
}

// 방 사람 모두가 보는 줄 이유. 모델이나 규칙이 쓴 이유는 기억을 인용하거나 풀어 쓸 수 있어서 저장하지 않고,
// 누구 몫인지와 확인이 필요한지만으로 코드가 다시 쓴다. 기억 내용은 본인의 '내 비서'와 이의 중재에서만 보인다(#5)
export function publicReason(it, line, exp, room) {
  if (isFlagged(line)) return 'Agent memories give no evidence for who owes this. Please confirm.';
  const present = room.members.map((m) => m.uid).filter((u) => exp.present.includes(u));
  if (present.every((u) => line.consumers.includes(u))) return it.tags?.includes('나눠 먹는 안주') ? 'A shared dish for the people who were there.' : 'Shared by everyone who was there.';
  const names = line.consumers.map((u) => room.members.find((m) => m.uid === u)?.name ?? u).join('·');
  return `Shared by ${names}, based on the quantity and agent memories.`;
}

// → { alloc: Record<itemId, LineAlloc>, source: 모델 이름 | 'rules', how, why?, error? }
// how: 'obvious'(묻지 않아도 정해짐) | 'cache'(같은 입력의 이전 답) | 'gemini' | 'rules'(키가 없거나 실패)
export async function allocateWithGemini(gemini, exp, room, memoryByUid, { cache } = {}) {
  const obvious = obviousAlloc(exp, room, memoryByUid);
  if (obvious) return { ...obvious, source: 'rules', how: 'obvious' };
  const fallback = ruleAllocate(exp, memoryByUid, room.members);
  if (!gemini) return { alloc: fallback, source: 'rules', how: 'rules' };
  const prompt = allocatePrompt(exp, room, memoryByUid);
  const key = cache && promptKey(gemini.model, prompt);
  try {
    let raw = key && cache.get(key);
    const how = raw ? 'cache' : 'gemini';
    if (!raw) {
      raw = await gemini.generate(prompt);
      if (key && Array.isArray(raw?.lines) && raw.lines.length) cache.set(key, raw);
    }
    return { alloc: cleanLines(exp, room.members, raw.lines, fallback, () => exp.present), source: gemini.model, how };
  } catch (e) {
    console.warn('[allocate] Gemini failed, using rules instead:', e.message);
    return { alloc: fallback, source: 'rules', how: 'rules', error: e.message };
  }
}
