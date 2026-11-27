// 데모 시나리오: 넷이 다녀온 오사카 2박 3일. 금액·환율·기록은 모두 가상의 값이다.
// 데모 화면·서버·테스트가 이 파일을 함께 쓴다. 여기의 uid(한글)는 내부 식별자이고(src/dev/seed.mjs가 uid로 찾는다), 화면에는 NAMES를 보인다.
// 실제 방의 uid는 ASCII 문자열(Firebase uid)이며, 개발용 시드가 이 데이터를 그 형태로 바꿔 넣는다.

const PEOPLE = ['나', '철수', '영희', '민수'];
const NAMES = { 나: 'Me', 철수: 'Chulsoo', 영희: 'Younghee', 민수: 'Minsu' };

// 환율 단위는 원/100엔. 매매기준율은 날짜별, 현금은 각자 환전한 평균 환율이다.
export const DEMO_ROOM = {
  id: 'demo-osaka',
  name: 'Osaka 3-day trip',
  dates: 'Nov 7 – 9',
  members: PEOPLE.map((uid) => ({ uid, name: NAMES[uid] })),
  currency: 'KRW',
  fx: {
    currency: 'JPY',
    base: { '2026-11-07': 912.4, '2026-11-08': 908.15, '2026-11-09': 905.3 },
    settle: { date: '2026-11-10', rate: 903.8 },
    cardFee: 0.014,
    cash: { 철수: 927.6, 영희: 925.9 },
  },
  policy: 'actual',
  policyAgreedBy: PEOPLE,
  agreedAt: 'Nov 6',
  version: 1,
  createdBy: '나',
};

export const POLICIES = [
  {
    id: 'actual',
    label: 'Actual KRW paid',
    desc: 'Card payments use the KRW charged; cash uses the rate the payer exchanged at. Whoever paid does not lose on exchange rates.',
  },
  {
    id: 'payday',
    label: 'Payment-day rate',
    desc: 'Uses the base rate on the day of payment. The payer covers card fees and exchange differences.',
  },
  {
    id: 'settle',
    label: 'Settlement-day rate',
    desc: 'Uses one rate from settlement day for everything. Simplest, but someone loses if rates moved in between.',
  },
];

// source: 비서가 이 지출을 어디서 알았는지. 사람이 정산을 올리는 걸 잊어도 비서가 모은다.
export const DEMO_EXPENSES = [
  {
    id: 'hotel', kind: 'stay', title: 'Namba hotel, 2 nights', date: '2026-11-07', time: '15:10',
    payer: '나', method: 'card', currency: 'JPY', amount: 64000, present: PEOPLE, source: '카드 승인 알림', split: 'equal',
  },
  {
    id: 'izakaya', kind: 'food', title: 'Izakaya dinner', date: '2026-11-07', time: '20:45',
    payer: '철수', method: 'cash', currency: 'JPY', present: PEOPLE, source: '영수증 사진', split: 'items',
    items: [
      { id: 'beer', name: 'Draft beer', qty: 3, unit: 600, tags: ['술'] },
      { id: 'highball', name: 'Highball', qty: 1, unit: 550, tags: ['술'] },
      { id: 'oolong', name: 'Oolong tea', qty: 1, unit: 350, tags: ['무알코올 음료'] },
      { id: 'yakitori', name: 'Yakitori platter', qty: 1, unit: 1600, tags: ['나눠 먹는 안주'] },
      { id: 'karaage', name: 'Karaage', qty: 1, unit: 780, tags: ['나눠 먹는 안주'] },
      { id: 'sashimi', name: 'Sashimi platter', qty: 1, unit: 2200, tags: ['나눠 먹는 안주', '날생선'] },
      { id: 'ochazuke', name: 'Ochazuke', qty: 1, unit: 580, tags: ['1인 식사'] },
    ],
  },
  {
    id: 'usj', kind: 'ticket', title: 'Universal Studios tickets', date: '2026-11-08', time: '09:20',
    payer: '영희', method: 'card', currency: 'JPY', amount: 35600, present: PEOPLE, source: '카드 승인 알림', split: 'equal',
  },
  {
    id: 'lunch', kind: 'food', title: 'Okonomiyaki lunch', date: '2026-11-08', time: '13:30',
    payer: '민수', method: 'card', currency: 'JPY', amount: 5200, present: PEOPLE, source: '카드 승인 알림', split: 'equal',
  },
  {
    // 카드 알림에는 합계만 오므로 처음엔 1/N. 영수증 줄과 주문 시각은 이의 제기 뒤 중재에서 쓴다.
    id: 'bar', kind: 'drink', title: 'Second-round bar', date: '2026-11-08', time: '23:40',
    payer: '나', method: 'card', currency: 'JPY', present: PEOPLE, source: '카드 승인 알림', split: 'equal',
    items: [
      { id: 'b-highball', time: '22:30', name: 'Highball', qty: 3, unit: 700, tags: ['술'] },
      { id: 'b-ginger', time: '22:30', name: 'Ginger ale', qty: 1, unit: 500, tags: ['무알코올 음료'] },
      { id: 'b-nuts', time: '22:30', name: 'Mixed nuts', qty: 1, unit: 600, tags: ['나눠 먹는 안주'] },
      { id: 'b-whisky', time: '23:10', name: 'Whisky', qty: 2, unit: 1200, tags: ['술'] },
      { id: 'b-cheese', time: '23:10', name: 'Cheese platter', qty: 1, unit: 1800, tags: ['나눠 먹는 안주'] },
    ],
  },
  {
    id: 'snack', kind: 'shop', title: 'Convenience store breakfast', date: '2026-11-09', time: '08:40',
    payer: '영희', method: 'cash', currency: 'JPY', amount: 2340, present: PEOPLE, source: '영희가 비서에게 한 말', split: 'equal',
  },
  {
    id: 'limo', kind: 'bus', title: 'Airport limousine bus', date: '2026-11-09', time: '10:05',
    payer: '철수', method: 'card', currency: 'JPY', amount: 11200, present: PEOPLE, source: '카드 승인 알림', split: 'equal',
  },
];

// 각자의 비서가 정산에 쓰라고 공유한 기억. 무료 요금제는 사람당 5개까지.
export const MEMORY_LIMIT = 5;
export const DEMO_MEMORY = {
  나: ['I like beer'],
  철수: ['I often order a highball when we go drinking'],
  영희: ['I don’t drink alcohol'],
  민수: ['I don’t eat raw fish'],
};

// 각자 비서에게 맡긴 규칙. 한도를 넘거나 규칙에 없는 일은 주인에게 묻는다.
export const DEMO_RULES = {
  나: { autoAccept: 50000, sendWhen: '바로', onDispute: '중재 비서에게 맡기기' },
  철수: { autoAccept: 150000, sendWhen: '25일 월급날', onDispute: '나에게 묻기' },
  영희: { autoAccept: 50000, sendWhen: '바로', onDispute: '나에게 묻기' },
  민수: { autoAccept: 50000, sendWhen: '바로', onDispute: '근거가 있으면 이의 제기' },
};

export const DEMO_DISPUTE = {
  expense: 'bar',
  by: '민수',
  leftAt: '22:55',
  claim: 'Minsu went back to the hotel at 22:55. Splitting later orders equally among all 4 is not fair.',
  evidence: ['22:55 group chat message “Heading back first”', '23:08 location summary: Namba hotel'],
  counter: ['All 4 were there for the first order at 22:30', 'It was paid in one go at 23:40'],
};
