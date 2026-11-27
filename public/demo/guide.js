// 체험 데모의 task 체크리스트. 다섯 task를 차례로 열고, 지금 task만 펼쳐 무엇을 누르면 되는지와 '보여 주기'를 둔다.
// 끝났는지는 방문자가 누른 기록이 아니라 데모 저장소의 지금 상태로 판단한다(같은 일을 다른 길로 해도 끝난다).
// 문구는 화면의 버튼 이름을 그대로 쓴다. tasks()는 DOM을 건드리지 않아 테스트에서 부른다
import { ME, FRIENDS } from './scenario.js';
import { isFlagged } from '#src/actions.mjs';
import { OPEN } from '#src/agents/disputes.mjs';
import { active } from '../core.js';
import { esc, ICON_DONE, accountHref } from '../ui.js';
import { Spring, reduceMotion } from '../motion.js';
import { seqCardHtml } from './seq.js';

const roomHref = (room) => (room ? `room.html?room=${encodeURIComponent(room.id)}` : 'account.html');

// s: { room, invite, expenses, invoices, disputes, transfers, location, agent } — '나'가 마지막으로 만든 방 기준
export function tasks(s) {
  const { room } = s;
  const inRoom = room && { href: roomHref(room), label: 'Go to room' };
  const mine = s.expenses.filter((e) => e.createdBy === ME);
  const withLines = mine.filter((e) => e.items?.length && e.split === 'items');
  const friendsIn = room ? FRIENDS.filter((f) => room.members.some((m) => m.uid === f.uid && active(m))).length : 0;
  const myInvoices = s.invoices.filter((i) => i.to === ME);
  const myDisputes = s.disputes.filter((d) => d.by === ME);
  const myPay = s.transfers.filter((t) => t.from === ME && t.version === room?.version);
  const left = Boolean(room?.members.some((m) => m.uid === ME && m.left));
  const autoAccepted = myInvoices.length > 0 && !myDisputes.length && myInvoices.every((i) => i.status === 'accepted' && i.decidedBy === 'agent');

  const list = [
    {
      id: 'room', // SEQ 이름표(src/demo-seq.mjs SEQ_TASKS)
      title: 'Create a trip room and invite friends',
      steps: [
        { text: 'In My rooms, create a room with “New room”', note: 'The room name and dates (2 nights from today) are prefilled. Keep them or change them.', done: Boolean(room), show: 'a.btn[href="room.html"], [data-action="create-room"]', go: { href: 'account.html', label: 'Go to My rooms' } },
        room && !room.fx
          ? { text: 'This is a KRW-only room, so the rate policy was skipped', note: 'A rate policy appears only in rooms that spend foreign currency such as yen.', skipped: true }
          : { text: 'Choose “Foreign too”, then pick yen and a rate policy', note: 'A rate policy appears only in rooms that spend foreign currency. Settlement is always in KRW.', done: Boolean(room?.fx), show: '[data-action="cf-foreign"][data-id="yes"]' },
        // ＋를 누르고 '이걸 어떻게 보내지' 하고 나가지 않게, 누르기만 하면 된다는 것을 이 단계에서 바로 알린다(팀 점검 11/5)
        { text: 'Tap ＋ after the member list to invite friends. In the demo they join on their own', note: 'This is a demo, so you don’t need to send the invite link. Chulsoo, Younghee and Minsu join a few seconds apart, and their agents add what they spent.', done: Boolean(s.invite) || friendsIn > 0, show: '[data-action="open-invite"]', go: inRoom },
        { text: 'Three friends join', note: 'They keep joining even if you close the invite sheet or move to another screen.', done: friendsIn === FRIENDS.length },
      ],
    },
    // 받을 계좌를 먼저 정하고 지출을 남기는 편이 자연스럽다(팀 점검 11/5). 그래서 비서 설정이 지출 남기기보다 앞이다
    {
      id: 'agent',
      title: 'Set your account and what your agent may do',
      steps: [
        { text: 'In My account under “My agent defaults”, press “Fill sample account and limit”, then “Save”', note: 'This fills a fake account and a ₩50,000 limit so you don’t have to type. The limit is below your invoice, so your agent asks first in task 4. You can also try the send timing (any time or a set day) and dispute options.', done: Boolean(s.agent?.onboardedAt), show: '[data-action="agent-sample"]', go: { href: room ? accountHref(room.id, 'agent', 'agent') : 'account.html#agent', label: 'Go to My account' } }, // 저장하고 뒤로를 누르면 방의 내 비서로 돌아와 다음 단계로 간다
        { text: 'In the room, open the “My account” menu › “My agent in this room” and try a “This room only” value', note: 'This room can use its own limit or send timing. Otherwise it follows your defaults.', optional: true, done: Object.keys(s.agent?.roomRules?.[room?.id] ?? {}).length > 0, show: '#nav-me', go: inRoom },
      ],
    },
    {
      id: 'expense',
      title: 'Add an expense',
      steps: [
        { text: 'Press “Add expense” and use “Receipt photo” or “Enter manually”', note: 'Use “Try with a sample receipt” to test photo reading. For yen, KRW is worked out with the payment-day rate. Pick who joined, too.', done: mine.length > 0, show: '#nav-add:not([hidden]), [data-action="add-expense"]', go: inRoom },
        mine.length && !withLines.length
          ? { text: 'This expense has no item lines, so it is split equally', skipped: true }
          : { text: 'Split receipt lines by item with “Go split” › “Let agents split it”', note: 'Agents split using the memories each one shares. For lines with weak evidence they ask you to confirm their guess.', done: withLines.length > 0 && withLines.every((e) => e.alloc && !e.items.some((it) => isFlagged(e.alloc[it.id]))), show: '.next [data-action="open-exp"], [data-action="allocate-exp"], [data-action="confirm-all-guesses"]' },
      ],
    },
    {
      id: 'dispute',
      title: 'Fix a wrong share',
      steps: [
        { text: 'Press “Send invoices”', note: 'Each agent accepts by its rules, or asks its owner when the amount is over the limit.', done: s.invoices.length > 0, show: '[data-action="send-invoices"]', go: inRoom },
        autoAccepted
          ? { text: 'It was within the auto-accept limit, so your agent accepted the invoice', note: 'Press “Start over”, then lower the limit in task 2 to have your agent ask first.', skipped: true }
          : { text: 'Open your invoice and press “An expense is wrong”', note: 'Only expenses with receipt lines can go to mediation. For an equal split with no lines, use “Edit expense” instead of a dispute.', done: myDisputes.length > 0 || s.location.length > 0, show: '[data-action="open-invoice"]' },
        { text: 'Press “Upload Google Maps Timeline” › “Try with a sample timeline”, keep “Second-round bar” selected and press “Send dispute”', note: 'It finds in the timeline that you left around 22:55, selects the expense and fills in what is wrong.', done: myDisputes.length > 0, show: '[data-action="start-dispute"], [data-action="timeline-guide"]' },
        { text: 'Review the mediation proposal and press “Accept proposal”', note: 'Chulsoo’s agent is set to send disputes to the mediator agent. Chulsoo accepts shortly too.', done: myDisputes.some((d) => d.agreedBy.includes(ME) || !OPEN.includes(d.status)), show: '[data-action="open-dispute"]' },
      ],
    },
    {
      id: 'send',
      title: 'Send and wrap up',
      steps: [
        { text: 'Accept the new invoice with “Accept as is”', note: 'The amount is re-split according to the mediation proposal.', done: myPay.length > 0 || left, show: '[data-action="open-invoice"]', go: inRoom },
        { text: 'Open “Go send” and slide to send', note: 'In real use, Toss opens with the amount and account filled in. The demo stops just before that.', done: myPay.some((t) => !['scheduled', 'due'].includes(t.status)) || left, show: '[data-action="open-transfer"]' },
        { text: 'Come back and press “Sent”; Chulsoo confirms with “Received”', done: myPay.some((t) => ['sent', 'confirmed'].includes(t.status)) || left, show: '[data-action="mark-sent"]' },
        { text: 'When the room shows “Settled”, finish with “Leave this room” on that card', note: 'If you stay, the finished room is kept under “Done” in My rooms.', done: left, show: '.next.done [data-action="open-leave"]', go: !left && inRoom },
      ],
    },
  ];
  return list.map((t, i) => ({ ...t, n: i + 1, done: t.steps.every((st) => st.done || st.skipped || st.optional) }));
}

// 지금 task에서 다음에 할 한 가지(선택 단계는 앞 단계를 다 한 뒤에)
export const nextStep = (task) => task && (task.steps.find((st) => !st.done && !st.skipped && !st.optional) ?? task.steps.find((st) => !st.done && !st.skipped));

// ---------------------------------------------------------------- 화면
const OPEN_KEY = 'agent-settlement.demo.guide';
const CHEVRON = '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const LOCK = '<svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2"/></svg>';

const remember = (key, value) => { try { sessionStorage.setItem(key, JSON.stringify(value)); } catch {} };
const recall = (key, fallback) => { try { return JSON.parse(sessionStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const here = (href) => new URL(href, location.href).href === location.href;

// 이 화면에 그 버튼이 있으면 '보여 주기', 다른 화면에 있으면 그리로 가는 링크
function actionHtml(st) {
  if (st.show && document.querySelector(st.show)) return `<button type="button" class="dg-show" data-dg="show" data-sel="${esc(st.show)}">Show me</button>`;
  return st.go && !here(st.go.href) ? `<a class="dg-show" href="${esc(st.go.href)}">${esc(st.go.label)}</a>` : '';
}

function stepHtml(st, current) {
  const action = current && !st.done && !st.skipped ? actionHtml(st) : '';
  const state = st.done ? 'Done' : st.skipped ? 'Skipped' : st.optional ? 'Optional' : 'To do';
  return `<li class="dg-step${st.done ? ' done' : ''}${st.skipped ? ' skipped' : ''}">
      <span class="dg-check" aria-hidden="true">${st.done ? ICON_DONE : st.skipped ? '–' : ''}</span>
      <span class="dg-step-body"><span class="dg-step-text"><span class="sr-only">${state}: </span>${esc(st.text)}${st.optional ? ' <span class="dg-optional">Optional</span>' : ''}</span>
        ${st.note && !st.done ? `<span class="dg-step-note">${esc(st.note)}</span>` : ''}${action}</span></li>`;
}

// 데모 화면에 붙인다. snapshot()은 지금 저장소 상태(Promise), reset()은 처음부터 다시.
// 펼친 체크리스트는 화면을 가린다. 그래서 방문자가 화면을 누르기 시작하면 접히고, 접힌 머리에는 다음에 할 한 가지와 '보여 주기'만 남긴다.
// task 하나를 끝내면 다시 펼쳐 다음 task를 보여 준다. seq(./seq.js)가 있으면 끝낸 task마다 화면 가운데 카드로 SEQ를 묻고,
// 마지막 답 뒤에는 모두의 평균이 보이는 첫 화면으로 돌아간다
export function mountGuide({ snapshot, reset, seq = null }) {
  const root = document.createElement('aside');
  root.className = 'demo-guide';
  root.setAttribute('aria-label', 'Demo tasks');
  document.body.append(root);
  let open = recall(OPEN_KEY, true);
  let peek = null; // 눌러서 펼쳐 본 task. 없으면 지금 task
  let armed = false;
  let lastCurrent = null;
  let html = '';
  let body = null;
  const rerender = () => { html = ''; render(); };
  // SEQ 완료 카드. 화면 가운데에 띄우고 뒤를 어둡게 한다. 고르면 그 칸이 그 자리에서 눌린 채로 바뀌고, 잠시 뒤 닫힌다
  const card = document.createElement('div');
  card.className = 'seq-root';
  card.hidden = true;
  document.body.append(card);
  let cardHtml = '';
  let busy = false; // 고른 뒤 닫힐 때까지. 그동안은 카드를 다시 그리지 않는다
  let lastList = [];
  function renderCard(ask) {
    if (busy) return;
    const next = ask ? seqCardHtml(ask) : '';
    if (next === cardHtml) return;
    const opening = !cardHtml && next;
    cardHtml = next;
    card.innerHTML = next;
    card.hidden = !next;
    if (opening) card.querySelector('.seq-card')?.focus();
  }
  // 카드를 새로 그리지 않고 고른 칸만 바꾼다(새로 그리면 여는 애니메이션이 다시 돌아 새 카드가 뜬 것처럼 보인다)
  function markChosen(score) {
    for (const b of card.querySelectorAll('.seq-btn')) {
      b.disabled = true;
      if (Number(b.dataset.score) === score) b.setAttribute('aria-pressed', 'true');
    }
    const done = document.createElement('p');
    done.className = 'seq-card-done';
    done.setAttribute('role', 'status');
    done.textContent = `You rated it ${score}`;
    card.querySelector('.seq-skip')?.replaceWith(done);
  }
  // 닫히는 애니메이션(작아지며 흐려진다)이 끝나면 비운다. 움직임 줄이기면 바로 닫는다
  function closeCard(then) {
    card.classList.add('closing');
    setTimeout(() => {
      card.classList.remove('closing');
      card.hidden = true;
      card.innerHTML = '';
      cardHtml = '';
      busy = false;
      then();
    }, reduceMotion.matches ? 0 : 220);
  }
  // 다섯 task를 다 끝냈고 더 물을 것이 없으면 첫 화면으로 돌아간다. 첫 화면이 task 줄마다 모두의 평균을 보여 준다
  function afterAnswer(sending) {
    if (!lastList.length || !lastList.every((t) => t.done) || seq.pending(lastList)) return rerender();
    Promise.race([sending, new Promise((r) => setTimeout(r, 1500))]).then(() => { location.href = '../'; });
  }
  function answer(btn) {
    if (busy || !btn) return;
    busy = true;
    if (btn.dataset.seq === 'skip') { seq.skip(btn.dataset.task); return closeCard(() => afterAnswer()); }
    const score = Number(btn.dataset.score);
    const sending = seq.rate(btn.dataset.task, score); // 보내는 동안 기다리지 않는다
    markChosen(score);
    setTimeout(() => closeCard(() => afterAnswer(sending)), 800); // 눌린 칸과 '남겼어요'를 보인 뒤 닫는다
  }
  card.addEventListener('click', (e) => answer(e.target.closest('[data-seq]')));
  // Esc는 건너뛰기와 같다
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && cardHtml && !busy) answer(card.querySelector('[data-seq="skip"]')); });
  // 접고 펼 때 본문 높이를 스프링으로 옮긴다(감쇠 1, 튀지 않게). 움직임 줄이기면 바로 바뀐다
  const height = new Spring(0, (h) => { if (body) body.style.height = `${Math.max(0, h)}px`; });

  async function render() {
    const list = tasks(await snapshot());
    const current = list.find((t) => !t.done) ?? null;
    if ((current?.n ?? 0) !== lastCurrent) {
      if (lastCurrent !== null) open = true; // task 하나를 끝내면 다음 task를(모두 끝내면 끝난 것을) 펼쳐 보인다
      lastCurrent = current?.n ?? 0;
      peek = null;
    }
    // 끝낸 task를 하나씩 묻는다. 다섯 task를 다 끝냈고 더 물을 것이 없으면 모두의 평균을 한 번 불러온다
    lastList = list;
    if (seq) renderCard(seq.pending(list));
    const finished = list.filter((t) => t.done).length;
    const shown = peek ?? current?.n;
    const items = list.map((t) => {
      const locked = !t.done && t !== current;
      const expanded = !locked && t.n === shown;
      const head = `<span class="dg-num${t.done ? ' done' : ''}" aria-hidden="true">${t.done ? ICON_DONE : locked ? LOCK : t.n}</span>
        <span class="dg-task-title"><span class="dg-task-n">Task ${t.n}</span>${esc(t.title)}</span>`;
      return `<li class="dg-task${t.done ? ' done' : ''}${locked ? ' locked' : ''}${t === current ? ' current' : ''}">
        ${locked ? `<div class="dg-task-head">${head}<span class="sr-only"> · Opens after the previous task</span></div>`
          : `<button type="button" class="dg-task-head" data-dg="peek" data-n="${t.n}" aria-expanded="${expanded}">${head}</button>`}
        ${expanded ? `<ol class="dg-steps">${t.steps.map((st) => stepHtml(st, t === current)).join('')}</ol>` : ''}</li>`;
    }).join('');
    const step = nextStep(current);
    const [eyebrow, title] = !current ? [`Demo · ${finished}/${list.length}`, 'You tried all five tasks']
      : open ? [`Demo · ${finished}/${list.length} done`, `Task ${current.n} · ${current.title}`]
      : [`Demo · Task ${current.n}/${list.length} ${current.title}`, step?.text ?? current.title];
    const next = `<div class="dg-head">
        <button type="button" class="dg-toggle" data-dg="toggle" aria-expanded="${open}" aria-controls="dg-body">
          <span class="dg-eyebrow">${esc(eyebrow)}</span>
          <span class="dg-title">${esc(title)}</span>
          <span class="dg-chev">${CHEVRON}</span>
        </button>
        ${!open && step ? `<div class="dg-head-action">${actionHtml(step)}</div>` : ''}
        <div class="dg-bar" role="progressbar" aria-label="Tasks done" aria-valuemin="0" aria-valuemax="${list.length}" aria-valuenow="${finished}"><i style="width:${(finished / list.length) * 100}%"></i></div>
      </div>
      <div class="dg-body" id="dg-body"${open ? '' : ' hidden'}><div class="dg-inner">
        <p class="dg-fake">All amounts, rates, accounts and locations are fake. No money moves.</p>
        ${current ? '' : '<p class="dg-done-note">You followed the agents’ settlement from creating a room to leaving it.</p>'}
        ${!current && seq?.complete(list.map((t) => t.id)) ? '<p class="dg-done-note"><a href="../">See everyone’s SEQ average on the start screen</a></p>' : ''}
        <ol class="dg-tasks">${items}</ol>
        <div class="dg-foot"><button type="button" class="dg-reset${armed ? ' armed' : ''}" data-dg="reset">${armed ? 'Tap again to start over' : 'Start over'}</button></div>
      </div></div>`;
    if (next === html) return;
    // 다시 그려도 초점은 누르던 자리에 둔다
    const f = root.contains(document.activeElement) ? document.activeElement : null;
    const again = f && (f.dataset.n ? `[data-dg="${f.dataset.dg}"][data-n="${f.dataset.n}"]` : f.dataset.dg ? `[data-dg="${f.dataset.dg}"]` : null);
    html = next;
    root.innerHTML = next;
    root.classList.toggle('open', open);
    body = root.querySelector('.dg-body');
    if (again) root.querySelector(again)?.focus();
  }

  async function toggle() {
    const from = open ? body?.getBoundingClientRect().height ?? 0 : 0;
    open = !open;
    remember(OPEN_KEY, open);
    html = '';
    await render();
    if (reduceMotion.matches || !body) return;
    body.hidden = false;
    const to = open ? body.scrollHeight : 0;
    height.set(from);
    height.to(to, { damping: 1, response: 0.32, onRest: () => { if (!body) return; body.style.height = ''; body.hidden = !open; } });
  }

  // 그 버튼을 화면 가운데로 옮기고 테두리로 잠깐 가리킨다(색만이 아니라 두께로)
  function spotlight(sel) {
    const el = document.querySelector(sel);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: reduceMotion.matches ? 'auto' : 'smooth' });
    el.classList.remove('dg-spot');
    void el.offsetWidth; // 같은 버튼을 다시 가리켜도 처음부터 보이게
    el.classList.add('dg-spot');
    setTimeout(() => el.classList.remove('dg-spot'), 2400);
  }

  // 화면의 다른 곳을 누르면(방문자가 하기 시작하면) 접는다
  document.addEventListener('pointerdown', (e) => {
    if (open && !root.contains(e.target) && !e.target.closest?.('.demo-toss-root, .seq-root')) toggle();
  });

  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-dg]');
    if (!btn) return;
    const kind = btn.dataset.dg;
    if (kind === 'toggle') return void toggle();
    if (kind === 'peek') { peek = Number(btn.dataset.n); html = ''; return void render(); }
    if (kind === 'show') return spotlight(btn.dataset.sel);
    if (kind === 'reset') {
      if (armed) return reset();
      armed = true;
      html = '';
      render();
      setTimeout(() => { armed = false; html = ''; render(); }, 4000);
    }
  });

  render();
  // 페이지가 다시 그려지면 '보여 주기'할 버튼이 생기거나 사라진다. 바뀐 게 있을 때만 다시 그린다
  setInterval(render, 1000);
  return { render };
}
