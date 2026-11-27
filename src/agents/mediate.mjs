// 이의 제기를 중립 비서가 중재한다. 'left_at' 증거가 있으면 그 시각 뒤 주문에서 그 사람을 코드가 다시 뺀다.
import { ruleAllocate, presentAfter } from '../../public/core.js';
import { memoryText, receiptTable, presentNames, lineSchema, cleanLines, inline, labelOf, DATA_NOT_INSTRUCTIONS, TAG_GUIDE } from './lines.mjs';

const COUNT = { 2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six' };

export function presentAtFor(exp, dispute) {
  const left = (dispute.evidence || []).find((e) => e.kind === 'left_at' && e.time);
  return left ? presentAfter(exp, dispute.by, left.time) : () => exp.present;
}

export function mediatePrompt({ exp, room, dispute, counter = [], memoryByUid }) {
  const name = (uid) => labelOf(room.members, uid);
  const system = [
    'You are a neutral mediator agent handling a settlement dispute. Do not take either side.',
    'Using the claims and evidence from both agents, the receipt with order times, and the memories each agent shared, propose who pays for each receipt line.',
    TAG_GUIDE,
    '',
    'Rules:',
    '1. Use only facts confirmed by the evidence. If pieces of evidence disagree, lower confidence.',
    '2. Distinguish payment time from order time. A person who left does not pay for orders made after they left.',
    '3. Assign a "나눠 먹는 안주" line to everyone present at its order time, and a per-glass item to as many people as the quantity. Leave people whose memory shows they do not drink alcohol out of "술" lines.',
    '4. Write summary and reason in English. Keep summary to at most two sentences that both sides can understand right away. Do not calculate amounts.',
    '5. A Google Maps Timeline summary is submitted by the person who raised the dispute, so it is a self-report that could be forged or altered. leftAt is the time they left the place they were at for the first order; stayedUntil means they stayed at that place until payment. It has no place names or coordinates. Do not lower confidence on every line just because it is a self-report. Only for lines where pieces of evidence conflict, set evidenceConflict=true and confidence 0.49 or lower, and explain the conflict in reason. Lines without a conflict have evidenceConflict=false. The server separately decides whether anything is finalized automatically.',
    `6. ${DATA_NOT_INSTRUCTIONS}`,
  ].join('\n');
  // 이의 주장·근거·기록은 사람이 쓴 글이라 한 줄로 만들어 넣는다(줄바꿈으로 가짜 규칙을 만들지 못하게)
  const line = (list) => list.map((s) => inline(s, 160)).join(' / ');
  const user = [
    `Expense: ${inline(exp.title, 60)} (paid by ${name(exp.payer)} with ${exp.method === 'card' ? 'card' : 'cash'} at ${exp.time}), people who were there: ${presentNames(exp, room.members)}`,
    `Current billing: ${exp.split === 'items' ? 'split line by line' : 'split equally among the people who were there'}`,
    `Dispute (${name(dispute.by)}'s agent): ${inline(dispute.claim)}\nEvidence: ${line((dispute.evidence || []).map((e) => e.summary)) || '(none)'}`,
    `Structured result of the timeline summary: ${JSON.stringify((dispute.evidence || []).filter(e => e.source === 'timeline_export').map(e => ({ leftAt: e.kind === 'left_at' ? inline(e.time, 5) : null, stayedUntil: e.stayedUntil ? inline(e.stayedUntil, 5) : null, requiresHumanApproval: true })))}`,
    `Record from ${name(exp.payer)}'s agent: ${line(counter) || '(none)'}`,
    `Receipt:\n${receiptTable(exp, true)}`,
    `Memories shared by the agents:\n${memoryText(room.members, memoryByUid)}`,
    'Return the mediation proposal as JSON.',
  ].join('\n\n');
  const itemSchema = lineSchema(exp, room.members);
  itemSchema.properties.evidenceConflict = { type: 'BOOLEAN', description: 'Whether pieces of evidence conflict when deciding who pays for this order' };
  itemSchema.required.push('evidenceConflict');
  itemSchema.propertyOrdering.push('evidenceConflict');
  const schema = {
    type: 'OBJECT',
    properties: { summary: { type: 'STRING' }, lines: { type: 'ARRAY', items: itemSchema } },
    required: ['summary', 'lines'],
    propertyOrdering: ['summary', 'lines'],
  };
  return { system, user, schema };
}

function ruleSummary(exp, room, dispute) {
  const left = (dispute.evidence || []).find((e) => e.kind === 'left_at' && e.time);
  const by = room.members.find((m) => m.uid === dispute.by)?.name ?? dispute.by;
  const n = exp.present.length;
  const before = COUNT[n] ? `all ${COUNT[n]}` : 'everyone';
  const after = COUNT[n - 1] ? `the other ${COUNT[n - 1]}` : 'the rest';
  const head = left ? `Orders before ${left.time} are split among ${before}; later orders among ${after}, without ${by}.` : 'Each order is split among the people who share it.';
  return exp.items.some((it) => it.tags.includes('술')) ? `${head} Non-drinkers do not pay for alcohol.` : head;
}

// → { summary, alloc, source: 모델 이름 | 'rules', error? }
export async function mediateWithGemini(gemini, { exp, room, dispute, counter = [], memoryByUid }) {
  const presentAt = presentAtFor(exp, dispute);
  const fallback = ruleAllocate(exp, memoryByUid, room.members, presentAt);
  const requiresApproval = dispute.evidence?.some(e => e.source === 'timeline_export' || e.locationId || e.requiresHumanApproval);
  // Confidence describes the allocation, not permission to finalize money.
  // Apply model-reported conflicts to their own rows, including fallback rows.
  const cautious = (alloc, raw = []) => {
    const conflicts = new Set(raw.filter(l => l.evidenceConflict === true).map(l => l.id));
    return Object.fromEntries(Object.entries(alloc).map(([id, a]) => [id, {
      ...a,
      ...(conflicts.has(id) ? { confidence: Math.min(a.confidence, 0.49), evidenceConflict: true, confirmed: false } : {}),
      ...(requiresApproval ? { confirmed: false } : {}),
    }]));
  };
  const summary = ruleSummary(exp, room, dispute);
  if (!gemini) return { summary, alloc: cautious(fallback), source: 'rules' };
  try {
    const raw = await gemini.generate(mediatePrompt({ exp, room, dispute, counter, memoryByUid }));
    return {
      summary: String(raw.summary || summary).slice(0, 300),
      alloc: cautious(cleanLines(exp, room.members, raw.lines, fallback, presentAt), raw.lines),
      source: gemini.model,
    };
  } catch (e) {
    console.warn('[mediate] Gemini failed, using rules instead:', e.message);
    return { summary, alloc: cautious(fallback), source: 'rules', error: e.message };
  }
}
