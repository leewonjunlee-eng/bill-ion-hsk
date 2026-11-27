// 내 계정의 '내 비서 기본 설정'(#5). 받을 계좌와 자동 수락 한도·보낼 시기·이의 처리·알림을 정하면 모든 방에 이 설정으로 들어간다.
// 방마다 다른 값은 그 방의 내 비서에서 '이 방에서만'으로 정한다. 여기서는 HTML과 보낼 것만 만들고, 저장은 account.js가 한다.
// 컨트롤(분할 컨트롤·계좌 입력칸)은 방의 내 비서와 같은 것을 쓰고, 이 화면에서는 '이름·설명 | 컨트롤' 줄에 담는다
import { esc } from './ui.js';
import { sendHtml, disputeHtml, notifyHtml, historyHtml, rulesFromDraft, draftFromRules, limitNote } from './agent-panel.js';
import { payoutFieldsHtml } from './payout-form.js';
import { BANKS } from './banks.js';
import { settingRow, settingsSection } from './settings-layout.js';

// 금액은 칸 오른쪽에 단위를 붙이고, 지금 금액이 무슨 뜻인지는 칸 바로 아래에서 고치는 대로 알린다
const amountHtml = (d) => `<div class="set-amount"><input id="set-auto-accept" data-ag="autoAccept" value="${esc(d.autoAccept)}" inputmode="numeric" maxlength="9" placeholder="0" aria-describedby="agent-limit-note"><span aria-hidden="true">KRW</span></div>
  <p class="group-note" id="agent-limit-note">${esc(limitNote(d))}</p>`;

// 체험 데모에서만: 숫자를 직접 넣지 않아도 한 번 눌러 가짜 계좌와 5만 원 한도를 채운다(task 2).
// 한도는 데모 청구서보다 작아서 task 4에서 비서가 먼저 묻는다. 채운 값은 저장해야 들어간다
export const DEMO_SAMPLE = { accountNo: '110-555-012345', autoAccept: '50000' };
export const sampleFill = (ui, holder) => ({
  ...ui,
  editPayout: true,
  payout: { ...ui.payout, bank: BANKS[0].label, other: false, accountNo: DEMO_SAMPLE.accountNo, holder: holder || ui.payout.holder },
  draft: { ...ui.draft, autoAccept: DEMO_SAMPLE.autoAccept },
});
const sampleHtml = () => `<div class="set-sample"><button type="button" class="btn sm secondary" data-action="agent-sample">Fill sample account and limit</button>
      <p class="group-note">This demo fills a fake account and a ₩50,000 limit. Then press “Save”.</p></div>`;

// ui: { draft: 규칙 초안(draftFromRules), payout: 계좌 초안(payoutDraftFrom), editPayout: 계좌 입력칸을 펼쳤는지 }. demo: 체험 데모면 샘플 채우기 버튼을 둔다
export function defaultsHtml(view, ui, { demo = false } = {}) {
  const p = view.payout;
  const d = ui.draft;
  const payout = ui.editPayout || !p
    ? payoutFieldsHtml(ui.payout)
    : settingRow({ label: 'Current account', control: `<div class="set-value"><span class="grow"><span class="title">${esc(p.bank)} •••• ${esc(p.last4)}</span><span class="meta">${esc(p.holder)}</span></span>
        <button type="button" class="btn sm plain" data-action="payout-edit">Change</button></div>` });
  return `<div class="set-group" id="agent"><h2 class="set-group-title">My agent defaults</h2>
      <p class="set-intro">These apply to every room. To change a rule for one room, choose “This room only” in that room’s agent settings.</p>${demo ? sampleHtml() : ''}</div>
    ${settingsSection({ id: 'payout', title: 'Payout account', desc: 'Your account number is shown only to people who owe you. Changes apply to all pending transfers to you.', body: payout })}
    ${settingsSection({ id: 'rules', title: 'Agent rules', body: `
      ${settingRow({ label: 'Auto-accept limit', forId: 'set-auto-accept', desc: 'Up to this amount, your agent accepts invoices without asking.', control: amountHtml(d) })}
      ${settingRow({ label: 'Send timing', desc: 'When to send what you owe after settlement.', control: sendHtml(d) })}
      ${settingRow({ label: 'Disputes', desc: 'What your agent does when a settlement is disputed.', control: disputeHtml(d) })}
      ${historyHtml(view)}` })}
    ${settingsSection({ id: 'notify', title: 'Notifications', body: settingRow({ label: 'Notification level', desc: 'When your agent should ping you.', control: notifyHtml(d) }) })}`;
}

// 저장할 것: 저장된 기본 설정과 달라진 규칙(같으면 null), 새 계좌번호를 적었을 때만 계좌(아니면 null)
export function defaultsBody(view, ui) {
  const rules = rulesFromDraft(ui.draft);
  const changed = JSON.stringify(rules) !== JSON.stringify(rulesFromDraft(draftFromRules(view.rules)));
  const p = ui.payout;
  const payout = ui.editPayout && String(p.accountNo).trim() ? { bank: p.bank, accountNo: p.accountNo, holder: p.holder } : null;
  return { rules: changed ? rules : null, payout };
}

// 바꾼 칸들(화면 아래 '저장하지 않은 변경 N개'가 센다). 저장할 것과 같은 기준이라 센 것과 저장하는 것이 어긋나지 않는다
const RULE_FIELDS = ['autoAccept', 'sendWhen', 'onDispute', 'notify'];
export function defaultsChanges(view, ui) {
  const now = rulesFromDraft(ui.draft);
  const saved = rulesFromDraft(draftFromRules(view.rules));
  const fields = RULE_FIELDS.filter((k) => JSON.stringify(now[k]) !== JSON.stringify(saved[k]));
  return defaultsBody(view, ui).payout ? [...fields, 'payout'] : fields;
}
