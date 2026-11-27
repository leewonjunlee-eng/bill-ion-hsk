// v2 분담안은 원본 중재 비서(src/agents/mediate.mjs)가 만든다. 비서의 출력은 제안일 뿐이고 금액은 서버가 계산한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHspBrowserServer } from '../public/demo/hsp-server.js';

const base = '/api/hsp-demo/rooms/shared-receipt';

async function dispute(handle) {
  const draft = (await handle('GET', base, 'a')).body;
  const { id: snapshotId, hash: snapshotHash } = draft.current;
  const revised = await handle('POST', `${base}/revise`, 'b', JSON.stringify({ snapshotId, snapshotHash }));
  return { draft, revised };
}

const model = (extras) => ({
  model: 'fake-model',
  generate: async () => ({
    summary: '모델이 낸 중재안',
    lines: [
      { id: 'supplies', consumers: ['A', 'B', 'C'], confidence: 0.9, reason: '함께 먹었어요', evidenceConflict: false },
      { id: 'extras', consumers: extras, confidence: 0.8, reason: '남은 사람이 먹었어요', evidenceConflict: false },
    ],
  }),
});

test('the draft has no mediation, and the dispute is settled by the original mediation agent', async () => {
  const { draft, revised } = await dispute(createHspBrowserServer());
  assert.equal(draft.current.mediation, null);
  assert.equal(draft.previous, null);
  assert.equal(revised.status, 200);
  const { current } = revised.body;
  assert.deepEqual(current.shares, { a: 7, b: 4, c: 7 });
  assert.equal(current.mediation.source, 'rules');
  assert.match(current.mediation.claim, /20:00/);
  assert.match(current.mediation.summary, /Orders before 20:00 are split among all three; later orders among the other two, without B/);
  assert.deepEqual(current.lines.map((line) => line.members), [['a', 'b', 'c'], ['a', 'c']]);
  assert.ok(current.lines.every((line) => line.reason));
});

test('a model proposal changes the approved amount only through server arithmetic', async () => {
  const { revised } = await dispute(createHspBrowserServer({ gemini: model(['A']) }));
  const { current } = revised.body;
  assert.equal(current.mediation.source, 'fake-model');
  assert.deepEqual(current.shares, { a: 10, b: 4, c: 4 });
  assert.equal(current.payment.atomicAmount, '20000');
});

test('a model cannot reassign a late order to the member who had left', async () => {
  const { revised } = await dispute(createHspBrowserServer({ gemini: model(['B']) }));
  assert.ok(!revised.body.current.lines[1].members.includes('b'));
});

test('a failing model falls back to the rules, and a second dispute cannot replace the revision', async () => {
  const handle = createHspBrowserServer({ gemini: { model: 'broken', generate: async () => { throw new Error('down'); } } });
  const { draft, revised } = await dispute(handle);
  assert.equal(revised.body.current.mediation.source, 'rules');
  const { id: snapshotId, hash: snapshotHash } = draft.current;
  const again = await handle('POST', `${base}/revise`, 'b', JSON.stringify({ snapshotId, snapshotHash }));
  assert.equal(again.status, 409);
});

test('the rule summary mentions alcohol only when the receipt has it', async () => {
  const { revised } = await dispute(createHspBrowserServer());
  assert.doesNotMatch(revised.body.current.mediation.summary, /alcohol/i);
});
