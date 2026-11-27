// #2 내 계정. 로그인하면 '내 방'이 첫 화면이고, 오른쪽 위 내 아바타를 누르면 '내 계정'(설정) 화면으로 간다.
// 내 계정은 웹 설정 페이지처럼 모든 설정을 한 페이지에 두고(넓은 화면은 왼쪽 목차가 따라온다), 바꾼 것이 있을 때만
// 화면 아래에 저장 막대가 뜬다. 저장하지 않고 떠나려 하면(왼쪽 위 '내 방', 브라우저 뒤로, 탭 닫기) 버릴지 묻는다
import { initAuth, currentUser, login, logout, authOptions } from './auth.js';
import { api } from './room-api.js';
import { esc, avatarHtml, CHEVRON, GOOGLE_G, ICON_LINK, nextAfterLogin, backToRoom, mountSegs, segArrowKeys } from './ui.js';
import { roomTabs, roomRowsHtml } from './room-list.js';
import { leaveBlock } from './leave.js';
import { toast } from './toast.js';
import { reduceMotion } from './motion.js';
import { profileFormHtml, mountProfileForm, initial } from './profile-form.js';
import { inviteTokenFrom, joinFormHtml } from './join-link.js';
import { defaultsHtml, defaultsBody, defaultsChanges, sampleFill } from './agent-defaults.js';
import { draftFromRules, limitNote } from './agent-panel.js';
import { payoutDraftFrom } from './payout-form.js';
import { SETTINGS_IDS, tocHtml, settingRow, settingsSection } from './settings-layout.js';
import { startSkeleton, roomsSkeleton, settingsSkeleton } from './skeleton.js';
const panel = document.querySelector('#account-view'); // 화면 전체. #account는 내 계정의 '계정' 칸 주소라 쓰지 않는다
const nav = document.querySelector('#nav-inner');
// 알림은 방금 누른 버튼 바로 아래에 띄운다. 화면을 다시 그릴 때마다 #message 자리도 함께 그린다.
// 내 계정에서는 저장 막대 안이 그 자리라, 막대 모양은 두고 오류일 때 색만 바꾼다
const say = (text, error = false) => {
  const message = document.querySelector('#message');
  if (!message) return;
  message.textContent = text;
  if (message.closest('.save-bar')) message.classList.toggle('error', error);
  else message.className = error ? 'form-error' : 'group-note';
};
const MESSAGE = '<p id="message" class="group-note" role="status"></p>';
const PRIVACY = 'https://github.com/orca-svg/agent-settlement/blob/main/PRIVACY.md';

// 상단바는 왼쪽·가운데·오른쪽 세 칸이다. 빈 칸도 자리를 지켜 가운데 제목이 가운데에 오게 한다
const BRAND = '<a class="nav-brand" href="./">Bill:ION</a>';
const BACK = '<svg width="10" height="17" viewBox="0 0 10 17" aria-hidden="true"><path d="M8.5 1.5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const setNav = (left, center = '', right = '') => { nav.innerHTML = `<div>${left}</div><div class="nav-heading">${center}</div><div class="nav-end">${right}</div>`; };
// 화면마다 읽기 좋은 폭이 다르다(로그인은 좁게, 내 방은 목록 폭, 내 계정은 목차 + 설정). 상단바·본문·꼬리말이 같이 따른다
const setView = (view) => { document.body.dataset.view = view; };

// 화면의 행은 모두 눌러서 들어가는 곳이다(화살표)
const linkRow = (href, title, meta) => `<a class="row" href="${href}"><span class="grow"><span class="title">${title}</span>
  <span class="meta" style="display:block">${meta}</span></span>${CHEVRON}</a>`;
const demoRows = (label, dev) => `<section class="group"><h2 class="group-label"><span>${label}</span></h2><div class="list">
    ${linkRow('./', 'Try the demo', 'No sign-in: play “Me” and settle an Osaka trip in five tasks')}
    ${dev ? linkRow('room.html', 'Open development room', 'Test the real room screen with a seed identity') : ''}
  </div></section>`;

// 탈퇴하면 로그아웃하고 이 화면의 로그인으로 돌아와 결과를 버튼 바로 아래에 알린다
const DELETED = 'account.html?deleted=1';
let notice = new URLSearchParams(location.search).has('deleted') ? 'Your account was deleted. Amounts you settled with others remain as anonymous records.' : ''; // 화면을 옮긴 뒤 그 화면에 띄울 한 줄
if (notice) history.replaceState(null, '', location.pathname); // 새로고침해도 다시 뜨지 않게

// 내 계정의 주소: #profile(맨 위)·#agent(방의 '기본 설정 바꾸기')·#payout·#rules·#notify·#account. 목차 링크도 이 #으로 간다
const onProfile = () => SETTINGS_IDS.includes(location.hash.slice(1));
let settings = null; // 내 계정 화면이 열려 있는 동안 { pending(): 저장하지 않은 변경 수, save() }
const DISCARD = 'You have unsaved changes. Discard them and leave?';
const mayLeave = () => !settings?.pending() || confirm(DISCARD);
function openProfile() {
  history.pushState({ view: 'profile' }, '', '#profile');
  run(render);
}
// 내 방으로 돌아간다. 내 계정으로 들어올 때 쌓은 기록이면 되돌려 브라우저 뒤로와 같은 자리로 간다
function toRooms() {
  if (!mayLeave()) return;
  settings = null;
  if (history.state?.view === 'profile') history.back();
  else {
    history.replaceState(null, '', location.pathname + location.search);
    run(render);
  }
}
// 방에서 왔으면(account.html?from=…) 그 방으로 돌아간다. 내 비서 시트에서 왔으면 방이 그 시트를 다시 연다
function toRoom() {
  if (!mayLeave()) return;
  settings = null;
  location.assign(backRoom.href);
}
addEventListener('popstate', () => {
  if (settings && onProfile()) return; // 목차·#으로 같은 화면 안에서 옮긴 것: 다시 그리지 않아 쓰던 값이 남는다
  if (!mayLeave()) return void history.go(1); // 버리지 않기로 했으면 내 계정에 머문다
  settings = null;
  run(render);
});
addEventListener('beforeunload', (e) => {
  if (!settings?.pending()) return;
  e.preventDefault();
  e.returnValue = '';
});
// ⌘S(Ctrl+S): 브라우저의 '페이지 저장' 대신 내 계정을 저장한다. 저장 버튼의 툴팁이 이 단축키를 알린다
const SAVE_KEY = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘S' : 'Ctrl+S';
addEventListener('keydown', (e) => {
  if (!settings || e.key.toLowerCase() !== 's' || !(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
  e.preventDefault();
  settings.save();
});

// 목차는 지금 읽는 칸을 짚는다: 제목이 상단바 바로 아래를 지난 마지막 칸. 맨 아래까지 내렸는데 칸이 짧아
// 위로 올라오지 못하면, 목차에서 누른 칸(주소의 #)이 화면에 보이는 동안은 그 칸을 짚는다
const READ_LINE = 80;
let spyFrame = 0;
function spy() {
  spyFrame = 0;
  const links = panel.querySelectorAll('[data-toc]');
  if (!links.length) return;
  let current = SETTINGS_IDS[0];
  for (const id of SETTINGS_IDS) if ((document.getElementById(id)?.getBoundingClientRect().top ?? Infinity) <= READ_LINE) current = id;
  if (innerHeight + scrollY >= document.documentElement.scrollHeight - 4) {
    const target = onProfile() && document.getElementById(location.hash.slice(1));
    const box = target?.getBoundingClientRect();
    current = box && box.top < innerHeight && box.bottom > READ_LINE ? target.id : SETTINGS_IDS.at(-1);
  }
  links.forEach((a) => (a.dataset.toc === current ? a.setAttribute('aria-current', 'location') : a.removeAttribute('aria-current')));
}
addEventListener('scroll', () => { if (settings && !spyFrame) spyFrame = requestAnimationFrame(spy); }, { passive: true });
addEventListener('hashchange', () => { if (settings) spy(); });
// 화면 폭이 바뀌어 두 칸이 한 칸으로 쌓이면 분할 컨트롤의 선택 표시도 새 자리로 옮긴다
new ResizeObserver(() => { if (settings) mountSegs(panel); }).observe(panel);

// 방·초대 링크로 왔다가 로그인하러 온 경우 돌아갈 곳(room.html?room=… 또는 ?invite=…)
const next = nextAfterLogin(location.search);
// 방의 '기본 설정 바꾸기'·'내 계정'으로 왔을 때 돌아갈 방. 내 방 목록에 있는 방일 때만 { href, name }
const back = backToRoom(location.search);
let backRoom = null;
// 첫 화면을 불러오는 동안 같은 자리에 뼈대를 보인다(skeleton.js, 응답 시간 임계값). 첫 화면을 그리기 직전에 거둔다
let pageSkeleton = startSkeleton(panel, onProfile() ? settingsSkeleton() : roomsSkeleton());
async function settle() {
  if (!pageSkeleton) return;
  const sk = pageSkeleton;
  pageSkeleton = null;
  await sk.done();
}

async function render() {
  const config = await initAuth();
  if (!currentUser()) {
    await settle();
    // 로그인이 먼저, 둘러보기는 그 아래. 이 서버에 로그인이 연결되지 않았으면 버튼을 막고 바로 아래에서 이유를 말한다
    const ready = Boolean(config.firebase);
    setView('login');
    setNav(BRAND);
    panel.innerHTML = `<section class="hero"><h1>My account</h1><p class="sub">${next ? 'Sign in to return to the room you were viewing.' : 'Sign in to pick up your rooms and agent settings on any device.'}</p></section>
      <section class="group">
        <button class="btn google" id="login" ${ready ? '' : 'disabled'}>${GOOGLE_G}<span>Continue with Google</span></button>
        ${MESSAGE}
        <p class="group-note">${ready ? 'If this is your first time, your account is created now.' : 'Google sign-in isn’t connected on this server yet. You can try the demo without signing in.'}
          <a href="${PRIVACY}" target="_blank" rel="noopener">Privacy Policy</a></p>
      </section>${demoRows('Without signing in', config.dev)}`;
    if (ready) panel.querySelector('#login').onclick = () => run(async () => { say('Choose an account in the Google window…'); await login(); await render(); });
    say(notice);
    notice = '';
    return;
  }
  const { pending } = await api('/api/me/deletion');
  if (pending) {
    await settle();
    setView('login');
    setNav(BRAND);
    panel.innerHTML = `<section class="hero"><h1>Finish deleting</h1></section>
      <section class="group"><button class="btn" style="width:100%" id="finish-delete">Finish deleting</button>${MESSAGE}</section>`;
    say('Your personal data is deleted. Only the Google account link is left to remove.');
    panel.querySelector('button').onclick = () => run(async () => { await api('/api/me/delete', { method: 'POST' }); await logout(DELETED); });
    return;
  }
  if (next) return void location.replace(next); // 로그인했으면 보던 방·초대로 돌아간다
  const [{ profile }, { rooms }] = await Promise.all([api('/api/me'), api('/api/rooms')]);
  const from = back && rooms.find((r) => r.id === back.id);
  backRoom = from ? { href: back.href, name: from.name } : null;
  panel.onclick = panel.oninput = panel.onchange = null; // 비서 기본 설정 화면이 단 처리기를 다른 화면에 남기지 않는다
  const agent = onProfile() ? await api('/api/me/agent') : null;
  await settle();
  if (onProfile()) profileView(profile, agent);
  else roomsView(profile, rooms, config);
}

// 첫 화면: 내가 참여한 방. 새 방 만들기·초대 링크로 참가는 머리말 오른쪽에, 방은 이름 | 기간 목록으로.
// 방 줄은 링크라 새 탭으로도 열린다. 오른쪽 위 내 아바타가 내 계정으로 들어가는 문이다.
// 정산이 끝난 방이 있으면 '진행 중 | 끝남' 탭으로 나눈다(#55, room-list.js). 고른 탭은 이 화면에 있는 동안 기억한다.
// 목록 오른쪽 위 '편집'을 누르면 줄마다 '나가기'가 온다(#55). '완료'나 Esc로 끝낸다
let roomsTab = 'live';
let roomsEditing = false;
function roomsView(profile, rooms, config) {
  settings = null;
  setView('rooms');
  setNav(BRAND, '', `<button type="button" class="nav-avatar" id="open-profile" aria-label="My account · ${esc(profile.name)}">${avatarHtml(initial(profile.name), profile.color, 'lg')}</button>`);
  const view = roomTabs(rooms, roomsTab);
  roomsEditing &&= view.rooms.length > 0; // 나갈 방이 없으면 편집도 끝난다
  const list = view.rooms.length
    ? roomRowsHtml(view.rooms, { editing: roomsEditing })
    : `<div class="room-empty"><p class="title">${view.empty.title}</p><p class="meta">${view.empty.meta}</p></div>`;
  const edit = view.rooms.length ? `<button type="button" class="text-btn" id="rooms-edit" aria-pressed="${roomsEditing}">${roomsEditing ? 'Done' : 'Edit'}</button>` : '';
  panel.innerHTML = `<header class="hero page-head"><div><h1>My rooms</h1><p class="sub">${config.demo ? 'This is the demo. Look around as “Me” without signing in.' : `Signed in as ${esc(profile.name)}.`}</p></div>
      <div class="page-actions">
        <button type="button" class="btn sm plain" id="join-toggle" aria-expanded="false" aria-controls="join-link">${ICON_LINK}<span>Join with invite link</span></button>
        <a class="btn sm" href="room.html"><span aria-hidden="true">+</span><span>New room</span></a>
      </div></header>
    ${MESSAGE}
    <div class="join-panel">${joinFormHtml()}</div>
    <section class="group" id="rooms" aria-labelledby="rooms-title"><div class="group-head"><h2 class="group-label" id="rooms-title"><span>Joined rooms${rooms.length ? ` (${rooms.length})` : ''}</span></h2>${edit}</div>${view.html}${list}</section>
    ${config.demo ? '' : demoRows('Explore', config.dev)}`;
  say(notice);
  notice = '';
  nav.querySelector('#open-profile').onclick = openProfile;
  mountJoinLink(panel);
  mountSegs(panel);
  const again = (focus) => { roomsView(profile, rooms, config); panel.querySelector(focus)?.focus(); }; // 다시 그려도 초점은 누른 자리에
  const section = panel.querySelector('#rooms');
  const toggleEdit = () => { roomsEditing = !roomsEditing; again('#rooms-edit'); };
  section.querySelector('#rooms-edit')?.addEventListener('click', toggleEdit);
  section.addEventListener('keydown', (e) => { if (e.key === 'Escape' && roomsEditing) toggleEdit(); });
  section.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-leave]');
    const room = btn && rooms.find((r) => r.id === btn.dataset.leave);
    if (room) leaveFromList(btn, room, () => {
      notice = `You left “${room.name}”.`;
      const rest = rooms.filter((r) => r.id !== room.id);
      const next = view.rooms[view.rooms.indexOf(room) + 1] ?? view.rooms[view.rooms.indexOf(room) - 1];
      roomsView(profile, rest, config);
      (next && panel.querySelector(`[data-leave="${CSS.escape(next.id)}"]`) || panel.querySelector('#rooms-edit') || panel.querySelector('#join-toggle'))?.focus();
    });
  });
  const tabs = panel.querySelector('[data-seg="rooms-tab"]');
  if (!tabs) return;
  tabs.onclick = (e) => {
    const tab = e.target.closest('[data-id]')?.dataset.id;
    if (!tab || tab === view.tab) return;
    roomsTab = tab;
    again(`[data-seg="rooms-tab"] [data-id="${tab}"]`);
  };
  tabs.onkeydown = (e) => segArrowKeys(e, (btn) => btn.click());
}

// 편집 중 '나가기'(#55). 누르면 먼저 그 방에서 나갈 수 있는지 서버와 같은 규칙(public/leave.js)으로 확인해,
// 막히면 위쪽 노란 알림으로 까닭을 잠깐 보인다. 나갈 수 있으면 지우기처럼 한 번 더 눌러야 나간다.
// 끝난 방은 늘 나갈 수 있어 확인하지 않는다. 그사이 방이 바뀌어 서버가 막으면 그 까닭도 같은 알림으로 보인다
async function leaveFromList(btn, room, onLeft) {
  if (btn.getAttribute('aria-busy') === 'true') return;
  const show = (text, busy = false) => { btn.textContent = text; btn.setAttribute('aria-busy', String(busy)); };
  if (btn.classList.contains('armed')) {
    show('Leaving…', true);
    try {
      await api(`/api/rooms/${encodeURIComponent(room.id)}/leave`, { method: 'POST' });
    } catch (e) {
      btn.classList.remove('armed');
      show('Leave');
      return toast(e.message);
    }
    await collapse(btn.closest('li'));
    return onLeft();
  }
  for (const other of panel.querySelectorAll('[data-leave].armed')) { other.classList.remove('armed'); other.textContent = 'Leave'; } // 한 번에 한 방만
  if (room.status !== 'done') {
    show('Checking…', true);
    let why;
    try {
      const data = await api(`/api/rooms/${encodeURIComponent(room.id)}`);
      why = leaveBlock(data, data.me.uid);
    } catch (e) {
      why = e.message;
    }
    show('Leave');
    if (why) return toast(why);
  }
  btn.classList.add('armed');
  show('Tap again to leave');
}

// 나간 방의 줄을 접어 아래 줄이 자연스럽게 올라오게 한다. 움직임 줄이기면 바로 뺀다
function collapse(li) {
  if (!li || reduceMotion.matches || !li.animate) return Promise.resolve();
  li.style.overflow = 'hidden';
  return li.animate([{ height: `${li.offsetHeight}px`, opacity: 1 }, { height: '0px', opacity: 0 }], { duration: 260, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', fill: 'forwards' }).finished;
}

// 초대 링크로 참가하기: 버튼을 누르면 머리말 바로 아래에 입력칸을 펼치고 바로 붙여 넣게 초점을 둔다.
// 알아본 토큰으로만 이 서비스의 초대 화면에 가고, 알아볼 수 없으면 입력칸 바로 아래에 알린다
function mountJoinLink(root) {
  const toggle = root.querySelector('#join-toggle');
  const form = root.querySelector('#join-link');
  const input = form.querySelector('#join-input');
  const error = form.querySelector('#join-error');
  toggle.onclick = () => {
    const open = form.hidden;
    form.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    if (open) input.focus();
  };
  input.oninput = () => { error.textContent = ''; input.removeAttribute('aria-invalid'); };
  form.onsubmit = (e) => {
    e.preventDefault();
    const token = inviteTokenFrom(input.value);
    if (token) return void location.assign(`room.html?invite=${encodeURIComponent(token)}`);
    input.setAttribute('aria-invalid', 'true');
    error.textContent = input.value.trim() ? 'That isn’t a recognizable invite link. Paste the link your friend sent, as is.' : 'Paste the invite link you received.';
    input.focus();
  };
}

// 계정 칸의 첫 줄: 버튼 이름을 되풀이하지 않고, 지금 어느 계정으로 로그인했는지를 보이고 오른쪽 끝에 로그아웃을 둔다.
// 되돌릴 수 없는 탈퇴는 이 줄과 떨어진 카드에 따로 둔다
function accountRow(profile) {
  const email = currentUser()?.email;
  return settingRow({ action: true, label: 'Signed-in account', desc: email ? `Google account · ${esc(email)}` : `Signed in as ${esc(profile.name)}.`,
    control: '<button type="button" class="btn sm plain" id="logout">Sign out</button>' });
}

// 내 계정: 프로필(이름·색) → 내 비서 기본 설정(받을 계좌·비서 규칙·알림) → 계정을 한 페이지에.
// 바꾸는 대로 아래 저장 막대가 '저장하지 않은 변경 N개'를 세고, 저장하면 이 화면에 머문 채 결과를 그 자리에서 알린다.
// status: 방금 저장한 결과(다시 그린 뒤 막대에 잠깐 띄운다)
function profileView(profile, agent, status = '') {
  setView('settings');
  // 왼쪽 위 뒤로는 온 곳으로 간다: 방에서 왔으면 그 방 이름, 아니면 내 방(목록)
  const backLabel = backRoom ? `<span class="nav-back-label">${esc(backRoom.name)}</span>` : '<span>My rooms</span>';
  setNav(`<button type="button" class="nav-text" id="back"${backRoom ? ` aria-label="Back to ${esc(backRoom.name)}"` : ''}>${BACK}${backLabel}</button>`, 'My account');
  panel.innerHTML = `<div class="settings">${tocHtml()}<div class="settings-body">
      ${settingsSection({ id: 'profile', level: 2, title: 'Profile', desc: 'This is how room members see you. Changes apply in every room.', body: profileFormHtml(profile) })}
      <div id="agent-box"></div>
      ${settingsSection({ id: 'account', level: 2, title: 'Account', body: [accountRow(profile), settingRow({ action: true, label: 'Delete account',
        desc: 'Deletes your profile, agent settings and location summaries, and unlinks your name and account from rooms. Settled amounts remain as anonymous records, and money you owe does not go away.',
        control: '<button type="button" class="btn sm danger" id="delete">Delete account</button>' })] })}
      <div class="save-bar" id="save-bar" hidden>
        <p class="save-status" id="message" role="status"></p>
        <div class="save-actions" id="save-actions"><button type="button" class="btn sm plain" id="revert">Revert</button>
          <button type="button" class="btn sm" id="save" aria-keyshortcuts="Meta+S Control+S" title="Save (${SAVE_KEY})">Save</button></div>
      </div>
    </div></div>`;
  const formEl = panel.querySelector('#profile-form');
  const form = mountProfileForm(formEl, { onSubmit: save });
  const box = panel.querySelector('#agent-box');
  const bar = panel.querySelector('#save-bar');
  const saveButton = panel.querySelector('#save');
  const fresh = () => ({ draft: draftFromRules(agent.rules), payout: payoutDraftFrom(agent.payout, profile.name), editPayout: !agent.payout });
  let ui = fresh();
  let statusTimer = 0;
  const pending = () => form.changes().length + defaultsChanges(agent, ui).length;
  // 막대: 바꾼 것이 있으면 몇 개인지와 되돌리기·저장을, 방금 저장했으면 그 결과를 4초 동안. 둘 다 없으면 숨긴다
  const syncBar = (done = '') => {
    const n = pending();
    const showDone = Boolean(done) && !n;
    clearTimeout(statusTimer);
    if (showDone) statusTimer = setTimeout(syncBar, 4000);
    say(showDone ? done : n ? `Unsaved changes: ${n}` : '');
    bar.hidden = !n && !showDone;
    panel.querySelector('#save-actions').hidden = !n;
  };
  const drawAgent = () => {
    box.innerHTML = defaultsHtml(agent, ui, { demo: authOptions().demo });
    mountSegs(box);
  };
  drawAgent();
  formEl.addEventListener('input', () => syncBar());
  formEl.addEventListener('change', () => syncBar());
  box.onclick = (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    if (el.dataset.action === 'agent-set') ui.draft[el.dataset.field] = el.dataset.id;
    if (el.dataset.action === 'payout-edit') ui.editPayout = true;
    if (el.dataset.action === 'agent-sample') ui = sampleFill(ui, profile.name);
    drawAgent();
    syncBar();
    if (el.dataset.action === 'payout-edit') box.querySelector('[data-pf="accountNo"]')?.focus();
    if (el.dataset.action === 'agent-sample') saveButton.focus(); // 채웠으면 다음은 저장
  };
  // 입력칸은 다시 그리지 않고 값만 기억한다(타이핑 중 초점을 잃지 않게)
  box.oninput = (e) => {
    const { ag, pf } = e.target.dataset;
    if (ag === 'autoAccept') {
      e.target.value = e.target.value.replace(/\D/g, '');
      ui.draft.autoAccept = e.target.value;
      const note = box.querySelector('#agent-limit-note');
      if (note) note.textContent = limitNote(ui.draft);
    }
    if (pf) ui.payout[pf] = e.target.value;
    syncBar();
  };
  box.onchange = (e) => {
    if (e.target.dataset.ag === 'payday') ui.draft.payday = Number(e.target.value);
    if (e.target.matches('select[data-bank-pick]')) Object.assign(ui.payout, { other: !e.target.value, bank: e.target.value });
    if (e.target.matches('select')) drawAgent();
    syncBar();
  };
  panel.querySelector('#revert').onclick = () => {
    form.reset();
    ui = fresh();
    drawAgent();
    syncBar();
  };

  // 저장하는 동안은 '저장 중…'으로 바뀌고 다시 누를 수 없다. 비서 규칙을 바꿔 저장하면 처음 설정도 마친 것으로 친다.
  // 저장한 값으로 다시 그려(계좌는 끝 4자리로 접힌다) 보던 자리와 초점을 그대로 둔다
  async function save() {
    if (saveButton.disabled) return;
    const changedProfile = form.changed();
    const body = form.value();
    const { rules, payout } = defaultsBody(agent, ui);
    if (!changedProfile && !rules && !payout) return;
    if (changedProfile && !body.name.trim()) {
      say('Enter a display name.', true);
      return void panel.querySelector('#profile-name').focus();
    }
    saveButton.disabled = true;
    saveButton.textContent = 'Saving…';
    const saved = await run(async () => {
      if (changedProfile) await api('/api/me', { method: 'POST', body });
      if (payout) await api('/api/me/payout', { method: 'POST', body: payout });
      if (rules) await api('/api/me/agent/onboarding', { method: 'POST', body: { rules } });
      const [me, nextAgent] = await Promise.all([api('/api/me'), api('/api/me/agent')]);
      return { profile: me.profile, agent: nextAgent };
    });
    if (!saved) {
      saveButton.disabled = false;
      saveButton.textContent = 'Save';
      return;
    }
    const focused = document.activeElement?.id;
    const y = scrollY;
    profileView(saved.profile, saved.agent, rules || payout ? 'Saved. Room-specific agent rules are unchanged.' : 'Profile saved.');
    scrollTo({ top: y, behavior: 'instant' });
    if (focused) document.getElementById(focused)?.focus({ preventScroll: true });
  }
  settings = { pending, save };
  nav.querySelector('#back').onclick = backRoom ? toRoom : toRooms;
  saveButton.onclick = save;
  panel.querySelector('#logout').onclick = () => {
    if (!mayLeave()) return;
    settings = null;
    run(logout);
  };
  panel.querySelector('#delete').onclick = () => run(async () => {
    if (!confirm('Delete your account along with your profile, agent settings and location summaries? Settled amounts remain as anonymous records. This cannot be undone.')) return;
    await api('/api/me/delete', { method: 'POST' });
    settings = null;
    await logout(DELETED);
  });
  syncBar(status);
  // 처음 열 때: #profile이면 맨 위, 목차의 다른 칸(#rules 등)이나 방의 '기본 설정 바꾸기'(#agent)면 그 칸으로 간다
  if (!status) {
    const target = location.hash === '#profile' ? null : document.getElementById(location.hash.slice(1));
    if (target) target.scrollIntoView({ block: 'start', behavior: 'instant' });
    else scrollTo({ top: 0, behavior: 'instant' });
  }
  spy();
}
async function run(fn) {
  try {
    return await fn();
  } catch (e) {
    await settle(); // 첫 화면을 그리기 전에 실패했으면 뼈대를 거두고 그 자리에 까닭을 적는다
    if (!document.querySelector('#message')) panel.innerHTML = MESSAGE;
    say(e.message, true);
  }
}
run(render);
