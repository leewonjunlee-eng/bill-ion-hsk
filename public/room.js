// 실제 방 화면. 지금은 방 불러오기, (개발용) 신원 고르기, 지출, 누가 누구에게, 비서끼리 기록까지 보여 준다.
// 지출 추가(#6)와 비서 처리(#9) 화면은 이 파일에 이어 붙인다.
import { won, money, dayLabel, amountOf, toKrw, shares, settle, active } from './core.js';
import { unitOf, decimalsOf } from './currencies.js';
import { leaveBlock } from './leave.js';
import { esc, chip, avatarHtml, tile, CHEVRON, CHECK, CROSS, ICON_DONE, logItemHtml, minuteLabels, createSheet, mountSegs, resetSegs, mountSliders, segArrowKeys, restNote, allocLabel, allocButton, ARROW, ALERT, qrImageUrl, qrIsFresh, receiptPickers, sendMode, sendFollowUp, flaggedLines, blockedNotice, askedBy, nudge, COMPUTER_QUERY, disputeWaiting, disputeChoices, disputeNote, disputeRejected, disputeLive, disputeStatus, changedLines, proposalLinesHtml, reviseChoicesHtml, invoiceRows } from './ui.js';
import { reduceMotion } from './motion.js';
import { startSkeleton, roomSkeleton } from './skeleton.js';
import { api, subscribeRoom, currentUid, setCurrentUid } from './room-api.js';
import { createLogPop } from './log-pop.js';
import { API_BASE } from './api.js';
import { initAuth, authOptions, onSessionChange, login } from './auth.js';
import { accountHref } from './ui.js';
import { createAgentPanel, personChipHtml } from './agent-panel.js';
import { notifies } from './agent-rules.js';
import { readVisits, expenseWindow, keepForSettlement, findMismatches } from './timeline.js';
import { currentConsumers, sharesDiffHtml } from './ui.js';
import { guessOs, guideHtml } from './timeline-guide.js';
import { createRoomHtml, joinHtml, setupHtml, notAgreed, hasStarted, inviteUrl, datesLabel, inviteSheetHtml, inviteButtonHtml, leaveSheetHtml, doneCardHtml } from './room-setup.js';
import { pickDay, presetRange, nextFocus, shiftMonth, todayIso } from './date-range.js';
import { payoutFieldsHtml, payoutDraftFrom } from './payout-form.js';

const $ = (s, el = document) => el.querySelector(s);
const roomId = new URLSearchParams(location.search).get('room');
const inviteToken = roomId ? null : new URLSearchParams(location.search).get('invite');
// 방을 불러오는 동안 같은 자리에 방의 뼈대를 보인다(skeleton.js, 응답 시간 임계값). 처음 그리기 직전에 거둔다
let pageSkeleton = roomId ? startSkeleton($('#main'), roomSkeleton()) : null;
// 내 계정의 뒤로로 돌아왔으면(sheet=agent) 떠날 때 보던 내 비서를 다시 연다. 새로 고쳐도 또 열리지 않게 주소에서 바로 지운다
const reopenAgent = Boolean(roomId) && new URLSearchParams(location.search).get('sheet') === 'agent';
if (reopenAgent) history.replaceState(null, '', `room.html?room=${encodeURIComponent(roomId)}`);
// #4 방 만들기·참가하기·정책 동의·초대 링크 화면 상태. 방에 보일 이름·색은 입력받지 않고 내 프로필(profile)을 쓴다
// foreign: 외화도 쓰는 방인지(#55). 그때만 fxCurrency·policy를 보낸다. armed·removeError: 초대 시트의 내보내기, leaving·leaveError: 나가기 시트
const setup = { create: { name: '', start: '', end: '', foreign: false, fxCurrency: 'JPY', policy: 'actual' }, picker: { open: false, month: '', focus: '', entering: false }, join: {}, invitePreview: {}, invite: undefined, profile: null, policyEdit: false, policyOpen: false, copied: false, busy: false, error: '', armed: null, removeError: null, leaving: false, leaveError: '' };
// 로그인이 없는 개발용 서버에서만: 처음 방을 만들거나 참가할 때 이 브라우저용 uid를 하나 만든다. 배포에서는 Google 로그인 신원을 쓴다
const ensureUid = () => currentUid() || (authOptions().dev ? (setCurrentUid(`u-${crypto.randomUUID().slice(0, 8)}`), currentUid()) : null);
const state = { data: null, events: [], error: null, renderedLog: 0, sheet: null, draft: null, formError: '', saving: false, addMode: 'manual', reading: null, readNotes: [], aiReady: false, editing: null, lastImage: null, armedDelete: null, expId: null, edits: {}, allocating: null, allocSource: {}, ref: null, busy: null, disputeDraft: null, payoutDraft: null, transferNote: null, pendingSend: null, copied: null, qr: null, disputeDone: null, rejectDraft: null, reviseDraft: null, linesMotion: '', justPicked: null, noLinesHint: null, sendBlocked: false, announceBlocked: false, focusLine: null };
let unsubscribe = () => {};

const members = () => state.data?.room.members ?? [];
const nameOf = (uid) => ({ system: 'Room', mediator: 'Mediator agent', all: 'everyone' })[uid] ?? members().find((m) => m.uid === uid)?.name ?? uid;
const agentName = (uid) => (uid === 'system' || uid === 'mediator' ? nameOf(uid) : `${nameOf(uid)}’s agent`);
const colorOf = (uid) => {
  const profileColor = members().find(m => m.uid === uid)?.color;
  if (/^#[0-9a-f]{6}$/i.test(profileColor)) return profileColor;
  const i = members().findIndex((m) => m.uid === uid);
  return i < 0 ? '#8e8e93' : `var(--p${i % 4})`;
};
const avatar = (uid, cls = '') => avatarHtml(nameOf(uid)[0], colorOf(uid), cls);
// 기록 시각은 분까지만(로그가 아니라 대화)
const timeOf = (iso) => new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Seoul' });

// 좁은 화면에서 상단바 종으로 여는 비서끼리 기록. 마지막으로 본 기록은 방·사람마다 기억한다
const seenKey = () => `agent-settlement.seen.${roomId}.${currentUid()}`;
const logPop = createLogPop({
  itemHtml: (e, opts) => logItemHtml({
    avatar: avatar(e.from, 'agent'),
    who: agentName(e.from),
    to: nameOf(e.to),
    time: timeOf(e.at),
    text: e.text,
    meta: e.meta,
    tagHtml: e.action ? chip(`${nameOf(e.action.for)} to confirm`, 'warn') : '',
    ...opts,
  }),
  timeOf: (e) => timeOf(e.at),
  counts: (e) => notifies(e, currentUid(), state.data?.myAgent?.notify),
  todosHtml: () => (state.data?.actions ?? []).map((a) => `<div class="pop-todo"><b>${esc(state.data.me.name)}’s to-do</b><p>${esc(a.text)}</p>
    <div class="actions">${actionButtons(a, 'sm')}<button class="btn sm plain" data-action="close-log">Later</button></div></div>`).join(''),
  seen: {
    get: () => {
      try {
        return Number(localStorage.getItem(seenKey())) || 0;
      } catch {
        return 0;
      }
    },
    set: (seq) => {
      try {
        localStorage.setItem(seenKey(), String(seq));
      } catch {}
    },
  },
});

// 우측 상단 내 프로필 메뉴(#5). 내 계정으로 가는 길이면서, 방 안에서는 '이 방의 내 비서'로 가는 길을 겸한다(주 입구는 방 머리의 내 칩)
const meMenu = {
  get isOpen() {
    return !$('#me-menu').hidden;
  },
  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  },
  open() {
    $('#me-menu').hidden = false;
    $('#nav-me').setAttribute('aria-expanded', 'true');
    $('#me-menu [role="menuitem"]:not([hidden])')?.focus();
  },
  close(focus = true) {
    $('#me-menu').hidden = true;
    $('#nav-me').setAttribute('aria-expanded', 'false');
    if (focus) $('#nav-me').focus();
  },
  // 방을 읽은 뒤 내 얼굴과 '이 방의 내 비서'를 채운다. 방 밖이거나 서버가 요약을 주지 않으면 내 계정만 남는다
  update() {
    const me = state.data?.me;
    $('#nav-me-avatar').innerHTML = me ? avatar(me.uid) : '';
    $('#me-menu-agent').hidden = !state.data?.myAgent;
    $('#me-menu-leave').hidden = !state.data; // 방 안에서만
    // 방 안에서 내 계정으로 가면 내 계정의 뒤로가 이 방으로 돌아온다
    if (roomId) $('#me-menu a[role="menuitem"]').setAttribute('href', accountHref(roomId, 'profile'));
  },
};

// ---------------------------------------------------------------- 데이터
async function load() {
  try {
    state.data = await api(`/api/rooms/${encodeURIComponent(roomId)}`);
    state.error = null;
    // 살아 있는 초대 링크는 처음 한 번만 물어본다(정산 중인 방은 초대를 막는다)
    if (setup.invite === undefined && !hasStarted(state.data.room)) {
      setup.invite = null;
      api(`/api/rooms/${encodeURIComponent(roomId)}/invite`).then(({ invite }) => { setup.invite = invite; render(); }, () => {});
    }
  } catch (e) {
    state.error = e;
  }
  if (pageSkeleton) { await pageSkeleton.done(); pageSkeleton = null; }
  render();
}

function watch() {
  unsubscribe();
  state.events = [];
  state.renderedLog = 0;
  unsubscribe = subscribeRoom(roomId, (events) => {
    state.events.push(...events);
    renderChannel();
    load(); // 기록이 생기면 방 상태도 바뀌었을 수 있다
  });
}

// ---------------------------------------------------------------- 지출 추가(직접 입력)
const LAST_KEY = `agent-settlement.last-expense.${roomId}`;
const kstNow = () => new Date(Date.now() + 9 * 3600_000).toISOString();
function lastUsed() {
  try {
    return JSON.parse(localStorage.getItem(LAST_KEY)) || {};
  } catch {
    return {};
  }
}
function remember(d) {
  try {
    localStorage.setItem(LAST_KEY, JSON.stringify({ currency: d.currency, payer: d.payer, method: d.method, present: d.present }));
  } catch {}
}
// 정산당 한 번 올린 타임라인(#7). 이 정산 지출 시간대의 방문 시각만 이 브라우저에 7일 두고 서버로는 보내지 않는다.
// 저장이 막힌 브라우저에서도 지금 화면에서는 쓰도록 메모리에도 둔다. 로그아웃하면 지운다(auth.js)
const TIMELINE_DAYS = 7;
const timelineKey = () => `agent-settlement.timeline.${roomId}.${state.data?.me.uid}`;
const visitsInMemory = {};
function savedVisits() {
  const key = timelineKey();
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    if (saved && Date.now() - saved.savedAt < TIMELINE_DAYS * 86400_000) return saved.visits;
    localStorage.removeItem(key);
  } catch {}
  return visitsInMemory[key] ?? null;
}
function saveVisits(visits) {
  visitsInMemory[timelineKey()] = visits;
  try {
    localStorage.setItem(timelineKey(), JSON.stringify({ savedAt: Date.now(), visits }));
  } catch {}
}
function forgetVisits() {
  delete visitsInMemory[timelineKey()];
  try {
    localStorage.removeItem(timelineKey());
  } catch {}
}
// 외화 지출의 환율은 저장할 때 서버가 그 결제일 것으로 받아 온다(#55). 그래서 날짜는 원화처럼 아무 날이나 고른다.
// 금액에 쓸 수 있는 소수 자리(원·엔은 정수, 달러·유로 등은 0.01까지)
const amountOfInput = (value, currency) => Number(String(value).replace(decimalsOf(currency) ? /[^\d.]/g : /[^\d]/g, ''));
function newDraft() {
  const { room, me } = state.data;
  const uids = room.members.filter(active).map((m) => m.uid);
  const last = lastUsed();
  const currencies = ['KRW', room.fx?.currency].filter(Boolean);
  return {
    title: '',
    amount: '',
    currency: currencies.includes(last.currency) ? last.currency : 'KRW',
    payer: uids.includes(last.payer) ? last.payer : me.uid,
    method: last.method === 'cash' ? 'cash' : 'card',
    present: Array.isArray(last.present) && last.present.every((u) => uids.includes(u)) && last.present.length ? last.present : uids,
    date: kstNow().slice(0, 10),
    time: kstNow().slice(11, 16),
  };
}

async function saveExpense() {
  const d = state.draft;
  state.saving = true;
  state.formError = '';
  renderSheet();
  try {
    const path = state.editing
      ? `/api/rooms/${encodeURIComponent(roomId)}/expenses/${encodeURIComponent(state.editing)}`
      : `/api/rooms/${encodeURIComponent(roomId)}/expenses`;
    await api(path, {
      method: 'POST',
      body: {
        ...(!state.editing && state.addMode === 'photo' && d.items && state.lastImage ? { receipt: state.lastImage } : {}),
        expense: state.addMode === 'photo' && d.items
          ? { ...d, amount: undefined, source: 'receipt' }
          : { ...d, items: undefined, amount: amountOfInput(d.amount, d.currency) },
      },
    });
    remember(d);
    if (state.editing) {
      state.sheet = 'exp';
      state.expId = state.editing;
      state.editing = null;
    } else {
      sheet.close();
    }
    await load();
  } catch (e) {
    state.formError = e.message;
  }
  state.saving = false;
  renderSheet();
}

// ---------------------------------------------------------------- 영수증 사진
// 긴 변 1600px JPEG(품질 0.8)로 줄여 base64로 만든다. 원본 사진은 서버에 저장하지 않는다.
async function downscale(file, max = 1600, quality = 0.8) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', quality));
  const url = await new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = rej;
    fr.readAsDataURL(blob);
  });
  return { mimeType: 'image/jpeg', data: String(url).split(',')[1] };
}

async function readReceipt(file) {
  const controller = new AbortController();
  state.reading = controller;
  state.formError = '';
  renderSheet();
  try {
    const image = await downscale(file);
    state.lastImage = image;
    const { draft } = await api(`/api/rooms/${encodeURIComponent(roomId)}/receipts/extract`, { method: 'POST', body: { image }, signal: controller.signal });
    applyReceipt(draft);
  } catch (e) {
    if (e.name !== 'AbortError') state.formError = `Could not read the receipt (${e.message}). Please enter it manually.`;
    if (e.name !== 'AbortError') state.addMode = 'manual';
  }
  state.reading = null;
  renderSheet();
}

// 읽은 초안을 입력 폼에 채운다. 못 읽었으면 직접 입력으로 넘기고, 읽은 만큼만 채운다(금액은 비운다).
function applyReceipt(r) {
  const d = state.draft;
  const currencies = ['KRW', state.data.room.fx?.currency].filter(Boolean);
  if (r.merchant) d.title = r.merchant;
  if (currencies.includes(r.currency)) d.currency = r.currency;
  if (r.time) d.time = r.time;
  const notes = [...(r.warnings || [])];
  if (r.date) d.date = r.date;
  if (!r.ok) {
    state.addMode = 'manual';
    d.amount = '';
    state.formError = `${r.reason}. Please enter it manually.`;
    state.readNotes = [];
    return;
  }
  d.items = r.items;
  d.total = r.total;
  state.readNotes = notes;
}

// ---------------------------------------------------------------- 지출 상세: 메뉴 배분과 줄 확인
const isFlagged = (a) => Boolean(a) && a.confidence < 0.7 && !a.confirmed;

async function allocateExpense(eid) {
  state.allocating = eid;
  state.formError = '';
  renderSheet();
  try {
    const out = await api(`/api/rooms/${encodeURIComponent(roomId)}/expenses/${encodeURIComponent(eid)}/allocate`, { method: 'POST', body: {} });
    state.allocSource[eid] = allocLabel(out);
    delete state.edits[eid];
  } catch (e) {
    state.formError = e.message;
  }
  state.allocating = null;
  await load();
}

async function confirmLine(eid, itemId) {
  const exp = state.data.expenses.find((e) => e.id === eid);
  const consumers = state.edits[eid]?.[itemId] ?? exp.alloc?.[itemId]?.consumers;
  try {
    await api(`/api/rooms/${encodeURIComponent(roomId)}/expenses/${encodeURIComponent(eid)}/lines/${encodeURIComponent(itemId)}`, { method: 'POST', body: { consumers, confirm: true } });
    if (state.edits[eid]) delete state.edits[eid][itemId];
    state.formError = '';
  } catch (e) {
    state.formError = e.message;
  }
  await load();
}

// 비서가 짐작한 대로 한꺼번에 확정한다. eid가 있으면 그 지출만(고쳐 둔 줄은 고친 대로), 없으면 방의 모든 지출
async function confirmGuesses(eid) {
  if (state.busy === 'confirm-guesses') return;
  state.busy = 'confirm-guesses';
  try {
    const path = eid ? `/expenses/${encodeURIComponent(eid)}/confirm-guesses` : '/confirm-guesses';
    await api(`/api/rooms/${encodeURIComponent(roomId)}${path}`, { method: 'POST', body: eid ? { edits: state.edits[eid] ?? {} } : {} });
    if (eid) delete state.edits[eid];
    else state.edits = {};
    state.formError = '';
  } catch (e) {
    state.formError = e.message;
  } finally {
    state.busy = null;
  }
  await load();
}

function expenseChip(e) {
  if (!e.items?.length) return chip('1/N');
  if (!e.alloc) return chip('Not split by item');
  const n = e.items.filter((it) => isFlagged(e.alloc[it.id])).length;
  return n ? chip(`To confirm ${n}`, 'warn') : chip('Split by item', 'ok');
}

function linesHtml(exp) {
  const edits = state.edits[exp.id] ?? {};
  return exp.items.map((it) => {
    const a = exp.alloc?.[it.id];
    const chosen = edits[it.id] ?? a?.consumers ?? [];
    const edited = Boolean(edits[it.id]);
    const flag = isFlagged(a);
    const picks = exp.present.map((u) => `<button type="button" class="pick" aria-pressed="${chosen.includes(u)}" ${a ? '' : 'disabled'}
        data-action="pick" data-exp="${esc(exp.id)}" data-line="${esc(it.id)}" data-p="${esc(u)}">${avatar(u)}${esc(nameOf(u))}</button>`).join('');
    // 확인이 필요한 줄이 내 비서가 물은 게 아니면 누구의 비서가 물었는지 함께 보인다(청구서 보내기가 막혀 여기로 왔을 때 길을 잃지 않게)
    const owner = flag && exp.createdBy !== state.data.me.uid ? chip(askedBy(exp.createdBy, { me: state.data.me.uid, nameOf }), 'warn') : '';
    const confirmBtn = a && (flag || edited)
      ? `<div class="line-foot"><button class="btn sm ${flag ? 'secondary' : 'plain'}" data-action="confirm-line" data-exp="${esc(exp.id)}" data-line="${esc(it.id)}">${edited ? 'Confirm' : 'Confirm agent guess'}</button>${owner}</div>`
      : '';
    const focus = state.focusLine?.exp === exp.id && state.focusLine.line === it.id;
    return `<div class="line ${flag ? 'flag' : ''}${focus ? ' focus' : ''}" data-line-id="${esc(it.id)}"${focus ? ' aria-current="true"' : ''}>
      <div class="line-top"><span class="line-name">${it.time ? `<small style="margin:0 6px 0 0">${esc(it.time)}</small>` : ''}${esc(it.name)}<small>×${it.qty}</small></span><span class="num">${money(it.qty * it.unit, exp.currency)}</span></div>
      <div class="picks">${picks}</div>
      <p class="reason">${a ? esc(a.confirmed ? `${a.reason ? `${a.reason} ` : ''}(confirmed)` : a.reason) : 'Not split yet.'}</p>
      ${confirmBtn}</div>`;
  }).join('');
}

// 확인할 줄이 여럿이면 줄마다 누르지 않고 한 번에 확정한다. 고쳐 둔 줄은 고친 대로, 나머지는 비서가 짐작한 대로(서버 confirm-guesses)
function bulkConfirmHtml(exp, busy) {
  const n = exp.items.filter((it) => isFlagged(exp.alloc?.[it.id])).length;
  if (n < 2 || busy) return '';
  return `<div class="line-foot" style="margin-bottom:10px"><span class="grow meta">Lines to confirm: ${n}</span>
    <button class="btn sm secondary" data-action="confirm-guesses" data-id="${esc(exp.id)}">Confirm all guesses (${n})</button></div>`;
}

function expSheetHtml(exp) {
  const { room } = state.data;
  const { krw, how } = toKrw(exp, room, room.policy);
  const s = shares(exp, room, room.policy);
  const busy = state.allocating === exp.id;
  const ab = allocButton({ allocated: Boolean(exp.alloc), fresh: Boolean(exp.allocFresh), flagged: (exp.items ?? []).filter((it) => isFlagged(exp.alloc?.[it.id])).length });
  const lines = exp.items?.length
    ? `<section class="group"><h3 class="group-label"><span>Receipt lines: ${exp.items.length}</span><span>${esc(state.allocSource[exp.id] ?? (exp.alloc ? '' : 'Not split yet'))}</span></h3>
        ${busy ? '<div class="next" aria-busy="true" style="margin:0 0 12px"><h2 style="font-size:1.0625rem">Agents are splitting from their memories</h2><div class="progress"><i></i></div></div>' : ''}
        ${bulkConfirmHtml(exp, busy)}<div class="list">${linesHtml(exp)}</div>
        <p class="group-note">${exp.alloc ? 'Tap names to edit, then confirm. A confirmed line is not asked about again.' : 'Agents use their shared memories to decide whose each line is. Where there is no evidence, they ask instead of guessing.'}</p>
        <button class="btn ${exp.alloc ? 'secondary' : ''}" style="width:100%;margin-top:10px" data-action="allocate-exp" data-id="${esc(exp.id)}" ${busy || ab.disabled ? 'disabled' : ''}>${ab.label}</button>
        ${ab.hint ? `<p class="group-note" style="margin-top:8px">${esc(ab.hint)}</p>` : ''}</section>`
    : `<p class="how">No receipt lines, so it is split equally among everyone who joined (${exp.present.length}).</p>`;
  return `<div class="big"><div class="amt">${won(krw)}</div>
      <p class="sub">${money(amountOf(exp), exp.currency)} · ${esc(nameOf(exp.payer))} ${exp.method === 'card' ? 'card' : 'cash'} · ${dayLabel(exp.date)} ${esc(exp.time)}</p></div>
    <p class="how">${esc(how)}</p>
    ${exp.hasReceipt ? `<button class="btn secondary" style="width:100%;margin-bottom:20px" data-action="show-receipt" data-id="${esc(exp.id)}">View receipt</button>` : ''}
    ${state.formError ? `<p class="form-error" role="alert">${esc(state.formError)}</p>` : ''}
    ${lines}
    <section class="group"><h3 class="group-label"><span>Each person’s share</span><span>${exp.split === 'items' ? 'By usage' : '1/N'}</span></h3>
      <div class="list">${room.members.filter((m) => s.krwShare[m.uid] !== undefined).map((m) => `<div class="row" style="--inset:52px">${avatar(m.uid)}
        <span class="grow">${esc(m.name)}${m.uid === exp.payer ? ' <span class="meta">· payer</span>' : ''}</span>
        <span class="amount num">${won(s.krwShare[m.uid])}</span></div>`).join('')}</div>${restNote(s.rest)}</section>
    ${room.status === 'done' ? '<p class="group-note">This room is settled, so expenses can’t be edited or deleted.</p>' : `<div style="display:grid;gap:8px">
      <button class="btn plain" data-action="edit-exp" data-id="${esc(exp.id)}">Edit expense</button>
      <button class="btn danger ${state.armedDelete === exp.id ? 'armed' : ''}" data-action="delete-exp" data-id="${esc(exp.id)}">${state.armedDelete === exp.id ? 'Tap again to delete' : 'Delete expense'}</button>
    </div>`}`;
}

// ---------------------------------------------------------------- 영수증 사진 모달
async function showReceipt(eid) {
  try {
    const { mimeType, data } = await api(`/api/rooms/${encodeURIComponent(roomId)}/expenses/${encodeURIComponent(eid)}/receipt`);
    $('#photo-img').src = `data:${mimeType};base64,${data}`;
    const modal = $('#photo-modal');
    modal.hidden = false;
    requestAnimationFrame(() => modal.classList.add('shown'));
    modal.querySelector('button').focus({ preventScroll: true });
  } catch (e) {
    state.formError = e.message;
    renderSheet();
  }
}
function closePhoto() {
  const modal = $('#photo-modal');
  if (modal.hidden) return;
  modal.classList.remove('shown');
  setTimeout(() => { modal.hidden = true; $('#photo-img').removeAttribute('src'); }, 200);
}

const lineSum = (items) => items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.unit) || 0), 0);

// #4 방 만들기·참가하기·정책·초대. 복사·공유는 클릭 처리기 안에서 바로 불러야 브라우저가 허락한다
const SETUP_ACTIONS = new Set(['open-invite', 'range-toggle', 'range-day', 'range-month', 'range-preset', 'range-clear', 'cf-policy', 'cf-foreign', 'sign-in', 'create-room', 'join-room', 'agree-policy', 'edit-policy', 'toggle-policy', 'set-policy', 'make-invite', 'copy-invite', 'share-invite', 'open-leave', 'leave-room', 'remove-member']);
// 기간 고르기(방 만들기 폼). 화면을 통째로 다시 그리므로, 방금 누른 자리로 초점을 돌려놓아 키보드로 이어 고를 수 있게 한다
function rangeAct(name, d) {
  const p = setup.picker;
  const c = setup.create;
  const today = todayIso();
  let back = '[data-action="range-toggle"]';
  if (name === 'range-toggle') {
    p.open = !p.open;
    p.entering = p.open; // 펼칠 때만 한 번 나타나는 움직임(날짜를 누를 때마다 다시 움직이지 않게)
    if (p.open) Object.assign(p, { month: (c.start || today).slice(0, 7), focus: c.start || today });
  }
  if (name === 'range-month') {
    p.month = shiftMonth(p.month, Number(d.step));
    back = `[data-action="range-month"][data-step="${d.step}"]`;
  }
  if (name === 'range-day') {
    Object.assign(c, pickDay(c, d.date));
    p.focus = d.date;
    back = `[data-date="${d.date}"]`;
  }
  if (name === 'range-preset') {
    Object.assign(c, presetRange(d.id, c, today));
    Object.assign(p, { month: c.start.slice(0, 7), focus: c.end });
    back = `[data-action="range-preset"][data-id="${d.id}"]`;
  }
  if (name === 'range-clear') Object.assign(c, { start: '', end: '' });
  render();
  p.entering = false;
  document.querySelector(back)?.focus({ preventScroll: true });
}
// 달력 안의 방향키: 초점만 옮기고(달이 바뀌면 그 달을 보여 준다) 고르기는 Enter·Space(버튼 누르기)로 한다
function rangeKeys(e) {
  const next = e.target.dataset?.date && nextFocus(e.target.dataset.date, e.key);
  if (!next) return false;
  e.preventDefault();
  Object.assign(setup.picker, { focus: next, month: next.slice(0, 7) });
  render();
  document.querySelector(`[data-date="${next}"]`)?.focus();
  return true;
}

async function setupAct(name, d) {
  const base = `/api/rooms/${encodeURIComponent(roomId)}`;
  if (name.startsWith('range-')) return rangeAct(name, d);
  if (name === 'cf-policy') {
    setup.create.policy = d.id;
    return render();
  }
  if (name === 'cf-foreign') {
    setup.create.foreign = d.id === 'yes';
    render();
    return void document.querySelector(`[data-action="cf-foreign"][data-id="${d.id}"]`)?.focus({ preventScroll: true }); // 다시 그려도 초점은 누른 자리에
  }
  // 나가기(#55): '내 계정' 메뉴에서 시트를 연다. 돈이 남아 있으면 시트가 까닭을 보이고 버튼을 두지 않는다
  if (name === 'open-leave') {
    setup.leaveError = '';
    return openAgentSheet('leave');
  }
  if (name === 'leave-room') {
    if (setup.leaving) return undefined;
    setup.leaving = true;
    setup.leaveError = '';
    renderSheet();
    try {
      await api(`${base}/leave`, { method: 'POST', body: {} });
      return void location.assign('account.html');
    } catch (e) {
      setup.leaveError = e.message; // 그 사이 상황이 바뀌어 서버가 막았으면 버튼 바로 위에 까닭을 보인다
    } finally {
      setup.leaving = false;
    }
    await load();
    return renderSheet();
  }
  // 내보내기(#55, 방을 만든 사람): 지출 지우기처럼 3초 안에 한 번 더 눌러야 한다
  if (name === 'remove-member') {
    setup.removeError = null;
    if (setup.armed !== d.id) {
      setup.armed = d.id;
      renderSheet();
      setTimeout(() => { if (setup.armed === d.id) { setup.armed = null; renderSheet(); } }, 3000);
      return undefined;
    }
    setup.armed = null;
    try {
      await api(`${base}/members/${encodeURIComponent(d.id)}/remove`, { method: 'POST', body: {} });
    } catch (e) {
      setup.removeError = { uid: d.id, message: e.message };
    }
    await load();
    return renderSheet();
  }
  if (name === 'edit-policy') {
    setup.policyEdit = !setup.policyEdit;
    return render();
  }
  // 접힌 환율 정책: 다시 그리지 않고 그 자리에서 펼친다. 그래야 높이·화살표가 지금 모습에서 이어 움직이고, 중간에 다시 누르면 그 자리에서 되돌아간다
  if (name === 'toggle-policy') {
    setup.policyOpen = !setup.policyOpen;
    document.querySelector('[data-action="toggle-policy"]')?.setAttribute('aria-expanded', String(setup.policyOpen));
    const detail = document.getElementById('policy-detail');
    if (detail) {
      detail.classList.toggle('open', setup.policyOpen);
      detail.inert = !setup.policyOpen;
    }
    return;
  }
  // 시트를 먼저 열고, 링크가 없으면 그때 만든다. 처음 불러오는 중에 눌러도 이미 보낸 링크를 새 링크로 덮지 않게 있는지부터 본다
  if (name === 'open-invite') {
    setup.copyError = '';
    openAgentSheet('invite');
    if (setup.invite) return undefined;
    try {
      const { invite } = await api(`${base}/invite`);
      setup.invite = invite ?? await api(`${base}/invite`, { method: 'POST', body: {} });
    } catch (e) {
      setup.copyError = e.message;
    }
    return renderSheet();
  }
  if (name === 'copy-invite') {
    const done = (ok) => {
      setup.copied = ok;
      setup.copyError = ok ? '' : 'Could not copy. Tap the link to select all of it, then copy.'; // 누른 링크 줄 바로 아래에 알린다
      render();
      if (ok) setTimeout(() => { setup.copied = false; render(); }, 1500);
    };
    if (!navigator.clipboard) return done(false);
    return navigator.clipboard.writeText(inviteUrl(setup.invite.token)).then(() => done(true), () => done(false));
  }
  if (name === 'share-invite') {
    const { room } = state.data;
    return navigator.share({ title: room.name, text: `Join the settlement room “${room.name}”`, url: inviteUrl(setup.invite.token) }).catch(() => {});
  }
  if (setup.busy) return;
  const need = (ok, msg) => {
    if (!ok) throw new Error(msg);
  };
  setup.busy = true;
  setup.error = '';
  render();
  try {
    // 방 만들기·초대 화면에서 바로 로그인한다(계정 화면으로 갔다 오면 초대 링크를 잃는다). 로그인하면 내 프로필로 다시 그린다
    if (name === 'sign-in') {
      await login();
      await loadProfile();
      if (inviteToken) setup.invitePreview = await api(`/api/invites/${encodeURIComponent(inviteToken)}`).catch((e) => ({ error: e.message }));
    }
    if (name === 'create-room') {
      const c = setup.create;
      need(c.name.trim(), 'Enter a room name');
      need(!c.start || !c.end || c.end >= c.start, 'The end date is before the start date');
      ensureUid();
      // 환율 정책은 외화 방에만 보낸다(#55). 원화 방은 정책을 묻지 않는다
      const { room } = await api('/api/rooms', { method: 'POST', body: { name: c.name, dates: datesLabel(c.start, c.end), ...(c.foreign ? { currency: c.fxCurrency, policy: c.policy } : {}) } });
      location.search = `?room=${encodeURIComponent(room.id)}`;
      return;
    }
    if (name === 'join-room') {
      ensureUid(); // 'Agree and join'을 누른 것이 곧 동의다
      const { roomId: id } = await api(`/api/invites/${encodeURIComponent(inviteToken)}/join`, { method: 'POST', body: { agree: true } });
      location.search = `?room=${encodeURIComponent(id)}`;
      return;
    }
    if (name === 'agree-policy') await api(`${base}/policy/agree`, { method: 'POST', body: {} });
    if (name === 'set-policy') {
      await api(`${base}/policy`, { method: 'POST', body: { policy: d.id } });
      setup.policyEdit = false;
    }
    if (name === 'make-invite') setup.invite = await api(`${base}/invite`, { method: 'POST', body: {} });
  } catch (e) {
    setup.error = e.message;
  } finally {
    setup.busy = false;
  }
  if (roomId) await load();
  else render();
}

// 방 만들기·참가 화면에 보일 내 프로필(이름·색). 아직 누구인지 모르면(로그인 전) null
async function loadProfile() {
  if (!currentUid()) return void (setup.profile = null);
  try {
    setup.profile = (await api('/api/me')).profile;
  } catch {
    setup.profile = null;
  }
}

async function loadInvite() {
  try {
    setup.invitePreview = await api(`/api/invites/${encodeURIComponent(inviteToken)}`);
  } catch (e) {
    setup.invitePreview = { error: e.message };
  }
  render();
}

async function act(name, d) {
  if (name !== 'agree' && name !== 'reject' && name !== 'revise-send') state.disputeDone = null; // 동의·거부·고쳐 제안한 결과 한 줄은 다음 조작 전까지만 남긴다
  if (SETUP_ACTIONS.has(name)) return setupAct(name, d);
  if (agentPanel.handles(name)) return agentPanel.act(name, d);
  if (AGENT_ACTIONS.has(name)) return agentAct(name, d); // 송금 링크는 이 호출 안에서 동기적으로 연다
  if (name === 'receipt-sample') {
    // 체험 데모: 샘플 영수증을 그려 사진을 고른 것처럼 읽는다
    const { sampleReceiptFile } = await import('./demo/receipt.js');
    readReceipt(await sampleReceiptFile(state.data.room));
  } else if (name === 'show-receipt') {
    showReceipt(d.id);
  } else if (name === 'close-photo') {
    closePhoto();
  } else if (name === 'delete-exp') {
    // 되돌릴 수 없는 동작이라 한 번 더 눌러야 지운다(3초 안에)
    if (state.armedDelete !== d.id) {
      state.armedDelete = d.id;
      renderSheet();
      setTimeout(() => { if (state.armedDelete === d.id) { state.armedDelete = null; renderSheet(); } }, 3000);
      return;
    }
    state.armedDelete = null;
    try {
      await api(`/api/rooms/${encodeURIComponent(roomId)}/expenses/${encodeURIComponent(d.id)}/delete`, { method: 'POST', body: {} });
      sheet.close();
    } catch (e) {
      state.formError = e.message;
      renderSheet();
    }
    await load();
  } else if (name === 'edit-exp') {
    const exp = state.data.expenses.find((e) => e.id === d.id);
    state.draft = {
      title: exp.title, amount: exp.amount != null ? String(exp.amount) : '', currency: exp.currency, payer: exp.payer,
      method: exp.method, present: [...exp.present], date: exp.date, time: exp.time, kind: exp.kind,
      items: exp.items ? structuredClone(exp.items) : undefined,
    };
    state.addMode = exp.items ? 'photo' : 'manual';
    state.editing = exp.id;
    state.readNotes = exp.alloc && exp.items ? ['Changing lines or who joined means splitting by item again'] : [];
    state.formError = '';
    state.sheet = 'add';
    renderSheet();
  } else if (name === 'add-expense') {
    state.editing = null;
    state.lastImage = null;
    state.draft = newDraft();
    state.addMode = state.aiReady ? 'photo' : 'manual'; // 영수증이 첫 입력 수단(사용자 테스트 11/5). AI가 없으면 직접 입력
    state.readNotes = [];
    state.formError = '';
    state.sheet = 'add';
    sheet.open(renderSheet);
  } else if (name === 'close-sheet') {
    sheet.close();
  } else if (name === 'draft-set') {
    state.draft[d.field] = d.id;
    renderSheet();
  } else if (name === 'draft-present') {
    const set = new Set(state.draft.present);
    if (set.has(d.id)) set.delete(d.id); else set.add(d.id);
    if (set.size) state.draft.present = members().map((m) => m.uid).filter((u) => set.has(u));
    renderSheet();
  } else if (name === 'open-exp') {
    state.expId = d.id;
    state.formError = '';
    state.sheet = 'exp';
    // 막힌 줄에서 왔으면 그 줄로 스크롤해 강조한다(renderSheet). 그냥 지출을 연 것이면 처음부터 보인다
    state.focusLine = d.line ? { exp: d.id, line: d.line, pending: true } : null;
    sheet.open(renderSheet);
  } else if (name === 'allocate-exp') {
    if (!state.allocating) allocateExpense(d.id);
  } else if (name === 'pick') {
    const exp = state.data.expenses.find((e) => e.id === d.exp);
    const edits = (state.edits[d.exp] ??= {});
    const set = new Set(edits[d.line] ?? exp.alloc?.[d.line]?.consumers ?? []);
    if (set.has(d.p)) set.delete(d.p); else set.add(d.p);
    if (set.size) edits[d.line] = exp.present.filter((u) => set.has(u));
    renderSheet();
  } else if (name === 'confirm-guesses' || name === 'confirm-all-guesses') {
    confirmGuesses(name === 'confirm-guesses' ? d.id : null);
  } else if (name === 'confirm-line') {
    if (state.focusLine?.exp === d.exp && state.focusLine.line === d.line) state.focusLine = null; // 확인했으니 강조는 거둔다
    confirmLine(d.exp, d.line);
  } else if (name === 'add-mode') {
    state.addMode = d.id;
    state.formError = '';
    renderSheet();
  } else if (name === 'cancel-read') {
    state.reading?.abort();
  } else if (name === 'draft-del-item') {
    state.draft.items.splice(Number(d.i), 1);
    if (!state.draft.items.length) state.draft.items = undefined;
    renderSheet();
  } else if (name === 'save-expense') {
    if (!state.saving) saveExpense();
  } else if (name === 'who') {
    setCurrentUid(d.id);
    await load();
    watch();
  } else if (name === 'seed') {
    try {
      const { roomId: id } = await api('/api/dev/seed', { method: 'POST' });
      location.search = `?room=${encodeURIComponent(id)}`;
    } catch {
      state.error = { status: 'seed' };
      render();
    }
  }
}

// ---------------------------------------------------------------- 화면
function noRoom() {
  return createRoomHtml(setup.create, { busy: setup.busy, error: setup.error, seedFailed: state.error?.status === 'seed', dev: authOptions().dev, profile: setup.profile, picker: setup.picker, today: todayIso() });
}

const isDemoRoom = () => String(roomId).startsWith('demo-');

function whoPicker() {
  if (!authOptions().dev || !isDemoRoom()) return ''; // 개발용 데모 방에서만 남의 신원으로 바꿔 본다
  const me = currentUid();
  return `<section class="group"><h2 class="group-label"><span>View as</span><span>Development seed identities</span></h2>
    <div class="seg" role="radiogroup" aria-label="Viewer" data-seg="who"><span class="seg-thumb"></span>
      ${members().filter(active).map((m) => `<button type="button" role="radio" aria-checked="${m.uid === me}" data-action="who" data-id="${esc(m.uid)}">${esc(m.name)}</button>`).join('')}
    </div></section>`;
}

function hero() {
  const { room, me } = state.data;
  // 내 칩은 '내 비서' 입구를 겸한다(#5). 다른 사람 칩은 이름표이고, 비서 설정을 마쳤는지만 로봇 표시로 보인다
  const ready = new Set(state.data.agentReady ?? []);
  const person = (m) => (m.uid === me.uid ? agentPanel.chipHtml(m, avatar(m.uid)) : personChipHtml({ name: m.name, avatar: avatar(m.uid), ready: ready.has(m.uid) }));
  const here = room.members.filter(active); // 탈퇴하거나 나간 사람은 지출·송금 기록에만 남는다(#55)
  return `<section class="hero"><h1>${esc(room.name)}</h1>
    <p class="sub">${esc(room.dates || '')}${room.dates ? ' · ' : ''}Members: ${here.length} · ${room.status === 'done' ? 'This room is settled' : 'Agents talk about the money'}</p>
    <div class="people">${here.map(person).join('')}${hasStarted(room) ? '' : inviteButtonHtml()}</div></section>`;
}

function nextCard() {
  const mine = state.data.actions ?? [];
  if (state.data.room.status === 'done') return doneCardHtml(); // 끝난 방은 지출을 더 받지 않고, 남은 일은 나가기뿐이다(#55)
  if (!mine.length) {
    // 영수증 사진은 지출 남기기 시트 맨 위에서 '직접 입력'과 나란히 고른다. 카드에는 입구 하나만 둔다
    const add = '<button class="btn" data-action="add-expense">Add expense</button>';
    // 아직 메뉴별로 나누지 않은 영수증이 있으면 그걸 먼저 권한다. 합계만 알아 1/N로 나누기로 한 지출(split: 'equal')은 빼고
    const unsplit = state.data.expenses.find((e) => e.split === 'items' && e.items?.length && !e.alloc);
    if (unsplit) {
      return `<section class="next"><p class="eyebrow">Next up</p><h2>“${esc(unsplit.title)}” isn’t split by item yet</h2>
        <p>Agents use their shared memories to decide whose each line is. They ask a person only where there is no evidence.</p>
        <div class="actions"><button class="btn" data-action="open-exp" data-id="${esc(unsplit.id)}">Go split</button>${add.replace('class="btn"', 'class="btn plain"')}</div></section>`;
    }
    const settling = settlingCard(add.replace('class="btn"', 'class="btn plain"'));
    if (settling) return settling;
    return `<section class="next"><p class="eyebrow">${esc(state.data.me.name)}’s to-do</p><h2>Nothing to do right now</h2>
      <p>Add any shared spending. When something needs your confirmation, your agent posts it here.</p>
      <div class="actions">${add}</div></section>`;
  }
  const first = mine[0];
  return `<section class="next warn"><p class="eyebrow">${esc(state.data.me.name)}’s to-dos: ${mine.length}</p><h2>${esc(first.text)}</h2>
    <p>${esc(actionNote(first))}</p><div class="actions">${actionButtons(first)}</div></section>`;
}

// 이의 목록. 이의를 낸 사람처럼 '할 일'이 없는 당사자도 여기서 시트로 들어가 중재안을 보고 거부할 수 있다.
// 열린 이의를 먼저, 끝난 이의는 어떻게 끝났는지와 함께 남긴다(기각된 쪽이 결과를 다시 확인할 곳이기도 하다)
function disputesSection() {
  const { disputes = [], expenses } = state.data;
  const rows = disputes.map((d) => [d, expenses.find((e) => e.id === d.expenseId)]).filter(([, e]) => e)
    .sort(([a], [b]) => Number(disputeLive(b)) - Number(disputeLive(a)));
  if (!rows.length) return '';
  const live = rows.filter(([d]) => disputeLive(d)).length;
  const items = rows.map(([d, e]) => `<button class="row" data-action="open-dispute" data-id="${esc(d.id)}">
      ${tile(e.kind)}
      <span class="grow"><span class="title">${esc(e.title)}</span>
        <span class="meta" style="display:block">Dispute from ${esc(nameOf(d.by))}</span>
        <span class="meta" style="display:block;color:var(--label)">${esc(disputeStatus(d, e, nameOf))}</span>
        <span style="display:block;margin-top:4px">${disputeLive(d) ? chip('Open', 'warn') : chip('Closed')}</span></span>
      ${CHEVRON}
    </button>`).join('');
  return `<section class="group"><h2 class="group-label"><span>Disputes: ${rows.length}</span><span>${live ? `Open: ${live}` : 'All closed'}</span></h2>
    <div class="list">${items}</div></section>`;
}

function expensesSection() {
  const { room, expenses } = state.data;
  const rows = expenses.map((e) => `<button class="row" data-action="open-exp" data-id="${esc(e.id)}">
      ${tile(e.kind)}
      <span class="grow"><span class="title">${esc(e.title)}</span>
        <span class="meta" style="display:block">${esc(nameOf(e.payer))} · ${e.method === 'card' ? 'Card' : 'Cash'} ${money(amountOf(e), e.currency)} · ${dayLabel(e.date)} ${esc(e.time)}</span>
        <span style="display:block;margin-top:4px">${expenseChip(e)}</span></span>
      <span class="end"><span class="amount">${won(toKrw(e, room, room.policy).krw)}</span></span>
      ${CHEVRON}
    </button>`).join('');
  return `<section class="group"><h2 class="group-label"><span>Expenses: ${expenses.length}</span>${room.status === 'done' ? '' : '<button class="text-btn" data-action="add-expense">Add expense</button>'}</h2>
    <div class="list">${rows || '<p class="empty">No expenses yet.</p>'}</div></section>`;
}

function transfersSection() {
  const { transfers, ledger } = state.data;
  const live = transfers.filter((t) => t.status !== 'superseded');
  const list = live.length ? live : settle(ledger).map((t) => ({ ...t, status: 'preview' }));
  const me = currentUid();
  const label = (t) => ({ preview: 'Invoices not sent', scheduled: isManual(t) ? 'Send any time' : new Date(t.remindAt) > Date.now() ? `Scheduled ${whenText(t.remindAt)}` : 'Reminder soon', due: 'Time to send', opened: 'Transfer app opened', sent: !t.notReceivedAt ? 'Sent' : t.to === me ? 'Asked to check' : 'Not received yet', confirmed: 'Received' })[t.status] ?? t.status;
  const rows = list.map((t) => {
    const mine = t.id && (t.from === me || t.to === me);
    const tag = mine ? `button type="button" class="row" data-action="open-transfer" data-id="${esc(t.id)}"` : 'div class="row"';
    return `<${tag} style="--inset:76px">
      <span style="display:flex;gap:2px">${avatar(t.from)}${avatar(t.to)}</span>
      <span class="grow"><span class="title">${esc(nameOf(t.from))} → ${esc(nameOf(t.to))}</span>
        <span style="display:block;margin-top:3px">${chip(label(t), t.status === 'confirmed' ? 'ok' : t.status === 'due' ? 'warn' : '')}</span></span>
      <span class="end"><span class="amount num">${won(t.amount)}</span>${mine ? CHEVRON : ''}</span></${mine ? 'button' : 'div'}>`;
  }).join('');
  return `<section class="group"><h2 class="group-label"><span>Who pays whom</span><span>Transfers: ${list.length}</span></h2>
    <div class="list">${rows || '<p class="empty">No money to move.</p>'}</div></section>`;
}

const seg = (key, field, options, value) => `<div class="seg" role="radiogroup" data-seg="${key}"><span class="seg-thumb"></span>
  ${options.map(([id, label]) => `<button type="button" role="radio" aria-checked="${id === value}" data-action="draft-set" data-field="${field}" data-id="${esc(id)}">${esc(label)}</button>`).join('')}</div>`;

function addSheetHtml() {
  const d = state.draft;
  const room = { ...state.data.room, members: state.data.room.members.filter(active) };
  const currencies = ['KRW', room.fx?.currency].filter(Boolean);
  const dateField = `<input type="date" data-field="date" value="${esc(d.date)}" aria-label="Date">`;
  const picks = room.members.map((m) => `<button type="button" class="pick" aria-pressed="${d.present.includes(m.uid)}" data-action="draft-present" data-id="${esc(m.uid)}">${avatar(m.uid)}${esc(m.name)}</button>`).join('');
  const tabs = state.editing ? '' : `<div style="margin-bottom:16px">${seg('add-mode', 'mode', [['manual', 'Enter manually'], ['photo', 'Receipt photo']], state.addMode).replaceAll('data-action="draft-set"', 'data-action="add-mode"')}</div>`;
  if (state.addMode === 'photo' && !d.items) return tabs + photoPickHtml();
  const amountRow = state.addMode === 'photo' && d.items
    ? linesEditHtml(d)
    : `<label class="row field"><span class="grow">Amount</span><input data-field="amount" value="${esc(d.amount)}" inputmode="${decimalsOf(d.currency) ? 'decimal' : 'numeric'}" placeholder="0" aria-label="Amount"></label>`;
  return `${tabs}${state.readNotes.length ? state.readNotes.map((n) => `<p class="preview-note" style="margin-bottom:10px">${esc(n)}</p>`).join('') : ''}
    <section class="group"><div class="list">
      <label class="row field"><span class="grow">Title</span><input data-field="title" value="${esc(d.title)}" placeholder="e.g. Store snacks" maxlength="40"></label>
    </div></section>
    ${amountRow}
    ${currencies.length > 1 ? `<section class="group"><h3 class="group-label"><span>Currency</span>${d.currency !== 'KRW' ? '<span>That day’s rate is fetched on save</span>' : ''}</h3>${seg('cur', 'currency', currencies.map((c) => [c, unitOf(c)]), d.currency)}</section>` : ''}
    <section class="group"><h3 class="group-label"><span>Paid by</span></h3>${seg('payer', 'payer', room.members.map((m) => [m.uid, m.name]), d.payer)}</section>
    <section class="group"><h3 class="group-label"><span>Payment method</span></h3>${seg('method', 'method', [['card', 'Card'], ['cash', 'Cash']], d.method)}</section>
    <section class="group"><h3 class="group-label"><span>Who joined</span><span>Split among ${d.present.length}</span></h3><div class="picks">${picks}</div></section>
    <section class="group"><div class="list"><div class="row field"><span class="grow">Date</span>${dateField}</div>
      <label class="row field"><span class="grow">Time</span><input type="time" data-field="time" value="${esc(d.time)}" aria-label="Time"></label></div></section>
    ${state.formError ? `<p class="form-error" role="alert">${esc(state.formError)}</p>` : ''}
    <button class="btn" style="width:100%" data-action="save-expense" ${state.saving ? 'disabled' : ''}>${state.saving ? 'Saving…' : state.editing ? 'Save changes' : 'Add expense'}</button>`;
}

function photoPickHtml() {
  if (state.reading) {
    return `<section class="next" aria-busy="true" style="margin:0"><p class="eyebrow">AI is reading</p><h2>Reading your receipt</h2>
      <p>It reads each line’s item, quantity and unit price. This usually takes a few seconds.</p><div class="progress"><i></i></div>
      <div class="actions"><button class="btn plain sm" data-action="cancel-read">Cancel</button></div></section>`;
  }
  if (!state.aiReady) {
    return `<p class="preview-note">Photo reading needs an AI server. For now, use “Enter manually”.</p>`;
  }
  // 터치가 주 입력인 기기(휴대폰·태블릿)면 찍기와 앨범에서 고르기를 따로 둔다(receiptPickers)
  const touch = matchMedia('(pointer: coarse)').matches;
  // 체험 데모의 샘플 영수증은 위 한 줄을 다 쓰고, 찍기·앨범에서 고르기는 그 아래 한 줄을 나눠 쓴다(셋이 한 줄이면 앞의 둘이 좁아져 글자가 세로로 꺾였다)
  const sample = authOptions().demo ? `<div class="actions"><button type="button" class="btn plain"${touch ? ' style="flex:1"' : ''} data-action="receipt-sample">Try with a sample receipt</button></div>` : '';
  return `<section class="next" style="margin:0"><h2>${touch ? 'Take or choose a receipt photo' : 'Choose a receipt photo'}</h2>
    <p>You can check and fix what the AI read before saving. The original photo is not stored.</p>
    <div class="receipt-picks">${sample}<div class="actions">${receiptPickers(touch)}</div></div></section>`;
}

// 읽은 줄을 고칠 수 있는 목록. 합계와 줄 합을 나란히 보여 준다.
function linesEditHtml(d) {
  const rows = d.items.map((it, i) => `<div class="row field" style="gap:8px">
      <input data-item="${i}" data-key="name" value="${esc(it.name)}" aria-label="Item name" style="text-align:left;flex:3">
      <input data-item="${i}" data-key="qty" value="${it.qty}" inputmode="numeric" aria-label="Quantity" style="flex:1">
      <input data-item="${i}" data-key="unit" value="${it.unit}" inputmode="${decimalsOf(d.currency) ? 'decimal' : 'numeric'}" aria-label="Unit price" style="flex:2">
      <button type="button" class="text-btn" data-action="draft-del-item" data-i="${i}" aria-label="Delete line ${esc(it.name)}">×</button></div>`).join('');
  return `<section class="group"><h3 class="group-label"><span>Lines: ${d.items.length} · name · qty · price</span>
      <span id="line-sum">Line sum ${money(lineSum(d.items), d.currency)}${d.total ? ` · receipt total ${money(d.total, d.currency)}` : ''}</span></h3>
    <div class="list">${rows}</div>
    <p class="group-note">After saving, press “Let agents split it” to split each line.</p></section>`;
}

function renderSheet() {
  if (!state.sheet || !state.data) return;
  const body = $('#sheet-body');
  const top = body.scrollTop;
  if (AGENT_SHEETS[state.sheet]) {
    const { title, html } = AGENT_SHEETS[state.sheet]();
    $('#sheet-title').textContent = title;
    body.innerHTML = html;
    body.scrollTop = top;
    mountSegs(body);
    mountSliders(body, { onCommitGesture: (d) => sendGesture(d.id) });
    return;
  }
  const exp = state.sheet === 'exp' ? state.data.expenses.find((e) => e.id === state.expId) : null;
  $('#sheet-title').textContent = exp ? exp.title : state.editing ? 'Edit expense' : 'Add expense';
  body.innerHTML = exp ? expSheetHtml(exp) : addSheetHtml();
  body.scrollTop = top;
  mountSegs(body);
  if (exp && state.focusLine?.pending) revealLine(body);
}

// 막힌 줄이 시트 가운데에 오도록 스크롤하고, 강조 테두리가 안쪽으로 내려앉게 한다.
// 시트가 아직 올라오는 중에 미리 맞춰 두므로 그 위에 움직임을 더하지 않는다. 움직임 줄이기면 테두리만 남는다(.line.focus)
function revealLine(body) {
  const f = state.focusLine;
  f.pending = false; // 이벤트로 다시 그려도 스크롤을 되돌리지 않고 테두리만 남는다
  const el = body.querySelector(`.line[data-line-id="${CSS.escape(f.line)}"]`);
  if (!el) return;
  const at = el.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop;
  body.scrollTop = Math.max(0, at - (body.clientHeight - el.offsetHeight) / 2);
  if (reduceMotion.matches) return;
  el.animate(
    [{ boxShadow: 'inset 0 0 0 8px color-mix(in srgb, var(--orange) 28%, transparent)' }, { boxShadow: 'inset 0 0 0 2px var(--orange)' }],
    { duration: 520, delay: 240, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1)', fill: 'backwards' },
  );
}

function renderChannel() {
  const times = minuteLabels(state.events.map((e) => timeOf(e.at)));
  const items = state.events.map((e, i) => logItemHtml({
    avatar: avatar(e.from, 'agent'),
    who: agentName(e.from),
    to: nameOf(e.to),
    time: times[i],
    text: e.text,
    meta: e.meta,
    tagHtml: e.action ? chip(`${nameOf(e.action.for)} to confirm`, 'warn') : '',
    enter: i >= state.renderedLog,
  })).join('');
  const el = $('#channel');
  el.innerHTML = `<h2>Agents</h2><p class="lead">What agents said to each other instead of a group chat. People only get things to confirm.</p>
    ${state.events.length ? `<ol class="log">${items}</ol>` : `<p class="empty">${state.data ? 'No activity yet.' : 'Open a room to see the agent log here.'}</p>`}`;
  state.renderedLog = state.events.length;
  el.scrollTop = el.scrollHeight;
  logPop.update(state.events);
}


// ---------------------------------------------------------------- 비서끼리 처리(#9): 청구서·이의·중재·송금
const enc = encodeURIComponent;
const byId = (col, id) => state.data?.[col]?.find((x) => x.id === id);
const whenText = (iso) => `${dayLabel(new Date(new Date(iso).getTime() + 9 * 3600_000).toISOString().slice(0, 10))} 09:00`;
// 편할 때 보내기 송금. remindAt이 없는 예전 송금도 편할 때 보내기다(그때는 알리지 않았다)
const isManual = (t) => Boolean(t.manual) || !t.remindAt;

// 할 일마다 누를 버튼. 다음 할 일 카드와 좁은 화면의 기록 패널이 함께 쓴다
function actionButtons(a, size = '') {
  const cls = `btn ${size}`.trim();
  const id = esc(a.ref);
  switch (a.type) {
    case 'confirm_line': {
      const total = flaggedLines(state.data.expenses, isFlagged).reduce((n, g) => n + g.lines.length, 0);
      return `<button class="${cls}" data-action="open-exp" data-id="${esc(a.expenseId)}" data-line="${esc(a.itemId)}">Review</button>${total > 1 ? `<button class="${cls} secondary" data-action="confirm-all-guesses">Confirm all guesses (${total})</button>` : ''}`;
    }
    case 'answer_invoice':
      return `<button class="${cls}" data-action="open-invoice" data-id="${id}">View invoice</button>`;
    case 'agree_dispute':
      return `<button class="${cls}" data-action="open-dispute" data-id="${id}">${byId('disputes', a.ref)?.status === 'proposed' ? 'View proposal' : 'View dispute'}</button>`;
    case 'approve_transfer':
      // opened(송금 앱을 열었다)와, 받는 사람이 안 들어왔다고 한 sent는 둘 다 보냈는지 묻는다
      return ['opened', 'sent'].includes(byId('transfers', a.ref)?.status)
        ? `<button class="${cls}" data-action="mark-sent" data-id="${id}">Sent</button><button class="${cls} secondary" data-action="open-transfer" data-id="${id}">Send again</button>`
        : `<button class="${cls}" data-action="open-transfer" data-id="${id}">Go send</button>`;
    case 'set_payout':
      return `<button class="${cls}" data-action="open-payout">Add payout account</button>`;
    case 'confirm_receipt':
      // 이미 안 들어왔다고 했으면 보내는 사람의 답을 기다리는 중이라 받았어요만 둔다
      return `<button class="${cls}" data-action="confirm-receipt" data-id="${id}">Received</button>${byId('transfers', a.ref)?.notReceivedAt ? '' : `<button class="${cls} secondary" data-action="not-received" data-id="${id}">Not received yet</button>`}`;
    default:
      return '';
  }
}

// 일반 글자를 돌려준다(이름이 들어간다). HTML에 넣을 때는 쓰는 쪽에서 esc()로 감싼다(지금은 nextCard() 한 곳)
function actionNote(a) {
  const t = byId('transfers', a.ref);
  const opened = t?.status === 'opened';
  return {
    confirm_line: 'Agent memories give no evidence for this line, so the agent asks first instead of billing on a guess.',
    answer_invoice: 'It is over the auto-accept limit, so your agent asks you instead of accepting.',
    agree_dispute: byId('disputes', a.ref)?.status === 'proposed'
      ? 'If both accept, the expense is re-split per the proposal and invoices are sent again. If rejected, the dispute ends and settles with the current split.'
      : 'The mediator agent weighs both sides and the order times on the receipt, then proposes a split.',
    approve_transfer: t?.notReceivedAt ? 'Check your Toss history first. If you sent it, press “Sent”; otherwise press “Send again”.'
      : !opened ? 'Slide to send and Toss opens with the payee and amount filled in.'
      : 'If you sent it in the transfer app, say so. The payee will be asked to confirm.',
    set_payout: 'Your account number is shown only to people who owe you.',
    confirm_receipt: t?.notReceivedAt ? `${nameOf(t.from)} was asked to check the transfer history. If the money has arrived since, let them know.`
      : `Check whether it reached your account. If not, ${t ? nameOf(t.from) : 'the sender'} will be asked to check again.`,
  }[a.type] ?? '';
}

// 할 일이 없을 때: 청구서를 아직 안 보냈으면 보내기를, 보냈으면 진행 상황을 보여 준다
function settlingCard(addButtons) {
  const { room, expenses, invoices = [], transfers = [] } = state.data;
  if (state.busy === 'send') {
    return `<section class="next" aria-busy="true"><p class="eyebrow">Agents at work</p><h2>Agents are checking the invoices</h2>
      <p>Each follows its owner’s rules (auto-accept limit, send timing, disputes). A dispute goes on to mediation.</p><div class="progress"><i></i></div></section>`;
  }
  const current = invoices.filter((i) => i.version === room.version);
  if (!current.length) {
    if (!expenses.length) return '';
    // 정산 시작은 전원이 환율 정책에 동의해야 열린다(#4). 서버도 같은 조건으로 막는다
    const waiting = notAgreed(room);
    if (waiting.length) {
      return `<section class="next"><p class="eyebrow">Before settlement</p><h2>Waiting for rate policy agreement (${waiting.length})</h2>
        <p>Waiting for ${esc(waiting.map((m) => m.name).join(', '))} to agree. Once everyone does, you can send invoices.</p>
        <div class="actions"><button class="btn" disabled>Send invoices</button>${addButtons}</div></section>`;
    }
    // 확인이 필요한 줄이 있으면 서버가 막는다. 미리 알리지 않고, 버튼을 눌렀을 때 그 자리에서 까닭을 알린다(agentAct의 send-invoices)
    const notice = blockedNotice(flaggedLines(expenses, isFlagged), { me: state.data.me.uid, nameOf });
    if (!notice) state.sendBlocked = false; // 막던 줄을 모두 확인했으면 안내는 저절로 사라진다
    const blocked = state.sendBlocked ? notice : null;
    return `<section class="next"><p class="eyebrow">Next up</p><h2>Send invoices as they are?</h2>
      <p>Each agent checks by its own rules. Nothing is posted to a group chat.${invoices.length ? ' Expenses changed, so invoices need to be sent again.' : ''}</p>
      ${state.formError && !state.sheet ? `<p class="form-error" role="alert">${esc(state.formError)}</p>` : ''}
      <div class="actions"><button class="btn" data-action="send-invoices"${blocked ? ' aria-describedby="send-blocked"' : ''}>Send invoices</button>${addButtons}</div>
      ${blocked ? blockedHtml(blocked, state.announceBlocked) : ''}</section>`;
  }
  const live = transfers.filter((t) => t.version === room.version);
  // 편할 때 보내기로 정한 송금은 알림 때(다음 날 오전 9시)까지 알리지 않는다. 대신 방을 열었을 때 내 차례임을 보여 준다
  const manual = live.find((t) => t.from === state.data.me.uid && t.status === 'scheduled' && isManual(t));
  if (manual) {
    return `<section class="next"><p class="eyebrow">Send any time</p><h2>Send ${won(manual.amount)} to ${esc(nameOf(manual.to))}</h2>
      <p>Send when you’re ready.${manual.remindAt ? ` If receipt isn’t confirmed by ${esc(whenText(manual.remindAt))}, you get one reminder.` : ''}</p><div class="actions"><button class="btn" data-action="open-transfer" data-id="${esc(manual.id)}">Go send</button>${addButtons}</div></section>`;
  }
  return `<section class="next"><p class="eyebrow">Waiting</p><h2>Waiting for others to confirm</h2>
    <p>See who is doing what in “Who pays whom” below and in the agent log. When it’s your turn, it shows up here.</p><div class="actions">${addButtons}</div></section>`;
}

// 청구서를 막는 줄 안내. 몇 줄인지, 어느 지출의 줄인지, 누가 확인할지를 글로 쓰고(색에만 기대지 않는다) 줄마다 그리로 가는 버튼을 둔다.
// 스크린리더에는 눌렀을 때 한 번만 읽어 준다(announce). 이벤트로 다시 그릴 때마다 읽으면 시끄럽다
function blockedHtml(n, announce) {
  return `<div class="blocked" id="send-blocked"${announce ? ' role="alert"' : ''}>
    <p class="blocked-title">${ALERT}${esc(n.title)}</p>
    <p class="blocked-lead">${esc(n.lead)}</p>
    <ul>${n.rows.map((r) => `<li><span class="blocked-what">${esc(r.what)}<small>${esc(r.who)}</small></span>
      <button class="btn sm secondary" data-action="open-exp" data-id="${esc(r.expId)}" data-line="${esc(r.lineId)}" aria-label="${esc(`${r.what} ${r.label}`)}">${esc(r.label)}</button></li>`).join('')}</ul>
    <div class="actions" style="margin-top:10px"><button class="btn sm" data-action="confirm-all-guesses">Confirm remaining guesses (${n.total})</button></div></div>`;
}

// 눌러서 막힌 버튼 자리에서 알린다. 그리는 사이 잃은 초점을 돌려주고, 안내가 화면 밖이면 보이게 한 뒤, 버튼을 흔든다
function alertBlocked() {
  const btn = $('[data-action="send-invoices"]');
  if (!btn) return;
  btn.focus({ preventScroll: true });
  $('#send-blocked')?.scrollIntoView({ block: 'nearest', behavior: reduceMotion.matches ? 'auto' : 'smooth' });
  nudge(btn);
}

const formError = () => (state.formError ?`<p class="form-error" role="alert">${esc(state.formError)}</p>` : '');
const notFound = (title) => ({ title, html: '<p class="empty">Not found. It may have been replaced because an expense changed.</p>' });

// 청구서의 지출별 내 몫. 지난 청구서(지출이 바뀌어 대체됨)에는 지금 지출로 셈한 몫을 붙이지 않는다
const currentRows = (inv) => (inv.version === state.data.room.version ? invoiceRows(inv, state.data.room, state.data.expenses) : []);
// 중재 비서는 영수증 줄마다 누가 먹었는지를 다시 나눈다. 줄이 없는 1/N 지출은 중재할 수 없어, 이의 대신 지출을 고친다
const mediatable = (exp) => Boolean(exp.items?.length);
// 이의를 낼 수 있는 지출: 이 청구서에 내 몫이 들어간 지출 중 영수증 줄이 있는 것(청구서의 그 목록에서 바로 고른다).
// 몫을 셀 수 없는 지난 청구서면 그 청구서를 받은 사람이 함께 있던 지출. 타임라인이 골라 두는 것도 여기서만 고른다
function disputable(inv) {
  const rows = currentRows(inv);
  return (rows.length ? rows.map((r) => r.exp) : state.data.expenses.filter((e) => e.present.includes(inv.to))).filter(mediatable);
}

// 청구서에 든 지출과 내 몫. 이의를 쓰는 동안에는 같은 목록이 그 자리에서 고르는 목록이 된다(사용자 테스트 11/5:
// 따로 된 '맞지 않는 지출' 목록이 같은 지출을 두 번 보여 줬다). iOS 목록의 '선택'처럼 줄 앞에 동그라미가 밀고 들어오고,
// 고른 줄 바로 아래에 맞지 않는 점을 적는 칸이 열린다. motion: 'enter'·'leave'는 동그라미가 들어오고 나가는 한 번의 그림
const LEAVE_MS = 220; // 그만둘 때 동그라미가 나가는 시간(style.css의 pick-out과 같게)
// 줄 없는 지출의 노란 한 줄은 누른 줄 아래에서 높이가 열리며 나오고, 잠깐 뒤 같은 길로 접혀 사라진다.
// 읽거나 누르려는 중(포인터·손가락이 올라가 있거나 '지출 고치기'에 초점)이면 사라지지 않고 기다린다
const HINT_MS = 3500;
let hintTimer = 0;
function openHint() {
  const hint = $('#sheet-body .lines-hint');
  if (!hint || reduceMotion.matches || !hint.animate) return;
  hint.animate([{ height: '0px', paddingTop: '0px', paddingBottom: '0px', opacity: 0 }, { height: `${hint.offsetHeight}px`, opacity: 1 }], { duration: 260, easing: 'cubic-bezier(0.2, 0.9, 0.25, 1)' });
}
function hideHint() {
  const hint = $('#sheet-body .lines-hint');
  if (hint?.matches(':hover, :focus-within')) return void (hintTimer = setTimeout(hideHint, 1500));
  state.noLinesHint = null;
  if (!hint) return;
  if (reduceMotion.matches || !hint.animate) return hint.remove();
  hint.animate([{ height: `${hint.offsetHeight}px`, opacity: 1 }, { height: '0px', paddingTop: '0px', paddingBottom: '0px', opacity: 0 }], { duration: 220, easing: 'cubic-bezier(0.75, 0, 0.8, 0.1)', fill: 'forwards' })
    .finished.then(() => hint.remove(), () => hint.remove());
}
function invoiceLinesHtml(inv, dd, motion = '') {
  const rows = currentRows(inv);
  const items = rows.length ? rows : dd ? disputable(inv).map((exp) => ({ exp, mine: null })) : [];
  if (!items.length) return '';
  const found = dd?.found;
  const picked = dd ? items.filter(({ exp }) => exp.id in dd.picks) : [];
  const located = picked.filter(({ exp }) => found?.[exp.id]).length;
  const line = ({ exp, mine }) => {
    const on = Boolean(dd) && exp.id in dd.picks;
    const f = found?.[exp.id];
    const body = `${tile(exp.kind)}<span class="grow"><span class="title">${esc(exp.title)}</span><span class="meta" style="display:block">Paid by ${esc(nameOf(exp.payer))} · ${money(amountOf(exp), exp.currency)}${f ? ` · <span class="found">Left at ${esc(f.result.leftAt)}</span>` : ''}</span></span>
        ${mine == null ? '' : `<span class="end"><span class="amount">${won(mine)}</span></span>`}`;
    if (!dd) return `<div class="row">${body}</div>`;
    // 영수증 줄이 없는 지출(11/5 데모에서 이의가 '중재 전'에 멈췄다): 흐리게 두고 누르면 고르지 않는다. 대신 그 줄을 흔들고
    // 바로 아래 노란 한 줄로 이의 대신 '지출 고치기'를 권한다(지출은 방 사람 누구나 고치고, 고치면 청구서를 다시 보낸다)
    if (!mediatable(exp)) {
      const hint = state.noLinesHint === exp.id ? `<div class="row lines-hint" role="alert">${ALERT}<span class="grow hint-text">No lines to mediate</span>
          <button type="button" class="btn sm secondary" data-action="edit-exp" data-id="${esc(exp.id)}">Edit expense</button></div>` : '';
      const off = body.replace('</span></span>', ' · no receipt lines</span></span>');
      return `<button type="button" class="row pickable" aria-disabled="true" data-action="dispute-no-lines" data-id="${esc(exp.id)}"><span class="sel-mark off" aria-hidden="true"><span class="choice-empty"></span></span>${off}</button>${hint}`;
    }
    const claim = on ? `<div class="row claim-row"><textarea data-claim="${esc(exp.id)}" rows="2" maxlength="200" aria-label="What is wrong in “${esc(exp.title)}”" placeholder="What is wrong (optional)">${esc(dd.picks[exp.id])}</textarea></div>` : '';
    const mark = `<span class="sel-mark${state.justPicked === exp.id ? ' just' : ''}" aria-hidden="true">${on ? ICON_DONE : '<span class="choice-empty"></span>'}</span>`;
    return `<button type="button" class="row pickable" data-action="dispute-toggle" data-id="${esc(exp.id)}" aria-pressed="${on}">${mark}${body}</button>${claim}`;
  };
  const none = dd && !items.some(({ exp }) => mediatable(exp));
  const note = dd ? `<p class="group-note">${none ? 'No expense on this invoice has receipt lines. Instead of disputing, tap the wrong expense and edit it.'
        : 'Choose expenses with receipt lines to send to mediation. The mediator agent re-splits them from both sides’ evidence. If there is a departure time, items ordered after it come out of your share.'}</p>
      ${located ? `<p class="group-note">Selected expenses with a timeline departure time: ${located}. For each, one summary line goes to the other party and the mediator agent. Files, coordinates and place names are not sent, and the line is deleted after 7 days.</p>` : ''}` : '';
  const end = dd ? (picked.length ? `Selected: ${picked.length}` : 'Tap to select') : rows.length ? `Total ${won(inv.owed)}` : '';
  return `<section class="group" id="invoice-lines"><h3 class="group-label"><span>${rows.length ? 'Expenses with my share' : 'Expenses I joined'}: ${items.length}</span><span>${end}</span></h3>
      <div class="list lines${dd ? ' selecting' : ''}${motion ? ` ${motion}` : ''}"${dd ? ' role="group" aria-label="Choose the wrong expenses"' : ''}>${items.map(line).join('')}</div>${note}</section>`;
}

// 한도를 넘어 비서가 물은 청구서: 이대로 받거나, 맞지 않는 지출을 골라 이의를 낸다
function invoiceSheet() {
  const inv = byId('invoices', state.ref);
  if (!inv) return notFound('Invoice');
  const dd = state.disputeDraft;
  const answering = inv.status === 'asked' && inv.to === state.data.me.uid;
  const form = dd ? disputeForm(inv, dd) : '';
  // 받기 전에 무엇이 들었는지 보이게 지출별 내 몫을 붙인다. 이의를 쓰는 동안에는 이 목록에서 바로 고른다
  const lines = invoiceLinesHtml(inv, answering ? dd : null, state.linesMotion);
  return {
    title: 'Invoice',
    html: `<div class="big"><div class="amt">${won(Math.max(0, -inv.net))}</div>
        <p class="sub">I paid ${won(inv.paid)} · my share ${won(inv.owed)}</p>
        ${inv.hasLocationSummary ? `<p class="badges">${chip('Location summary · unverified')}</p>` : ''}</div>
      <p class="how">${esc(inv.reasons.join(' · '))}</p>
      ${lines}
      ${answering && !dd ? `${formError()}<div style="display:grid;gap:8px"><button class="btn" data-action="answer-invoice" data-decision="accept">Accept as is</button>
        <button class="btn secondary" data-action="start-dispute">An expense is wrong</button></div>` : ''}
      ${answering ? form : `<p class="group-note">${inv.status === 'accepted' ? 'Accepted.' : inv.status === 'disputed' ? 'Disputed.' : 'This invoice was replaced because an expense changed.'}</p>`}`,
  };
}

// 중재안에 할 수 있는 것: 동의하거나, 거부해서 이의를 끝내거나, 줄별 사람을 고쳐 다시 제안한다(#62).
// 줄을 고쳤으면 보이는 배분이 중재안과 달라서 동의·거부 대신 '고친 배분으로 제안하기'와 '되돌리기'만 둔다.
// 거부는 되돌릴 수 없어서
// 한 번 누르면 까닭(선택)을 적는 칸과 확정 버튼이 열리고, 그동안 동의 버튼은 숨겨 칸이 동의에 딸린 것처럼 읽히지 않게 한다.
// 동의와는 아이콘·글자·바탕이 달라 색만 보고 고르지 않게 한다
function proposalChoices(d, exp, uid, edited) {
  const choose = disputeChoices(d, exp, uid);
  if (choose.revise && edited) {
    const other = [exp.payer, d.by].find((u) => u !== uid);
    return reviseChoicesHtml({ disputeId: d.id, other: other ? nameOf(other) : 'the other person', busy: state.busy === 'revise' });
  }
  const rd = state.rejectDraft;
  const busy = state.busy === 'reject';
  const waiting = disputeWaiting(d, exp);
  const buttons = [
    choose.agree && !rd && `<button class="btn lead" data-action="agree" data-id="${esc(d.id)}">${CHECK}Accept proposal</button>`,
    choose.reject && !rd && `<button class="btn secondary lead" data-action="reject-ask">${CROSS}Reject proposal</button>`,
  ].filter(Boolean).join('');
  return `${!choose.agree && waiting.length ? `<p class="group-note" style="margin-bottom:12px">Waiting for ${waiting.map(nameOf).map(esc).join(', ')} to accept.</p>` : ''}
    ${buttons ? `<div class="stack">${buttons}</div>` : ''}
    ${choose.reject && !rd ? '<p class="group-note">Rejecting ends this dispute, and the expense settles with the current split.</p>' : ''}
    ${choose.reject && rd ? `<section class="group"><div class="list"><label class="row field"><span class="grow">Reason (optional)</span>
        <input data-rd="reason" value="${esc(rd.reason)}" maxlength="100" placeholder="e.g. We drank together"></label></div>
        <p class="group-note">The reason is kept in the agent log, where the other person can see it. Rejecting can’t be undone.</p></section>
      <div class="stack"><button class="btn danger lead" data-action="reject" data-id="${esc(d.id)}" ${busy ? 'disabled' : ''}>${CROSS}${busy ? 'Rejecting…' : 'Reject and settle as is'}</button>
        <button class="btn plain" data-action="reject-cancel" ${busy ? 'disabled' : ''}>Cancel</button></div>` : ''}`;
}

const rowText = (title, meta = '', end = '') => `<span class="grow"><span class="title">${esc(title)}</span>${meta ? `<span class="meta" style="display:block">${esc(meta)}</span>` : ''}</span>${end}`;

// #7 정산당 한 번: 여행이 끝난 뒤 Google 지도 타임라인 파일을 한 번 고르면, 이의를 낼 때마다 그 지출 시간대를 여기 남긴 방문에서 찾는다
function locationSection() {
  const { expenses, me } = state.data;
  if (!expenses.some((e) => e.present.includes(me.uid))) return '';
  const visits = savedVisits();
  const body = state.timelineReading
    ? `<div class="list" aria-busy="true"><div class="row">${tile('pin')}${rowText('Finding this settlement period in the file…')}</div></div>`
    : visits
    ? `<div class="list"><div class="row">${tile('pin')}${rowText('Google Maps Timeline uploaded', visits.length ? `Visits in this period: ${visits.length} · searched when you dispute` : 'No history for this period')}
        <button type="button" class="text-btn" data-action="timeline-forget">Delete</button></div></div>`
    : `<div class="list"><button type="button" class="row" data-action="timeline-guide" aria-haspopup="dialog">${tile('pin')}${rowText('Upload Google Maps Timeline', 'Upload it once after the trip', CHEVRON)}</button></div>`;
  return `<section class="group"><h2 class="group-label"><span>My location history</span><span>Optional</span></h2>${body}
    ${state.timelineError ? `<p class="form-error" role="alert">${esc(state.timelineError)}</p>` : ''}
    <p class="group-note">The file is read only on this device. Only visit times for this period stay in this browser, for ${TIMELINE_DAYS} days. In a dispute, only the line you turn on reaches the other person.</p></section>`;
}

// 이의 쓰기(#7). 타임라인을 올리면 결제 전에 자리를 떠난 지출을 골라 두고 '맞지 않는 점'을 채운다(public/timeline.js의 findMismatches).
// 골라 둔 지출은 눌러서 빼고, 다른 지출은 눌러서 더한다. 맞지 않는 점은 고치거나 비워도 된다(서버가 기본 문구로 채운다).
// 타임라인은 이의에 쓰려고 올린 것이라 따로 묻지 않고, 보낼 때 찾은 지출에 위치 요약(떠난 시각 한 줄)을 함께 붙인다.
// dd: { picks: { [지출 id]: 맞지 않는 점 }, found: { [지출 id]: { result, summary, claim } } | null, scan: null | 'reading' | { error } }
function disputeForm(inv, dd) {
  const picked = disputable(inv).filter((e) => e.id in dd.picks);
  const foundCount = dd.found ? Object.keys(dd.found).length : 0;
  const scan = dd.scan === 'reading'
    ? `<div class="list" aria-busy="true"><div class="row">${tile('pin')}${rowText('Searching the timeline…')}</div></div>`
    : dd.found
    ? `<div class="list"><div class="row">${tile('pin')}${rowText(foundCount ? `Selected expenses you left early: ${foundCount}` : 'No expense conflicts with your timeline', foundCount ? 'If one is wrong, tap it above to remove' : 'Choose the wrong expenses above yourself')}
        <button type="button" class="text-btn" data-action="timeline-pick">Choose another file</button></div></div>`
    : `<div class="list"><button type="button" class="row" data-action="timeline-guide" aria-haspopup="dialog">${tile('pin')}${rowText('Upload Google Maps Timeline', 'Finds expenses you left early and selects them', CHEVRON)}</button></div>`;
  const sample = authOptions().dev && dd.scan !== 'reading' ? '<div class="group-actions"><button type="button" class="text-btn" data-action="timeline-sample">Fake history (dev)</button></div>' : '';
  return `<section class="group"><h3 class="group-label"><span>Find with location history</span><span>Optional</span></h3>${scan}
      ${dd.scan?.error ? `<p class="form-error" role="alert">${esc(dd.scan.error)}</p>` : ''}${sample}</section>
    ${formError()}
    <div class="stack"><button class="btn" id="dispute-send" data-action="answer-invoice" data-decision="dispute" ${picked.length ? '' : 'disabled'}>${picked.length > 1 ? `Send disputes (${picked.length})` : 'Send dispute'}</button>
      <button type="button" class="btn plain" data-action="cancel-dispute">Cancel</button></div>`;
}

// 타임라인 방문에서 이 청구서의 맞지 않는 지출을 찾아 골라 둔다. 사람이 이미 고르거나 고쳐 쓴 지출은 그대로 둔다
function scanDispute(visits) {
  const dd = state.disputeDraft;
  const inv = byId('invoices', state.ref);
  if (!dd || !inv) return;
  const found = findMismatches(visits, disputable(inv));
  dd.found = Object.fromEntries(found.map((f) => [f.expenseId, f]));
  for (const f of found) if (!(f.expenseId in dd.picks)) dd.picks[f.expenseId] = f.claim;
}

// 타임라인 올리기 안내(#7). 처음 올릴 때는 바로 파일을 고르게 하지 않고, 이 기기에 맞는 내보내기 단계와
// 'Google 지도 열기'·'내보낸 파일 고르기'를 보여 준다. 컴퓨터에는 타임라인이 없어서 지도 링크 없이 파일만 고른다
const deviceOs = guessOs(navigator.userAgent, navigator.maxTouchPoints);
let guideOs = deviceOs === 'android' ? 'android' : 'ios';
function renderGuide() {
  const body = $('#guide-body');
  body.innerHTML = guideHtml({ os: guideOs, phone: deviceOs !== 'computer', sample: authOptions().demo });
  mountSegs(body);
}

// 파일 고르기. 문서에 붙인 입력은 다시 그릴 때 사라지므로 고를 때마다 만든다
function pickTimeline() {
  const input = Object.assign(document.createElement('input'), { type: 'file', accept: '.json,application/json', hidden: true });
  input.addEventListener('change', () => {
    if (input.files?.[0]) readTimeline(input.files[0]);
    input.remove();
  });
  document.body.append(input);
  input.click();
}

// 파일은 여기서만 읽는다. 이 정산 지출 시간대의 방문만 남기고, 이의를 쓰는 중이면 맞지 않는 지출을 바로 찾아 골라 둔다
async function readTimeline(file) {
  const dd = state.disputeDraft;
  const redraw = () => { render(); if (dd) renderSheet(); };
  state.timelineReading = true;
  state.timelineError = '';
  if (dd) dd.scan = 'reading';
  redraw();
  try {
    const mine = state.data.expenses.filter((e) => e.present.includes(state.data.me.uid));
    const visits = keepForSettlement(readVisits(JSON.parse(await file.text())), mine);
    saveVisits(visits);
    if (dd && state.disputeDraft === dd) {
      scanDispute(visits);
      dd.scan = null;
    }
  } catch (e) {
    const message = e instanceof SyntaxError ? 'That isn’t a JSON file. Choose the timeline file exported from Google Maps on your phone.' : e.message;
    if (dd) dd.scan = { error: message };
    else state.timelineError = message;
  }
  state.timelineReading = false;
  redraw();
}

// 개발용·체험 데모용: 고른 지출에 맞춘 가짜 타임라인. 첫 주문 20분 전부터 머물다 첫 주문과 결제 사이 3분의 1쯤에 떠나
// 13분 뒤 다른 곳에 도착한다(데모의 2차 바는 22:30 첫 주문, 23:40 결제라 22:55쯤 떠나고 23:10 주문은 빠진다)
function sampleTimeline(exp) {
  const { from, until } = expenseWindow(exp);
  const iso = (ms) => new Date(ms + 9 * 3600_000).toISOString().replace('Z', '+09:00');
  const left = from + Math.round((until - from) * 0.36);
  const visit = (start, end) => ({ startTime: iso(start), endTime: iso(end), visit: { hierarchyLevel: 0, probability: 0.9, topCandidate: { semanticType: 'UNKNOWN' } } });
  return { semanticSegments: [visit(from - 20 * 60_000, left), visit(left + 13 * 60_000, left + 8 * 3600_000)] };
}

// 이의와 중재안. 중재안은 줄마다 누구 몫인지와 사람별 몫이 어떻게 바뀌는지 보여 준다
function disputeSheet() {
  const d = byId('disputes', state.ref);
  const exp = d && byId('expenses', d.expenseId);
  if (!exp) return notFound('Dispute');
  const { room, me } = state.data;
  const party = [exp.payer, d.by].includes(me.uid);
  // 이의를 낸 사람이 붙인 타임라인 요약은 본인이 언제든 지울 수 있다(동의 철회). 지우면 미확정 중재안은 다시 열린 이의가 된다
  const mine = d.by === me.uid && d.evidence.some((e) => e.locationId);
  const evidence = d.evidence.length
    ? `<div class="list">${d.evidence.map((e) => `<div class="row"><span class="grow">${esc(e.summary)}</span>${e.time ? chip(e.time) : ''}</div>`).join('')}</div>
      ${mine ? '<div class="actions" style="margin-top:8px"><button type="button" class="text-btn" data-action="revoke-location">Delete my location summary</button></div>' : ''}` : '';
  let body = '';
  if (d.status === 'superseded') {
    body = `<p class="group-note">${esc(disputeNote(d, exp, nameOf))}</p>`;
  } else if (d.status === 'open' && !exp.items?.length) {
    // 영수증 줄이 없으면 중재 비서가 줄마다 나눌 수 없다. 막다른 '중재 맡기기' 대신 낸 사람이 지출을 고치는 길을 보인다(고치면 이의가 닫힌다)
    body = exp.payer === me.uid
      ? `<p class="group-note">With no receipt lines, the mediator agent can’t split this expense. Edit who joined or the amount yourself; the dispute closes and invoices are sent again.</p>
        <button class="btn" style="width:100%" data-action="open-exp" data-id="${esc(exp.id)}">Edit expense</button>`
      : `<p class="group-note">With no receipt lines, the mediator agent can’t split this expense. It is re-split when ${esc(nameOf(exp.payer))} edits who joined or the amount.</p>`;
  } else if (d.status === 'open') {
    body = party
      ? `${formError()}<button class="btn" style="width:100%" data-action="mediate" data-id="${esc(d.id)}" ${state.busy === 'mediate' ? 'disabled' : ''}>${state.busy === 'mediate' ? 'Mediator agent is reviewing…' : 'Ask the mediator agent'}</button>`
      : '<p class="group-note">When a party asks for mediation, the proposal appears here.</p>';
  } else if (d.proposal) {
    // 당사자는 줄마다 사람 칩을 눌러 중재안을 고친다(#62). 고친 줄은 이 화면에만 두다가 '고친 배분으로 제안하기'로 보낸다.
    // 그사이 상대가 먼저 고쳐 중재안의 판(rev)이 바뀌면 내가 고른 것은 거두고, 바뀐 배분을 보게 알린다
    const choose = disputeChoices(d, exp, me.uid);
    const rev = d.proposal.rev ?? 0;
    const rd = state.reviseDraft?.id === d.id ? state.reviseDraft : null;
    const draft = choose.revise && rd?.rev === rev ? rd.lines : {};
    const edited = changedLines(d.proposal.alloc, draft).length > 0;
    const stale = choose.revise && rd && rd.rev !== rev && d.proposal.revisedBy !== me.uid && changedLines(d.proposal.alloc, rd.lines).length > 0;
    const alloc = Object.fromEntries(Object.entries(d.proposal.alloc).map(([id, a]) => [id, draft[id] ? { ...a, consumers: draft[id] } : a]));
    const now = shares(exp, room, room.policy).krwShare;
    const after = shares({ ...exp, split: 'items' }, room, room.policy, alloc).krwShare;
    // 지금 배분과 견줘 바뀐 줄을 먼저, 누가 빠지고 더해졌는지 글로 보인다. 사람별 몫은 지금·중재안·차이 세 칸(사용자 테스트 11/5)
    const lines = proposalLinesHtml(exp, d.proposal.alloc, { draft, editable: choose.revise && !state.rejectDraft && state.busy !== 'revise', nameOf, avatar, before: currentConsumers(exp) });
    const role = (u) => (u === d.by ? 'disputer' : u === exp.payer ? 'payer' : '');
    const people = sharesDiffHtml(exp.present.map((u) => ({ uid: u, now: now[u] ?? 0, after: after[u] ?? 0, role: role(u) })), { nameOf, avatar, label: edited ? 'Edited split' : 'Proposal' });
    body = `<section class="group"><h3 class="group-label"><span>Mediation proposal</span><span>${esc(allocLabel({ source: d.proposal.source }))}</span></h3>
        <p class="how">${esc(d.proposal.summary)}</p>
        ${stale ? `<p class="group-note" role="status">${esc(nameOf(d.proposal.revisedBy))} edited the proposal in the meantime, so your picks were cleared. Review the new split and pick again.</p>` : ''}
        <div class="list">${lines}</div>
        ${choose.revise && !edited && !state.rejectDraft ? '<p class="group-note">Tap names to fix a wrong line. Even a dispute left to the mediator agent can be re-proposed with your edited split.</p>' : ''}</section>
      <section class="group"><h3 class="group-label"><span>Each person’s share</span><span>${edited ? 'With edited split' : 'With proposal'}</span></h3><div class="list shares">${people}</div></section>
      ${formError()}
      ${d.status === 'resolved' ? '<p class="group-note">Both accepted, so this expense was split again.</p>'
        : disputeRejected(d) ? `<p class="group-note">${esc(disputeNote(d, exp, nameOf))}</p>${d.rejectReason ? `<p class="group-note">Reason: ${esc(d.rejectReason)}</p>` : ''}`
        : proposalChoices(d, exp, me.uid, edited)}`;
  }
  // 맨 위에는 무엇이 맞지 않는지: 누가 어느 지출의 무엇을 문제 삼았는지와 그 지출(사용자 테스트 11/5: 이의 내용을 알기 어려웠다)
  const issue = `<section class="group"><h3 class="group-label"><span>What is wrong</span><span>Dispute from ${esc(nameOf(d.by))}</span></h3>
      <div class="list"><div class="row">${avatar(d.by)}<span class="grow"><span class="title">${esc(d.claim)}</span>
        <span class="meta" style="display:block">${esc(exp.title)} · Paid by ${esc(nameOf(exp.payer))} · ${money(amountOf(exp), exp.currency)}</span></span></div></div></section>`;
  return {
    title: `Dispute: ${exp.title}`,
    html: `${issue}
      ${evidence ? `<section class="group"><h3 class="group-label"><span>Evidence</span></h3>${evidence}</section>` : ''}${body}`,
  };
}

// 중재안에 동의하거나 거부하면 시트가 닫히므로, 사용자가 돌아오는 다음 할 일 카드 바로 위에 결과를 한 줄 남긴다.
// 상대가 이어서 동의하거나 거부하면 기록을 받아 다시 그릴 때 '다시 나눴어요'·'이의가 끝났어요'로 바뀐다.
// 거부로 끝난 한 줄은 동의의 초록 체크와 달리 회색 ✕로 그려, 색을 못 봐도 구분된다
function disputeLine() {
  const d = state.disputeDone && byId('disputes', state.disputeDone);
  const exp = d && byId('expenses', d.expenseId);
  const ended = d && disputeRejected(d);
  return exp ? `<p class="done-note${ended ? ' ended' : ''}" id="dispute-note" role="status">${ended ? CROSS : CHECK}<span>${esc(disputeNote(d, exp, nameOf))}</span></p>` : '';
}

const copyRow = (label, value, key) => `<div class="row"><span class="grow"><span class="meta" style="display:block">${label}</span>
    <span class="title num" style="user-select:all">${esc(value)}</span></span>
    <button type="button" class="btn sm secondary" data-action="copy" data-text="${esc(value)}" data-key="${key}">${state.copied === key ? 'Copied' : 'Copy'}</button></div>`;

// 데스크톱 QR(#8). 토큰은 수명이 15분이라, 송금 화면을 열 때마다 서버에서 새로 받는다.
// QR에는 계좌·금액이 든 t.link를 바로 담지 않는다. 우리 서버의 짧은 수명 토큰(/api/qr/:token)을 담아,
// QR 이미지를 만들어 주는 외부 서비스는 그 토큰만 보고 실제 계좌 정보는 보지 못하게 한다.
// 체험 데모는 컴퓨터에서도 휴대폰처럼 밀어서 보내기를 보인다(데모의 QR은 휴대폰에서 열 서버가 없다)
const isComputer = () => !authOptions().demo && matchMedia(COMPUTER_QUERY).matches;
let qrTimer = 0;
let qrAsked = { id: null, at: 0 };

async function refreshQr(tid) {
  // 서버가 실패하거나 컴퓨터 시계가 어긋나 늘 '만료'로 보여도 계속 부르지 않게, 같은 송금은 30초에 한 번만 요청한다
  if (qrAsked.id === tid && Date.now() - qrAsked.at < 30_000) return;
  qrAsked = { id: tid, at: Date.now() };
  const stillOpen = () => state.sheet === 'transfer' && state.ref === tid; // 응답을 기다리는 사이 닫았거나 다른 송금으로 바꿨으면 버린다
  try {
    const { qrToken, expiresAt } = await api(`/api/rooms/${enc(roomId)}/transfers/${enc(tid)}/qr`, { method: 'POST', body: {} });
    if (!stillOpen()) return;
    state.qr = { id: tid, token: qrToken, expiresAt };
    // 화면을 오래 열어 두면 만료 1분 전에 다시 그린다. 그때 qrIsFresh가 false라 새 토큰을 받는다
    clearTimeout(qrTimer);
    qrTimer = setTimeout(() => {
      if (stillOpen()) renderSheet();
    }, Math.max(30_000, Date.parse(expiresAt) - 60_000 - Date.now()));
  } catch {
    if (!stillOpen()) return;
    state.qr = { id: tid, token: null, failed: true };
  }
  renderSheet();
}

// 부르는 쪽에서 컴퓨터이고 t.link가 있을 때만 부른다(링크가 없으면 QR로 열 토스 화면이 없고, 휴대폰은 토스가 바로 열린다)
function qrBlock(t, { sentButton = true } = {}) {
  if (!qrIsFresh(state.qr, t.id)) refreshQr(t.id);
  const qr = state.qr?.id === t.id ? state.qr : null;
  // 휴대폰 카메라가 찍을 절대 주소가 필요해서, API_BASE가 비어 있으면(로컬 개발) 지금 페이지 origin을 쓴다
  const img = qr?.token
    ? `<img src="${qrImageUrl(`${API_BASE || location.origin}/api/qr/${enc(qr.token)}`)}" width="220" height="220" alt="QR code that opens the Toss transfer screen on your phone" referrerpolicy="no-referrer">`
    : `<div class="qr-wait">${qr?.failed ? 'Could not make a QR code.<br>Copy the account number above to send.' : 'Making the QR code'}</div>`;
  // 컴퓨터에는 슬라이더가 없으니, 휴대폰으로 보내고 돌아온 사람이 여기서 바로 끝낸다.
  // 보냈어요 버튼이 이미 있는 시트(보냈나요?)에서는 sentButton: false로 QR만 붙인다
  return `<div class="qr-desktop"><p class="group-note">Scan the QR with your phone camera to open the Toss transfer screen.</p>${img}
    ${sentButton ? `<button class="btn secondary" style="width:100%;margin-top:12px" data-action="mark-sent" data-id="${esc(t.id)}">Sent</button>` : ''}</div>`;
}

// 송금: 밀어서 보내면 그 제스처 안에서 토스를 연다. 앱이 안 열리면 계좌·금액을 복사해 둔다.
// 컴퓨터에서는 토스가 열리지 않으니 슬라이더 대신 휴대폰으로 넘기는 QR만 보여 준다(sendMode)
function transferSheet() {
  const t = byId('transfers', state.ref);
  if (!t) return notFound('Transfer');
  const me = state.data.me.uid;
  const toName = nameOf(t.to);
  const account = t.fallback ? `<section class="group"><h3 class="group-label"><span>${esc(toName)}’s account</span><span>${esc(t.fallback.bank)}</span></h3>
      <div class="list">${copyRow('Account number', t.fallback.accountNo, 'acct')}${copyRow('Amount', String(t.amount), 'amt')}</div></section>` : '';
  const note = {
    fallback: 'If Toss doesn’t open, the account number is copied. Paste it into your banking app to send.',
    back: 'You’re back from the transfer app. Did you send it?',
  }[state.transferNote];
  let actions = '';
  if (t.from === me && ['scheduled', 'due'].includes(t.status)) {
    const mode = sendMode(t, { computer: isComputer() });
    actions = mode === 'qr'
      ? qrBlock(t)
      : mode === 'slider'
        ? `<div class="slider" data-commit="send" data-id="${esc(t.id)}"><span class="slider-fill"></span>
          <span class="slider-label">${t.link ? 'Slide to send with Toss' : 'Slide to copy account'}</span>
          <button type="button" class="slider-thumb" aria-label="${t.link ? 'Slide to send with Toss' : 'Slide to copy account'}. You can also press Enter">${ARROW}</button></div>
        <p class="slider-hint">${t.link ? 'If Toss doesn’t open, we copy the account number' : 'Copies the payee’s account number'}</p>`
        : `<p class="group-note">${esc(toName)}: no payout account added yet. Once it is added you can send right away.</p>`;
  } else if (t.from === me && (t.status === 'opened' || (t.status === 'sent' && t.notReceivedAt))) {
    // 받는 사람이 "아직 안 들어왔어요"라고 했으면(상태는 sent 그대로) 제목만 바꾸고 송금 내역부터 보게 한다(버튼은 같다)
    const head = t.notReceivedAt
      ? `<h3 style="margin:0 0 8px">${esc(toName)} hasn’t received it yet</h3><p class="group-note" style="padding:0;margin:0 0 10px">Check your Toss history first so you don’t send twice.</p>`
      : '<h3 style="margin:0 0 10px">Did you send it?</h3>';
    // 컴퓨터(마우스 기기)에서는 토스 링크가 열리지 않으므로 토스 다시 열기 대신 휴대폰으로 넘길 QR을 보여 준다(보냈어요 버튼은 위에 있다).
    // 너비로 판단하면 가로로 돌린 휴대폰에서 토스 다시 열기가 사라지고 자기 화면의 QR이 뜬다
    actions = `${head}<div style="display:grid;gap:8px">
      <button class="btn" data-action="mark-sent" data-id="${esc(t.id)}">Sent</button>
      ${t.link && !isComputer() ? `<button class="btn secondary" data-action="reopen-link" data-id="${esc(t.id)}">Reopen Toss</button>` : ''}
      <button class="btn plain" data-action="close-sheet">Not yet</button></div>${t.link && isComputer() ? qrBlock(t, { sentButton: false }) : ''}`;
  } else if (t.to === me && isManual(t) && ['scheduled', 'due', 'opened'].includes(t.status)) {
    actions = `<p class="group-note">${esc(nameOf(t.from))} will send when convenient. If the money has arrived, say so, and the agent won’t remind ${esc(nameOf(t.from))}.</p>
      <button class="btn" style="width:100%;margin-top:10px" data-action="confirm-receipt" data-id="${esc(t.id)}">Received</button>`;
  } else if (t.to === me && t.status === 'sent' && !t.notReceivedAt) {
    actions = `<div style="display:grid;gap:8px"><button class="btn" data-action="confirm-receipt" data-id="${esc(t.id)}">Received</button>
      <button class="btn secondary" data-action="not-received" data-id="${esc(t.id)}">Not received yet</button></div>`;
  } else if (t.to === me && t.status === 'sent') {
    // 다시 확인해 달라고 한 사이 돈이 늦게 들어왔으면 바로 끝낼 수 있게
    actions = `<p class="group-note">${esc(nameOf(t.from))} was asked to check again. If the money has arrived since, let them know.</p>
      <button class="btn" style="width:100%;margin-top:10px" data-action="confirm-receipt" data-id="${esc(t.id)}">Received</button>`;
  } else {
    actions = `<p class="group-note">${{ scheduled: !isManual(t) ? `${esc(nameOf(t.from))} will be reminded on ${whenText(t.remindAt)}.` : `${esc(nameOf(t.from))} will send when convenient.`, due: `It’s ${esc(nameOf(t.from))}’s turn to send.`, opened: `${esc(nameOf(t.from))} opened the transfer app.`, sent: t.notReceivedAt ? `${esc(toName)} hasn’t received it yet. ${esc(nameOf(t.from))} is checking.` : `${esc(nameOf(t.from))} sent it. Waiting for the payee to confirm.`, confirmed: 'Receipt confirmed. This transfer is done.', superseded: 'This transfer was replaced because an expense changed.' }[t.status] ?? ''}</p>`;
  }
  return {
    title: 'Transfer',
    html: `<div class="big"><div class="amt">${won(t.amount)}</div><p class="sub">${esc(nameOf(t.from))} → ${esc(toName)}${t.status === 'scheduled' && !isManual(t) && new Date(t.remindAt) > Date.now() ? ` · scheduled ${whenText(t.remindAt)}` : ''}</p></div>
      ${note ? `<p class="preview-note" style="margin-bottom:14px">${esc(note)}</p>` : ''}
      ${account}${formError()}${actions}`,
  };
}

function payoutSheet() {
  return {
    title: 'Payout account',
    html: `<p class="how">Your account number is shown only to people who owe you. Pending transfers to you get a Toss link right away. The account is the same in every room.</p>
      <section class="group">${payoutFieldsHtml(state.payoutDraft)}</section>${formError()}
      <button class="btn" style="width:100%" data-action="save-payout">Save</button>`,
  };
}

// 개인 비서 설정(#5). 받을 계좌는 위 payoutSheet를 그대로 쓴다
const agentPanel = createAgentPanel({
  api,
  roomId,
  summary: () => state.data?.myAgent,
  meName: () => state.data?.me.name ?? '',
  rerender: () => renderSheet(),
  openSheet: (kind) => openAgentSheet(kind),
  closeSheet: () => sheet.close(),
  reload: () => load(),
  openPayout: (payout) => openPayoutSheet(payout),
});

// 친구 초대(#4): 참여자 줄 끝 + 버튼으로 연다. 누가 참가하면 방이 다시 그려지면서 이 시트의 참여자 목록도 바로 바뀐다
const inviteSheet = () => ({
  title: 'Invite friends',
  html: inviteSheetHtml({ room: state.data.room, me: state.data.me, avatar, invite: setup.invite, copied: setup.copied, copyError: setup.copyError, canShare: !!navigator.share, expenses: state.data.expenses, armed: setup.armed, removeError: setup.removeError, demo: authOptions().demo }),
});
// 이 방에서 나가기(#55). 남은 돈이 있는지는 방 화면이 가진 지출·청구서·이의·송금으로 서버와 같은 규칙(public/leave.js)으로 본다
const leaveSheet = () => ({
  title: 'Leave this room',
  html: leaveSheetHtml({ room: state.data.room, why: leaveBlock(state.data, state.data.me.uid), busy: setup.leaving, error: setup.leaveError }),
});
const AGENT_SHEETS = { invoice: invoiceSheet, dispute: disputeSheet, transfer: transferSheet, payout: payoutSheet, invite: inviteSheet, leave: leaveSheet, ...agentPanel.sheets };

// 방의 할 일에서 열면 비어 있고, 내 비서 설정에서 열면 저장된 은행·예금주를 채운다. 계좌번호는 끝 4자리만 알아서 새로 입력한다
function openPayoutSheet(saved = null) {
  state.payoutDraft = payoutDraftFrom(saved, state.data.me.name);
  state.payoutFromAgent = Boolean(saved) || state.sheet === 'agent';
  openAgentSheet('payout');
}

function openAgentSheet(kind, ref = null) {
  state.sheet = kind;
  state.ref = ref;
  state.formError = '';
  if (sheet.visible) renderSheet();
  else sheet.open(renderSheet);
}

function copyText(text, key) {
  const done = (ok) => {
    state.copied = ok ? key : null;
    if (!ok) state.formError = 'Could not copy. Long-press the number to copy it.';
    renderSheet();
    if (ok) setTimeout(() => { if (state.copied === key) { state.copied = null; renderSheet(); } }, 1500);
  };
  if (!navigator.clipboard) return done(false);
  navigator.clipboard.writeText(text).then(() => done(true), () => done(false));
}

// 밀어서 보내기를 놓는 그 순간(사용자 제스처 안)에 부른다. 서버를 기다리지 않고 바로 송금 앱을 연다
function sendGesture(tid) {
  const t = byId('transfers', tid);
  if (!t) return;
  if (t.fallback) navigator.clipboard?.writeText(t.fallback.accountNo).catch(() => {});
  api(`/api/rooms/${enc(roomId)}/transfers/${enc(tid)}/approve`, { method: 'POST', body: {}, keepalive: true }).catch(() => {});
  state.pendingSend = { id: tid, left: false };
  if (t.link) location.href = t.link;
  // 2초 안에 페이지가 가려지지 않으면(앱 없음·데스크톱, 또는 iPhone이 'Open in "Toss"?'를 묻는 중) 복사 안내를 띄운다.
  // 실패로 단정하지 않아서, 나중에 토스로 넘어갔다 돌아오면 '보냈나요?'로 바뀐다(sendFollowUp)
  setTimeout(() => { if (state.pendingSend?.id === tid) followUp('timeout'); }, 2000);
}
function followUp(event) {
  const id = state.pendingSend?.id;
  const { pending, note } = sendFollowUp(state.pendingSend, event);
  state.pendingSend = pending;
  if (!note) return;
  state.transferNote = note;
  openAgentSheet('transfer', id);
  load();
}
document.addEventListener('visibilitychange', () => followUp(document.hidden ? 'hidden' : 'visible'));

const AGENT_ACTIONS = new Set(['send-invoices', 'open-invoice', 'start-dispute', 'cancel-dispute', 'dispute-toggle', 'dispute-no-lines', 'timeline-pick', 'timeline-guide', 'tl-os', 'timeline-file', 'close-guide', 'timeline-forget', 'timeline-sample', 'revoke-location', 'answer-invoice', 'open-dispute', 'mediate', 'agree', 'reject-ask', 'reject-cancel', 'reject', 'revise-pick', 'revise-reset', 'revise-send', 'open-transfer', 'reopen-link', 'mark-sent', 'confirm-receipt', 'not-received', 'open-payout', 'save-payout', 'copy']);


async function agentAct(name, d) {
  const base = `/api/rooms/${enc(roomId)}`;
  const post = async (path, body = {}) => {
    try {
      await api(base + path, { method: 'POST', body });
      state.formError = '';
      return true;
    } catch (e) {
      state.formError = e.message;
      return false;
    } finally {
      await load();
      if (state.sheet) renderSheet();
    }
  };
  if (name === 'reopen-link') {
    // 클릭 처리기 안에서 바로 연다(기다리면 브라우저가 막는다)
    const t = byId('transfers', d.id);
    if (t?.fallback) navigator.clipboard?.writeText(t.fallback.accountNo).catch(() => {});
    if (t?.link) location.href = t.link;
  } else if (name === 'send-invoices') {
    const blocked = () => flaggedLines(state.data.expenses, isFlagged).length > 0;
    // 확인이 필요한 줄이 남았으면 서버도 409로 막는다. 같은 기준으로 먼저 알아 기다림 없이 그 자리에서 알린다.
    // 그 사이 다른 사람이 줄을 만들어 서버가 먼저 막았어도 post가 방을 다시 불러온 뒤라 같은 안내로 이어진다
    if (!blocked()) {
      state.busy = 'send';
      state.formError = '';
      render();
      await post('/invoices/send');
      state.busy = null;
    }
    state.sendBlocked = blocked();
    state.announceBlocked = state.sendBlocked;
    if (state.sendBlocked) state.formError = ''; // 서버의 409 문구는 안내가 대신한다
    render();
    state.announceBlocked = false;
    if (state.sendBlocked) alertBlocked();
  } else if (name === 'open-invoice') {
    state.disputeDraft = null;
    openAgentSheet('invoice', d.id);
  } else if (name === 'start-dispute') {
    state.disputeDraft = { picks: {}, found: null, scan: null };
    state.noLinesHint = null;
    const visits = savedVisits(); // 이 정산에 이미 올려 둔 타임라인이 있으면 바로 찾아 골라 둔다
    if (visits) scanDispute(visits);
    // 내 몫 목록이 그 자리에서 고르는 목록이 된다. 동그라미가 들어오는 것이 보이게 목록을 시트 위로 올리고,
    // 키보드로 눌렀으면 첫 줄에 초점을 둔다(손가락·마우스로 눌렀을 때 초점 테두리가 남지 않게)
    const keyboard = document.activeElement?.matches?.(':focus-visible');
    state.linesMotion = reduceMotion.matches ? '' : 'enter';
    renderSheet();
    state.linesMotion = '';
    $('#invoice-lines')?.scrollIntoView({ block: 'start', behavior: reduceMotion.matches ? 'auto' : 'smooth' });
    if (keyboard) $('#invoice-lines .pickable')?.focus({ preventScroll: true });
  } else if (name === 'cancel-dispute') {
    // 그만두면 동그라미가 들어온 길로 나간 뒤 원래 청구서로 돌아간다. 고른 것은 버린다
    state.disputeDraft = null;
    const list = $('#invoice-lines .lines');
    if (!list || reduceMotion.matches) return renderSheet();
    list.classList.add('leave');
    setTimeout(renderSheet, LEAVE_MS);
  } else if (name === 'dispute-no-lines') {
    // 줄 없는 지출은 고르지 않는다. 누른 줄을 흔들어 어느 줄인지 알리고, 바로 아래에 까닭 한 줄과 '지출 고치기'를 잠깐 편다.
    // 같은 줄을 다시 누르면 한 줄은 그대로 두고 흔들기와 시간만 새로 한다
    if (!state.disputeDraft) return;
    const again = state.noLinesHint === d.id && Boolean($('#sheet-body .lines-hint'));
    state.noLinesHint = d.id;
    if (!again) renderSheet();
    const row = $(`[data-action="dispute-no-lines"][data-id="${CSS.escape(d.id)}"]`);
    row?.focus({ preventScroll: true });
    if (row) nudge(row);
    if (!again) openHint();
    clearTimeout(hintTimer);
    hintTimer = setTimeout(hideHint, HINT_MS);
  } else if (name === 'dispute-toggle') {
    // 누를 때마다 고르고 뺀다. 다시 고르면 타임라인에서 찾은 글을 다시 채운다. 다시 그린 뒤에도 그 줄에 초점을 둔다
    const dd = state.disputeDraft;
    if (!dd) return; // 그만두기로 동그라미가 나가는 중
    state.noLinesHint = null;
    if (d.id in dd.picks) delete dd.picks[d.id];
    else dd.picks[d.id] = dd.found?.[d.id]?.claim ?? '';
    state.justPicked = d.id in dd.picks ? d.id : null; // 방금 고른 줄의 체크만 한 번 튀어 오른다
    renderSheet();
    state.justPicked = null;
    $(`[data-action="dispute-toggle"][data-id="${CSS.escape(d.id)}"]`)?.focus({ preventScroll: true });
  } else if (name === 'timeline-pick') {
    pickTimeline();
  } else if (name === 'timeline-guide') {
    guide.open(renderGuide);
  } else if (name === 'tl-os') {
    guideOs = d.id;
    renderGuide();
  } else if (name === 'timeline-file') {
    pickTimeline(); // 파일 선택 창은 이 누름 안에서 바로 열어야 한다. 안내는 그 뒤에 내린다
    guide.close();
  } else if (name === 'close-guide') {
    guide.close();
  } else if (name === 'timeline-forget') {
    forgetVisits();
    render();
  } else if (name === 'timeline-sample') {
    // 개발용·체험 데모용 가짜 기록: 주문 시각이 적힌 지출(없으면 첫 지출)에서 결제 전에 떠난 타임라인을 파일을 고른 것처럼 읽는다
    guide.close();
    const mine = state.data.expenses.filter((e) => e.present.includes(state.data.me.uid));
    const exp = mine.find((e) => e.items?.some((it) => it.time)) ?? mine[0];
    if (exp) await readTimeline(new File([JSON.stringify(sampleTimeline(exp))], 'sample-timeline.json', { type: 'application/json' }));
  } else if (name === 'revoke-location') {
    await post('/location/revoke');
  } else if (name === 'answer-invoice') {
    const dd = state.disputeDraft;
    let body = { decision: 'accept' };
    if (d.decision === 'dispute') {
      const ids = disputable(byId('invoices', state.ref)).map((e) => e.id).filter((id) => id in dd.picks);
      if (!ids.length) return;
      // 타임라인으로 찾은 지출에는 위치 요약을 먼저 붙인다. 그러면 이의에 근거로 함께 들어간다. 이미 붙어 있으면(409) 그것을 쓴다
      for (const id of ids.filter((i) => dd.found?.[i])) {
        try {
          await api(`/api/rooms/${enc(roomId)}/location/timeline`, { method: 'POST', body: { agree: true, expenseId: id, ...dd.found[id].result } });
        } catch (e) {
          if (e.status === 409) continue;
          state.formError = e.message;
          return renderSheet();
        }
      }
      body = { decision: 'dispute', disputes: ids.map((id) => ({ expenseId: id, claim: dd.picks[id] })) };
    }
    if (await post(`/invoices/${enc(state.ref)}/answer`, body)) {
      state.disputeDraft = null;
      sheet.close();
    }
  } else if (name === 'open-dispute') {
    state.rejectDraft = null;
    state.reviseDraft = null;
    openAgentSheet('dispute', d.id);
  } else if (name === 'mediate') {
    state.busy = 'mediate';
    renderSheet();
    await post(`/disputes/${enc(d.id)}/mediate`);
    state.busy = null;
    renderSheet();
  } else if (name === 'agree') {
    // 동의하면 시트를 닫고 결과는 방 화면에 한 줄로 남긴다. 실패(409 등)하면 시트를 그대로 두고 까닭을 보여 준다.
    // 보고 있던 중재안의 판을 함께 보내, 그사이 상대가 고친 배분에 모르고 동의하지 않게 한다(#62)
    if (await post(`/disputes/${enc(d.id)}/agree`, { rev: byId('disputes', d.id)?.proposal?.rev ?? 0 })) {
      state.disputeDone = d.id;
      sheet.close();
      render();
      $('#dispute-note')?.scrollIntoView({ block: 'nearest' });
    }
  } else if (name === 'revise-pick') {
    // 지출 시트의 줄 고르기(pick)와 같다: 누를 때마다 넣고 빼되, 줄마다 한 명은 남는다. 고르기 시작한 판(rev)을 함께 기억한다
    const dsp = byId('disputes', state.ref);
    const exp = dsp && byId('expenses', dsp.expenseId);
    if (!exp || dsp.status !== 'proposed') return;
    const rev = dsp.proposal.rev ?? 0;
    if (state.reviseDraft?.id !== dsp.id || state.reviseDraft.rev !== rev) state.reviseDraft = { id: dsp.id, rev, lines: {} };
    const lines = state.reviseDraft.lines;
    const set = new Set(lines[d.line] ?? dsp.proposal.alloc[d.line]?.consumers ?? []);
    if (set.has(d.p)) set.delete(d.p); else set.add(d.p);
    if (set.size) lines[d.line] = exp.present.filter((u) => set.has(u));
    state.formError = '';
    renderSheet();
    $(`[data-action="revise-pick"][data-line="${CSS.escape(d.line)}"][data-p="${CSS.escape(d.p)}"]`)?.focus({ preventScroll: true });
  } else if (name === 'revise-reset') {
    state.reviseDraft = null;
    state.formError = '';
    renderSheet();
  } else if (name === 'revise-send') {
    // 고친 배분으로 다시 제안하면 내가 동의한 것이 되어 시트를 닫고, 결과는 동의처럼 방 화면에 한 줄로 남긴다
    const dsp = byId('disputes', d.id);
    const exp = dsp && byId('expenses', dsp.expenseId);
    const draft = state.reviseDraft;
    if (state.busy === 'revise' || !exp || draft?.id !== d.id) return;
    const alloc = Object.fromEntries(exp.items.map((it) => [it.id, draft.lines[it.id] ?? dsp.proposal.alloc[it.id]?.consumers ?? []]));
    state.busy = 'revise';
    renderSheet();
    const ok = await post(`/disputes/${enc(d.id)}/revise`, { alloc, rev: draft.rev });
    state.busy = null;
    if (ok) {
      state.reviseDraft = null;
      state.disputeDone = d.id;
      sheet.close();
      render();
      $('#dispute-note')?.scrollIntoView({ block: 'nearest' });
    } else {
      renderSheet();
    }
  } else if (name === 'reject-ask') {
    state.rejectDraft = { reason: '' };
    state.formError = '';
    renderSheet();
  } else if (name === 'reject-cancel') {
    state.rejectDraft = null;
    state.formError = '';
    renderSheet();
  } else if (name === 'reject') {
    // 거부하면 이의가 끝나므로 동의처럼 시트를 닫고 결과를 방 화면에 한 줄로 남긴다. 실패(409 등)하면 시트를 그대로 두고 까닭을 보여 준다
    if (state.busy === 'reject') return;
    state.busy = 'reject';
    renderSheet();
    const ok = await post(`/disputes/${enc(d.id)}/reject`, { reason: state.rejectDraft?.reason ?? '' });
    state.busy = null;
    if (ok) {
      state.rejectDraft = null;
      state.disputeDone = d.id;
      sheet.close();
      render();
      $('#dispute-note')?.scrollIntoView({ block: 'nearest' });
    } else {
      renderSheet();
    }
  } else if (name === 'open-transfer') {
    state.transferNote = null;
    openAgentSheet('transfer', d.id);
  } else if (name === 'mark-sent') {
    state.transferNote = null;
    state.pendingSend = null;
    await post(`/transfers/${enc(d.id)}/sent`);
  } else if (name === 'confirm-receipt') {
    await post(`/transfers/${enc(d.id)}/confirm`);
  } else if (name === 'not-received') {
    await post(`/transfers/${enc(d.id)}/not-received`);
  } else if (name === 'open-payout') {
    openPayoutSheet();
  } else if (name === 'save-payout') {
    if (await post('/payout', state.payoutDraft)) {
      if (state.payoutFromAgent) agentPanel.open(); // 내 비서 설정에서 왔으면 설정으로 돌아간다
      else sheet.close();
    }
  } else if (name === 'copy') {
    copyText(d.text, d.key);
  }
}

function render() {
  const main = $('#main');
  if (!state.data) renderChannel();
  if (inviteToken) {
    main.innerHTML = joinHtml(setup.invitePreview, setup.join, { ...setup, dev: authOptions().dev });
    return;
  }
  if (!roomId || state.error?.status === 'seed') {
    main.innerHTML = noRoom();
    mountSegs(main); // 쓴 돈의 통화(원화만·외화도) 분할 버튼
    return;
  }
  if (state.error?.status === 404) {
    if (!authOptions().dev) { main.innerHTML = '<section class="hero"><h1>Room not found</h1><a href="account.html">My rooms</a></section>'; return; }
    main.innerHTML = `<section class="hero"><h1>Room not found</h1>
      <p class="sub">Restarting the server clears rooms held in memory. Create the development demo room again.</p></section>
      <section class="next"><div class="actions"><button class="btn" data-action="seed">Create demo room</button></div></section>`;
    return;
  }
  // 실제 방(배포, 또는 개발용 서버에서 만든 방)을 열지 못했을 때. 어디로 나갈지 함께 보여 준다
  if (!state.data && (!authOptions().dev || !isDemoRoom())) {
    const notMember = state.error?.status === 403;
    const title = !state.error ? 'Opening the room…' : notMember ? 'You’re not a member of this room' : 'Can’t open this room';
    const sub = !state.error ? '' : notMember ? 'Get an invite link from a friend in the room to join.' : state.error.message || 'Check your connection';
    main.innerHTML = `<section class="hero"><h1>${title}</h1>${sub ? `<p class="sub">${esc(sub)}</p>` : ''}</section>
      ${state.error ? '<section class="next"><div class="actions"><a class="btn" href="account.html">My rooms</a><a class="btn plain" href="room.html">New room</a></div></section>' : ''}`;
    return;
  }
  if (!state.data) {
    // 아직 누구인지 모르거나(401) 이 방 멤버가 아니면(403) 방 정보 없이 멤버 목록도 모른다.
    // 개발용 시드 방의 uid로 고르게 한다.
    const seedMembers = [['me', 'Me'], ['cs', 'Chulsoo'], ['yh', 'Younghee'], ['ms', 'Minsu']];
    main.innerHTML = `<section class="hero"><h1>View as</h1>
      <p class="sub">Pick a member of the development demo room. With a real account you join only as yourself.</p></section>
      <section class="group"><div class="list">${seedMembers.map(([uid, name]) => `<button class="row" data-action="who" data-id="${uid}">
        ${avatarHtml(name[0], '#8e8e93')}<span class="grow">${name}</span></button>`).join('')}</div></section>`;
    return;
  }
  $('#nav-title').textContent = state.data.room.name;
  $('#nav-add').hidden = state.data.room.status === 'done';
  logPop.show(true);
  logPop.update(state.events); // 할 일이 바뀌었을 수 있다
  meMenu.update();
  const roomSetup = setupHtml({ room: state.data.room, me: state.data.me, avatar, policyEdit: setup.policyEdit, policyOpen: setup.policyOpen, error: setup.error });
  main.innerHTML = [hero(), whoPicker(), agentPanel.nudgeHtml(), disputeLine(), nextCard(), roomSetup, disputesSection(), expensesSection(), transfersSection(), locationSection()].join('');
  mountSegs(main);
  // 이의·청구서 시트는 글을 쓰는 중이면 다시 그리지 않는다(타이핑 중 초점을 잃지 않게)
  if (['exp', 'transfer', 'invite', 'leave'].includes(state.sheet) || (state.sheet === 'dispute' && !state.rejectDraft) || (state.sheet === 'invoice' && !state.disputeDraft)) renderSheet();
}

// ---------------------------------------------------------------- 이벤트
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (meMenu.isOpen && !e.target.closest('#me-menu-wrap')) meMenu.close(false); // 메뉴 밖을 누르면 닫는다
  if (!el || el.disabled) return;
  if (el.dataset.action === 'toggle-me-menu') return meMenu.toggle();
  if (meMenu.isOpen) meMenu.close(false); // 메뉴 안의 항목(내 비서)은 메뉴를 닫고 진행한다
  if (el.dataset.action === 'toggle-log') return logPop.toggle();
  if (el.dataset.action === 'close-log') return logPop.close();
  if (logPop.isOpen) logPop.close(false); // 기록 패널 안의 버튼(확인하기)은 패널을 닫고 진행한다
  act(el.dataset.action, el.dataset);
});
document.addEventListener('keydown', (e) => {
  agentPanel.onKeydown(e);
  if (rangeKeys(e)) return;
  if (e.key === 'Escape') {
    if (meMenu.isOpen) meMenu.close();
    else if (logPop.isOpen) logPop.close();
    else if (!$('#photo-modal').hidden) closePhoto();
    else if (setup.picker.open && !roomId) rangeAct('range-toggle', {});
    else if (guide.visible) guide.close(); // 겹친 안내부터 내린다
    else sheet.close();
  }
  else if (e.key === 'Enter' && e.target.dataset?.rd !== undefined && !e.isComposing) act('reject', { id: state.ref }); // 한글 조합 중의 Enter는 글자를 확정하는 키라 제외
  else segArrowKeys(e, (btn) => act(btn.dataset.action, btn.dataset));
});
// 입력칸은 다시 그리지 않고 값만 기억한다(타이핑 중 초점을 잃지 않게)
document.addEventListener('input', (e) => {
  if (e.target.dataset?.cf) setup.create[e.target.dataset.cf] = e.target.value;
  if (e.target.dataset?.cf === 'name' && setup.create.preset) { setup.create.preset = false; delete e.target.dataset.selectAll; } // 고쳐 적은 이름은 다시 누를 때 통째로 고르지 않는다
  if (e.target.dataset?.claim !== undefined && state.disputeDraft?.picks) state.disputeDraft.picks[e.target.dataset.claim] = e.target.value;
  if (e.target.dataset?.rd !== undefined && state.rejectDraft) state.rejectDraft.reason = e.target.value;
  if (e.target.dataset?.pf && state.payoutDraft) state.payoutDraft[e.target.dataset.pf] = e.target.value;
  agentPanel.onInput(e.target);
  const f = e.target.dataset?.field;
  if (f && state.draft) state.draft[f] = e.target.value;
  const i = e.target.dataset?.item;
  if (i !== undefined && state.draft?.items) {
    const key = e.target.dataset.key;
    state.draft.items[i][key] = key === 'name' ? e.target.value : Number(String(e.target.value).replace(key === 'unit' && decimalsOf(state.draft.currency) ? /[^\d.-]/g : /[^\d-]/g, ''));
    const sum = $('#line-sum');
    if (sum) sum.textContent = `Line sum ${money(lineSum(state.draft.items), state.draft.currency)}${state.draft.total ? ` · receipt total ${money(state.draft.total, state.draft.currency)}` : ''}`;
  }
});
document.addEventListener('change', (e) => {
  if (e.target.matches?.('input[data-receipt]') && e.target.files?.[0]) readReceipt(e.target.files[0]);
});
document.addEventListener('change', (e) => {
  agentPanel.onChange(e.target);
  const f = e.target.dataset?.field;
  if (f && state.draft) state.draft[f] = e.target.value;
  // 받을 계좌의 은행 선택. '목록에 없어요'(빈 값)면 직접 쓰는 칸을 보여 주려고 다시 그린다
  if (e.target.matches?.('select[data-bank-pick]') && state.payoutDraft) {
    state.payoutDraft.other = !e.target.value;
    state.payoutDraft.bank = e.target.value;
    renderSheet();
  }
});
const sheet = createSheet($('#sheet-root'), {
  onClosed: () => {
    state.sheet = null;
    state.editing = null;
    state.focusLine = null;
    state.ref = null;
    state.disputeDraft = null;
    state.payoutFromAgent = false;
    state.rejectDraft = null;
    state.transferNote = null;
    state.pendingSend = null; // 시트를 닫으면 송금 앱에서 돌아왔는지 더는 묻지 않는다
    // QR 토큰은 버린다. 다시 열면 새로 받는다
    state.qr = null;
    clearTimeout(qrTimer);
    qrAsked = { id: null, at: 0 };
  },
});
// 안내가 올라오는 만큼 아래 시트가 작아지며 물러난다(style.css의 --behind)
const guide = createSheet($('#guide-root'), { onTravel: (p) => $('#sheet').style.setProperty('--behind', p.toFixed(3)) });
const nav = $('#nav');
addEventListener('scroll', () => nav.classList.toggle('scrolled', scrollY > 56), { passive: true });
addEventListener('resize', () => {
  resetSegs();
  mountSegs(document);
});
// 송금 시트는 그릴 때 컴퓨터인지 보고 QR이나 슬라이더 중 하나만 둔다. 연 채로 포인터가 바뀌면
// (iPad에서 키보드를 떼거나 붙일 때 등) 맞는 쪽으로 다시 그린다
matchMedia(COMPUTER_QUERY).addEventListener('change', () => {
  if (state.sheet === 'transfer') renderSheet();
});

async function loadConfig() {
  const mode = $('#mode');
  try {
    const config = await (await fetch(`${API_BASE}/api/config`, { signal: AbortSignal.timeout(8000) })).json();
    state.aiReady = config.mode === 'gemini';
    // 체험 데모는 브라우저 안에서 돌고, 사진은 샘플 영수증으로 읽는다(public/demo/server.js)
    mode.textContent = config.demo ? 'Demo' : config.mode === 'gemini' ? 'Gemini connected' : 'Rules mode';
    mode.classList.toggle('live', config.mode === 'gemini' && !config.demo);
  } catch {
    mode.textContent = 'Server offline';
  }
}

loadConfig();
document.addEventListener('focusin', (e) => {
  if (e.target.matches?.('[data-select-all]')) e.target.select(); // 초대 링크 칸은 누르면 통째로 고른다
});
try {
  await initAuth();
  if (roomId) {
    // 로그인하지 않았으면 계정 화면에서 로그인한 뒤 이 방으로 돌아온다(next)
    if (!authOptions().dev && !currentUid()) location.replace(`account.html?next=${encodeURIComponent(`room.html${location.search}`)}`);
    else {
      await load();
      if (currentUid()) watch();
      if (reopenAgent && state.data?.myAgent) agentPanel.open();
    }
  } else {
    // 방 만들기·초대 화면은 이 자리에서 로그인한다. 로그인하면 내 프로필(이름·색)을 불러와 다시 그린다
    await loadProfile();
    if (inviteToken) await loadInvite();
    else {
      // 체험 데모는 방 이름·기간을 데모 이야기대로 미리 채운다(팀 점검 11/5). 실제 방은 빈 칸에서 시작한다
      if (authOptions().demo) Object.assign(setup.create, (await import('./demo/scenario.js')).roomDraft(todayIso()));
      render();
    }
  }
  const sessionUid = currentUid();
  onSessionChange(user => {
    if (!roomId) return void loadProfile().then(render);
    if (!user || user.uid !== sessionUid) { unsubscribe(); state.data = null; state.events = []; location.replace('account.html'); }
  });
} catch (e) {
  state.error = e;
  if (pageSkeleton) { await pageSkeleton.done(); pageSkeleton = null; }
  render();
}
