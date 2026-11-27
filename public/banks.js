// 받는 계좌의 은행 목록(#8). 화면(계좌 등록의 선택 목록)과 서버(토스 송금 링크)가 함께 쓴다.
// label: 화면에 보여 주고 저장하는 이름. toss: 토스 송금 링크(supertoss://send?bank=…)에 넣는 이름.
// toss는 2026-11-02 Android 실기기에서 토스가 은행을 채워 준 표기만 쓴다(test/banks.test.mjs에 결과 기록).
// '국민은행'·'농협은행'·'기업은행'·'K뱅크'처럼 흔히 쓰지만 토스가 에러를 내는 표기는 aliases로 받아 toss 표기로 바꾼다.
export const BANKS = [
  { label: 'Toss Bank', toss: '토스뱅크', aliases: ['토스뱅크', '토스'] },
  { label: 'KB Kookmin Bank', toss: '국민', aliases: ['KB국민은행', '국민은행', 'KB국민', 'KB'] },
  { label: 'Shinhan Bank', toss: '신한', aliases: ['신한은행'] },
  { label: 'Woori Bank', toss: '우리', aliases: ['우리은행'] },
  { label: 'Hana Bank', toss: '하나', aliases: ['하나은행', 'KEB하나은행'] },
  { label: 'NH NongHyup Bank', toss: '농협', aliases: ['NH농협은행', '농협은행', 'NH농협', 'NH'] },
  { label: 'IBK Industrial Bank', toss: '기업', aliases: ['IBK기업은행', '기업은행', 'IBK기업', 'IBK'] },
  { label: 'KakaoBank', toss: '카카오뱅크', aliases: ['카카오뱅크', '카카오'] },
  { label: 'K bank', toss: '케이뱅크', aliases: ['케이뱅크', 'K뱅크', '케이'] },
  { label: 'MG Saemaul', toss: '새마을', aliases: ['새마을금고', 'MG새마을금고'] },
  { label: 'Korea Post', toss: '우체국', aliases: ['우체국'] },
  { label: 'SC First Bank', toss: 'SC제일', aliases: ['SC제일은행', '제일은행'] },
  { label: 'Busan Bank', toss: '부산', aliases: ['부산은행', 'BNK부산은행'] },
  { label: 'iM Bank (Daegu)', toss: '대구', aliases: ['iM뱅크(대구)', 'iM뱅크', '대구은행', 'DGB대구은행'] },
  { label: 'Suhyup Bank', toss: '수협', aliases: ['수협은행'] },
  { label: 'Shinhyup', toss: '신협', aliases: ['신협'] },
];

const norm = (s) => String(s ?? '').replace(/\s+/g, '').toUpperCase();

// 사용자가 쓴 은행 이름을 목록의 은행으로 알아본다(띄어쓰기·대소문자 무시). 모르면 null
export function findBank(name) {
  const n = norm(name);
  if (!n) return null;
  return BANKS.find((b) => [b.label, b.toss, ...b.aliases].some((x) => norm(x) === n)) ?? null;
}
