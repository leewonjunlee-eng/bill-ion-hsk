// 방 만들기·참가하기·환율 정책 동의·초대 링크 화면(#4), 나가기·내보내기(#55). HTML만 만들고, 상태와 서버 호출은 room.js가 한다.
// 환율 정책은 외화로 쓴 돈을 정산하는 방에만 보이고 묻는다(#55). 원화 방에는 정책 칸·동의 버튼·안내가 없다.
import { esc, chip, avatarHtml, GOOGLE_G, ICON_LINK, ICON_COPY, ICON_SHARE, ICON_DONE, CHEVRON } from './ui.js';
import { POLICIES } from './data.js';
import { active, isForeign } from './core.js';
import { CURRENCIES, unitOf } from './currencies.js';
import { leaveBlock } from './leave.js';
import { initial } from './profile-form.js';
import { rangePickerHtml, todayIso } from './date-range.js';

export const policyOf = (id) => POLICIES.find((p) => p.id === id) ?? POLICIES[0];
export const notAgreed = (room) => (isForeign(room) ? room.members.filter((m) => active(m) && !(room.policyAgreedBy ?? []).includes(m.uid)) : []);
// 청구서를 한 번이라도 보낸 방(정산 중·완료). 초대·정책 변경을 막는다
export const hasStarted = (room) => room.status === 'settling' || room.status === 'done';
export const inviteUrl = (token) => `${location.origin}${location.pathname}?invite=${encodeURIComponent(token)}`;
const until = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'Asia/Seoul' });
const errorHtml = (msg) => (msg ? `<p class="form-error" role="alert">${esc(msg)}</p>` : '');

// 정책 고르기: 이름과 설명을 함께 보여 주는 목록. action은 누르면 부를 data-action
function policyPicker(current, action) {
  return `<div class="list" role="radiogroup" aria-label="Exchange-rate policy">${POLICIES.map((p) => `<button type="button" class="row" role="radio" aria-checked="${p.id === current}" data-action="${action}" data-id="${p.id}">
      <span class="grow"><span class="title">${esc(p.label)}</span><span class="meta" style="display:block">${esc(p.desc)}</span></span>
      ${p.id === current ? chip('Selected', 'tint') : ''}</button>`).join('')}</div>`;
}

const PRIVACY = 'https://github.com/leewonjunlee-eng/bill-ion-hsk/blob/main/PRIVACY.md';

// 방에 보일 나: 프로필 이름·색을 그대로 쓴다(입력받지 않는다). 프로필로 가는 버튼은 두지 않는다(가면 적던 내용을 잃는다)
function meRow(profile, dev) {
  if (!profile) return dev ? '<div class="row"><span class="grow meta">You join with a development identity.</span></div>' : '';
  return `<div class="row">${avatarHtml(initial(profile.name), profile.color)}<span class="grow"><span class="title">${esc(profile.name)}</span>
      <span class="meta" style="display:block">This is how room members see you. Changing your profile changes it in every room</span></span></div>`;
}

export { datesLabel } from './date-range.js';

// 로그인 전: 이 자리에서 Google로 로그인한다. 계정 화면으로 갔다 오지 않아 초대 링크를 잃지 않는다
function signInHtml(why) {
  return `<section class="group"><button class="btn google" style="width:100%" data-action="sign-in">${GOOGLE_G}<span>Continue with Google</span></button>
    <p class="group-note">${esc(why)} If this is your first time, your account is created now. <a href="${PRIVACY}" target="_blank" rel="noopener">Privacy Policy</a></p></section>`;
}

// 쓴 돈의 통화: 원화만 쓰는 모임이 기본이고, 외화도 쓰는 모임을 고를 때만 어느 외화인지와 환율 정책을 펼친다(#55).
// 정산(송금)은 어느 쪽이든 원화로 한다. 환율은 지출을 남길 때 받아 오므로 여기서는 묻지 않는다
const FX_NOTE = 'When you add an expense, that day’s European Central Bank (ECB) reference rate is fetched. If that fails, the Export-Import Bank of Korea base rate is used. The two can differ slightly in the decimals.';
function currencyHtml(d) {
  const foreign = Boolean(d.foreign);
  const seg = `<div class="seg" role="radiogroup" aria-label="Spending currency" data-seg="cf-foreign"><span class="seg-thumb"></span>
      ${[['no', 'KRW only'], ['yes', 'Foreign too']].map(([id, label]) => `<button type="button" role="radio" aria-checked="${(id === 'yes') === foreign}" data-action="cf-foreign" data-id="${id}">${label}</button>`).join('')}</div>`;
  const pick = foreign ? `<div class="list" style="margin-top:8px"><label class="row field"><span class="grow">Foreign currency</span>
      <select data-cf="fxCurrency">${CURRENCIES.map((c) => `<option value="${c.code}" ${c.code === d.fxCurrency ? 'selected' : ''}>${esc(c.label)} (${c.code})</option>`).join('')}</select></label></div>` : '';
  const head = `<section class="group"><h2 class="group-label"><span>Spending currency</span><span>Settled in KRW</span></h2>${seg}${pick}</section>`;
  if (!foreign) return head;
  return `${head}<section class="group"><h2 class="group-label"><span>Exchange-rate policy</span><span>How foreign spending becomes KRW</span></h2>
      ${policyPicker(d.policy, 'cf-policy')}
      <p class="group-note">${FX_NOTE}</p></section>`;
}

// 방이 없을 때: 방 만들기 폼. 로그인 전이면 로그인부터, 개발용 서버면 데모 방 버튼도 둔다
export function createRoomHtml(d, { busy = false, error = '', seedFailed = false, dev = false, profile = null, picker = {}, today = todayIso() } = {}) {
  const head = `<section class="hero"><h1>New room</h1>
    <p class="sub">Create a room for a trip or dinner and bring friends in with an invite link.</p></section>`;
  const seed = dev ? `<section class="next"><p class="eyebrow">Development</p><h2>Create demo room</h2>
      <p>${seedFailed ? 'The server blocked the development seed. Restart it with <code>DEV_SEED=1 npm start</code>.' : 'Creates a room with 7 expenses from the Osaka trip and agent settings for 4 people.'}</p>
      <div class="actions"><button class="btn plain" data-action="seed">Create demo room</button></div></section>` : '';
  if (!profile && !dev) return head + signInHtml('Sign in to create a room. You join under your profile name.');
  return `${head}
    <section class="group"><div class="list">
      <label class="row field"><span class="grow">Room name</span><input data-cf="name" value="${esc(d.name)}" placeholder="Osaka 3-day trip" maxlength="40"${d.preset ? ' data-select-all' : ''}></label>
      ${rangePickerHtml(d, { ...picker, today })}
      ${meRow(profile, dev)}
    </div></section>
    ${currencyHtml(d)}
    <section class="next">${errorHtml(error)}
      <div class="actions"><button class="btn" data-action="create-room" ${busy ? 'disabled' : ''}>${busy ? 'Creating…' : 'Create room'}</button><a class="btn plain" href="account.html">Cancel</a></div></section>
    ${seed}`;
}

// 초대 링크로 들어왔을 때: 방 미리보기, 정책, (로그인 뒤) 내 프로필과 참가 동의
export function joinHtml(inv, d, { busy = false, error = '', profile = null, dev = false } = {}) {
  if (inv.error) {
    return `<section class="hero"><h1>Can’t open this invite link</h1><p class="sub">${esc(inv.error)}. Ask a friend in the room for a new link.</p></section>
      <section class="next"><div class="actions"><a class="btn plain" href="account.html">My rooms</a></div></section>`;
  }
  if (!inv.room) return '<section class="hero"><h1>Opening your invite…</h1></section>';
  const { room } = inv;
  const head = `<section class="hero"><p class="eyebrow">You’re invited</p><h1>${esc(room.name)}</h1>
    <p class="sub">${esc(room.dates || '')}${room.dates ? ' · ' : ''}${room.members.map((m) => esc(m.name)).join(', ')} (${room.members.length})</p></section>`;
  if (inv.alreadyMember) {
    return `${head}<section class="next"><h2>You’re already a member of this room</h2><div class="actions"><a class="btn" href="?room=${encodeURIComponent(room.id)}">Go to room</a></div></section>`;
  }
  if (inv.settling) return `${head}<section class="next"><h2>${inv.done ? 'This room is already settled, so you can’t join' : 'This room has started settling, so you can’t join'}</h2><div class="actions"><a class="btn plain" href="account.html">My rooms</a></div></section>`;
  // 환율 정책은 외화 방에만 있다. 원화 방의 미리보기에는 policy가 오지 않는다
  const p = room.currency && room.policy ? policyOf(room.policy) : null;
  const policy = p ? `<section class="group"><h2 class="group-label"><span>Exchange-rate policy</span><span>${esc(unitOf(room.currency))} spending · agree after joining</span></h2>
      <div class="list"><div class="row"><span class="grow"><span class="title">${esc(p.label)}</span><span class="meta" style="display:block">${esc(p.desc)}</span></span></div></div></section>` : '';
  if (!profile && !dev) return head + policy + signInHtml('Sign in to join. You will come back to this screen.');
  // 동의는 체크박스로 따로 받지 않는다(iOS에는 체크박스가 없다). 무엇이 보이게 되는지 버튼 바로 위에 적고, 버튼이 곧 동의다
  return `${head}${policy}
    <section class="group"><div class="list">${meRow(profile, dev)}</div></section>
    <section class="next"><p>When you join, members see your profile name, color and the expenses you add here. Everyone’s agents settle shared spending.</p>${errorHtml(error)}
      <div class="actions"><button class="btn" data-action="join-room" ${busy ? 'disabled' : ''}>${busy ? 'Joining…' : 'Agree and join'}</button></div></section>`;
}

// 방 화면: 환율 정책. 방을 만들 때 이미 정한 정책이라, 모두 동의했으면 한 줄로 접는다(아래 setupHtml).
// 아직 동의하지 않은 사람이 있을 때만 누가 남았는지 펼친다. 안내는 경고가 아니므로 주황 상자 대신 보통 글로 쓴다
// 링크 줄 오른쪽의 원형 아이콘 버튼. 보이는 원은 작게, 누르는 자리는 44px(애플 최소 크기)로 둔다
const iconBtn = (action, label, svg, done = false) => `<button type="button" class="icon-btn${done ? ' done' : ''}" data-action="${action}" aria-label="${label}" title="${label}"><span>${svg}</span></button>`;

// 모두 동의한 정책은 끝난 일이라 한 줄로 접는다(사용자 테스트 11/5: "처음에만 보였으면", "모두 동의함 정도로").
// 줄 전체가 누르는 자리이고(더보기 버튼을 따로 두지 않는다), 펼치면 설명·동의한 사람·바꾸기가 같은 카드 안에서 열린다.
// policyOpen: 사람이 펼쳐 둔 상태(다시 그려도 지킨다). 바꾸는 중(policyEdit)에는 늘 펼쳐 둔다
export function setupHtml({ room, me, avatar, policyEdit, policyOpen = false, error }) {
  if (!isForeign(room)) return error ? `<section class="group">${errorHtml(error)}</section>` : ''; // 원화 방에는 환율 정책 칸이 없다(#55)
  const settling = hasStarted(room);
  const p = policyOf(room.policy);
  const waiting = notAgreed(room);
  const iAgreed = (room.policyAgreedBy ?? []).includes(me.uid);
  const memberRows = room.members.filter(active).map((m) => `<div class="row">${avatar(m.uid)}<span class="grow">${esc(m.name)}${m.uid === me.uid ? ' (you)' : ''}</span>
      ${(room.policyAgreedBy ?? []).includes(m.uid) ? chip('Agreed', 'ok') : chip('Not yet')}</div>`).join('');
  const change = settling ? '' : `<button class="btn plain sm" data-action="edit-policy">${policyEdit ? 'Stop changing' : 'Change'}</button>`;
  const picker = policyEdit && !settling ? `<p class="group-note">If you change it, everyone has to agree again.</p>${policyPicker(room.policy, 'set-policy')}` : '';
  if (!waiting.length) {
    const open = Boolean(policyOpen || policyEdit);
    return `<section class="group"><h2 class="group-label"><span>Rate policy · ${esc(unitOf(room.fx.currency))}</span><span>${settling ? 'Locked: settling' : ''}</span></h2>
    <div class="list"><button type="button" class="row disclosure" data-action="toggle-policy" aria-expanded="${open}" aria-controls="policy-detail"><span class="grow"><span class="title">${esc(p.label)}</span></span>${chip('All agreed', 'ok')}${CHEVRON}</button>
      <div class="collapsible${open ? ' open' : ''}" id="policy-detail"${open ? '' : ' inert'}><div class="collapsible-inner">
        <div class="row"><span class="grow"><span class="meta" style="display:block">${esc(p.desc)}</span></span>${change}</div>
        ${memberRows}</div></div></div>
    ${picker}
    ${errorHtml(error)}</section>`;
  }
  const people = `<div class="list" style="margin-top:8px">${memberRows}</div>`;
  const policy = `<section class="group"><h2 class="group-label"><span>Rate policy · ${esc(unitOf(room.fx.currency))}</span><span>${settling ? 'Locked: settling' : waiting.length ? `Not agreed yet: ${waiting.length}` : ''}</span></h2>
    <div class="list"><div class="row"><span class="grow"><span class="title">${esc(p.label)}</span><span class="meta" style="display:block">${esc(p.desc)}</span></span>${change}</div></div>
    ${people}
    ${!settling && !iAgreed ? '<div class="actions" style="margin-top:10px"><button class="btn" data-action="agree-policy">Agree to this policy</button></div>' : ''}
    ${picker}
    ${errorHtml(error)}</section>`;
  return policy;
}

// 친구 초대는 사람이 모여 있는 곳(방 제목 아래 참여자 줄)의 끝 + 버튼에서 연다. 정산 중인 방에는 두지 않는다
const PLUS = '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M7 1.5v11M1.5 7h11" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
export const inviteButtonHtml = () => `<button type="button" class="person add" data-action="open-invite" aria-label="Invite friends" title="Invite friends">${PLUS}</button>`;

// 지금 참여한 사람 한 줄. 방을 만든 사람에게는 다른 사람 줄 끝에 '내보내기'가 있다(#55, 잘못 들어온 사람).
// 그 사람이 낀 지출이 있으면 버튼 대신 까닭을 적는다(누르기 전에 막는다. 서버도 같은 규칙 public/leave.js로 막는다).
// 되돌리기 번거로운 동작이라 지출 지우기처럼 한 번 더 눌러야 내보낸다(armed)
function personRow(m, { room, me, avatar, expenses, armed, removeError }) {
  const mine = m.uid === me.uid;
  let end = '';
  let note = '';
  if (room.createdBy === me.uid && !mine) {
    if (leaveBlock({ room, expenses }, m.uid, { self: false })) note = 'Has a share in an expense, so can’t be removed';
    else end = `<button type="button" class="btn sm danger${armed === m.uid ? ' armed' : ''}" data-action="remove-member" data-id="${esc(m.uid)}">${armed === m.uid ? 'Tap again to remove' : 'Remove'}</button>`;
  }
  const error = removeError?.uid === m.uid ? `<span class="form-error" role="alert" style="display:block">${esc(removeError.message)}</span>` : '';
  return `<div class="row">${avatar(m.uid)}<span class="grow">${esc(m.name)}${mine ? ' (you)' : ''}${note ? `<span class="meta" style="display:block">${note}</span>` : ''}${error}</span>${end}</div>`;
}

// 친구 초대 시트: 링크 한 줄(복사·공유 아이콘), 친구에게 보일 초대 화면, 지금 참여한 사람(참가하면 여기에 바로 보인다).
// 링크가 아직 없으면 시트를 여는 순간 만든다(그동안 '만드는 중'). 새 링크 만들기는 이전 링크를 무효로 하는 보조 동작이라 맨 아래 글자 버튼.
// 미리보기의 환율 정책 줄은 외화 방에만 있다(#55).
// 체험 데모에는 보낼 친구가 없다. 그래서 링크를 보내지 않아도 시트를 연 순간부터 친구 셋이 들어온다고 맨 위에 알린다(팀 점검 11/5)
const HOW = 'Friends with the link see the screen below, sign in with Google and join right away. Share it in a chat or copy it.';
const DEMO_HOW = 'No need to send the link in this demo. Chulsoo, Younghee and Minsu now join on their own a few seconds apart, and their agents add what they spent. In a real room you send this link in a chat.';
export function inviteSheetHtml({ room, me, avatar, invite, copied = false, copyError = '', canShare = false, expenses = [], armed = null, removeError = null, demo = false }) {
  const p = isForeign(room) ? policyOf(room.policy) : null;
  const linkRow = invite
    ? `<div class="list"><div class="row invite-row"><span class="new-room-icon" aria-hidden="true">${ICON_LINK}</span>
        <span class="grow"><input class="invite-url" readonly value="${esc(inviteUrl(invite.token))}" aria-label="Invite link" data-select-all>
          <span class="meta" style="display:block">Opens until ${esc(until(invite.expiresAt))}</span></span>
        ${copied ? iconBtn('copy-invite', 'Copied', ICON_DONE, true) : iconBtn('copy-invite', 'Copy link', ICON_COPY)}
        ${canShare ? iconBtn('share-invite', 'Share', ICON_SHARE) : ''}</div></div>
      ${errorHtml(copyError)}<span class="sr-only" role="status">${copied ? 'Link copied' : ''}</span>`
    : '<div class="list"><div class="row invite-row" aria-busy="true"><span class="grow meta">Creating the link…</span></div></div>';
  const people = room.members.filter(active);
  return `<p class="how">${demo ? DEMO_HOW : HOW}</p>
    <section class="group">${linkRow}</section>
    <section class="group"><h3 class="group-label"><span>What your friend sees</span></h3>
      <div class="invite-preview"><p class="eyebrow">You’re invited</p><p class="invite-preview-title">${esc(room.name)}</p>
        <p class="meta">${esc(room.dates || '')}${room.dates ? ' · ' : ''}${people.map((m) => esc(m.name)).join(', ')} (${people.length})</p>
        ${p ? `<p class="meta">Rate policy: ${esc(p.label)}</p>` : ''}</div></section>
    <section class="group"><h3 class="group-label"><span>In the room: ${people.length}</span></h3>
      <div class="list">${people.map((m) => personRow(m, { room, me, avatar, expenses, armed, removeError })).join('')}
        <div class="row invite-waiting"><span class="invite-dot" aria-hidden="true"></span><span class="grow meta">Invited friends appear here as soon as they join</span></div></div></section>
    ${invite ? '<p class="group-note">Creating a new link stops the current one from opening. <button type="button" class="text-btn" data-action="make-invite">Create new link</button></p>' : ''}`;
}

// 정산이 끝난 방의 다음 할 일 카드. 끝난 방에서 남은 일은 나가기뿐이라 메뉴에 숨기지 않고 여기 둔다.
// 누르면 바로 나가지 않고 나가기 시트(무엇을 잃는지 + 확인)를 연다
export function doneCardHtml() {
  return `<section class="next done"><p class="eyebrow">Settled</p><h2>Settlement is complete</h2>
      <p>Nobody had to bring up money in the group chat. This room stays as a record; expenses can no longer be added or edited. If you’re done, you can leave, which also removes it from My rooms.</p>
      <div class="actions"><button type="button" class="btn secondary" data-action="open-leave" aria-haspopup="dialog">Leave this room</button></div></section>`;
}

// '내 계정' 메뉴의 '이 방에서 나가기' 시트(#55). 돈이 남아 있으면 나가기 버튼 대신 까닭을 보인다(누르기 전에 막는다).
// 나갈 수 있으면 무엇을 잃는지 버튼 바로 위에 적는다
export function leaveSheetHtml({ room, why, busy = false, error = '' }) {
  if (why) return `<p class="how">${esc(why)}</p>`; // 닫기는 시트 머리에 있다
  const reason = room.status === 'done' ? 'This room is settled, so you can leave.' : 'No expense here includes your share, so you can leave now.';
  return `<p class="how">${reason} After leaving you can’t see this room’s expense and transfer history, and it disappears from My rooms.${hasStarted(room) ? '' : ' You can rejoin if a friend sends the invite link again.'}</p>
    ${errorHtml(error)}
    <div class="actions"><button type="button" class="btn danger" data-action="leave-room" ${busy ? 'disabled' : ''}>${busy ? 'Leaving…' : 'Leave this room'}</button><button type="button" class="btn plain" data-action="close-sheet">Stay</button></div>`;
}
