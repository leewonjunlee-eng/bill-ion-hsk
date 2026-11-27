# HSK 제출 런북 (직접 해야 하는 단계)

마감은 **12/03 13:00 KST**이고, 10:00 제출을 목표로 한다. 명령은 Git Bash에서 `bill-ion/` 기준이다.
개인키, 서명 파일, 저장된 주문 JSON(`proofSalt` 포함)은 저장소·채팅·화면 녹화에 남기지 않는다.
아래 작업 파일은 `bill-ion/` 바깥의 폴더(예: `../private/`)에 둔다.

## 0. 먼저 확인할 것

- [x] 팀원 동의: 받음(11/27). 제출문의 팀 이름·저작 표기는 정해야 한다.
- [ ] 코드 공개 방식. 심사용 저장소를 새로 만들지 직접 정한다. 규칙상 Git 링크와 데모 영상을 낸다.
      `.github/workflows/pages.yml`은 main에 push하면 `public/`을 배포한다.
- [ ] 실제 QA 지급 없이 제출해도 되는지. 결제 트랙은 HSP 사용이 필수이므로, 접속이 막혀 있으면 주최 측에 확인한다.

## 1. HSP QA 접속 (가장 급함)

지급을 실행할 컴퓨터의 공개 egress IP를 HSP Operations에 보내 허용 목록 등록을 요청한다.
연락처(공식 Q&A): Telegram `@w3frances` 또는 `dingyunpeng@hashkey.com`. VPN이나 클라우드를 쓰면 그 실행 환경의 IP다.

```text
Hello, we are building a Track 2 project (Bill:ION) for HSK Chain Horizon Seoul.
Our HSP QA MCP initialize call returns HTTP 403.
Could you allowlist this egress IP and confirm when it is active? IP: <your egress IP>
```

등록 확인을 받기 전에는 접속을 반복 시도하지 않는다.

## 2. QA 지급 한 건

준비: 참가자 지갑 3개. B(지급자)에는 Sepolia Circle USDC 0.02 이상
(`0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`, Faucet 안내 참고). 연결 후 `get_chain_config` 결과와 대조된다.

**시간 제한:** 분담안은 데모 방을 처음 연 시점부터 24시간 뒤 만료된다. 2-1부터 2-6까지를 그 안에 끝낸다.
만료됐고 **QA 주문이 한 번도 만들어지지 않은 경우에만** `.hsp-demo.sqlite*`와 `.hsp-qa-orders.sqlite*`를 함께 지우고 다시 시작한다
(데모 DB만 지우면 `HSP_QA_REVISION_NOT_NEWER`로 막힌다). 주문이 `CREATING`, `UNKNOWN` 이후 상태로 남아 있으면 지우지 않는다.

1. `DEV_SEED=1 BILLION_HSP_DEMO=1 npm start` 후 `http://127.0.0.1:4500/hsp-demo.html`에서 "B의 이의 반영"을 누른다.
2. `../private/wallets.json`을 만든다.
   `{"chainId":11155111,"token":"0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238","merchantName":"Bill:ION","wallets":{"a":"0x…","b":"0x…","c":"0x…"}}`
3. `node scripts/export-hsp-qa-room.mjs ../private/wallets.json ../private/manifest.json`
   출력의 `revisionCommitment`를 기록해 둔다.
4. `/hsp-wallet-approval.html`에서 `manifest.json`을 열고 세 지갑으로 차례로 서명해 `bill-ion-qa-approvals.json`을 받는다.
5. `node scripts/create-hsp-qa-order.mjs ../private/manifest.json ../private/bill-ion-qa-approvals.json ../private/order.json`
6. `node scripts/prepare-hsp-qa-signature.mjs ../private/order.json ../private/prepared.json > ../private/wallet-request.json`
7. `/hsp-payment-sign.html`에서 `wallet-request.json`을 열고 조건을 확인한 뒤 B 지갑으로 서명해 `wallet-signature.txt`를 받는다.
8. `node scripts/submit-hsp-qa-payment.mjs <revisionCommitment> ../private/prepared.json ../private/wallet-signature.txt`
   화면의 조건을 확인하고 주문 ID를 입력한다. **응답이 끊겨도 다시 제출하지 않는다.**
9. `node scripts/verify-hsp-qa-payment.mjs <revisionCommitment>`가 `VERIFIED`를 반환할 때까지 조회한다(확인 5블록).
10. 주문 ID와 거래 해시를 `SUBMISSION.md` 상태 표에 적고 `wallet-signature.txt`를 지운다.

실제 응답 형식은 아직 본 적이 없다. 5~9에서 `*_MISMATCH`나 `*_UNVERIFIED`가 나오면 검사를 끄지 말고 응답 형식부터 확인한다.

## 3. HSK 메인넷 레지스트리 (실제 HSK 가스비)

먼저 테스트넷(133)으로 같은 순서를 한 번 연습한다.

1. 기록자 지갑을 정한다. **배포 후 바꿀 수 없다.**
2. `node scripts/prepare-evidence-registry-deployment.mjs 177 <writer> > ../private/deploy.json`
3. 서버를 켜고 `/registry-send.html`에서 `deploy.json`을 선택해 기록자 지갑으로 보낸다.
4. 탐색기에서 계약 주소를 확인한다. 소스 검증에는 `node scripts/build-evidence-registry.mjs` 출력의 `input`(standard JSON, 컴파일러 0.8.30)을 쓴다.
5. QA 지급이 `VERIFIED`인 뒤:
   `node scripts/prepare-evidence-record.mjs 177 <registry> <writer> <flow-id> > ../private/record.json`
   → 같은 페이지에서 전송한다.

Remix에서 다시 컴파일해 배포하면 메타데이터가 달라져 5의 런타임 코드 대조가 실패할 수 있다. 3의 페이지를 쓴다.

## 4. 공개 데모와 제출

- 정적 데모: `public/`과 `src/`를 `public/src/`로 함께 올리면 `/demo/hsp.html`이 서버와 지갑 없이 동작한다.
  호스팅 위치는 직접 정한다. 올린 뒤 다른 브라우저에서 연다.
- 확보한 계약 주소, 기록 거래, QA 거래 링크를 `SUBMISSION.md`에 반영한 뒤 DoraHacks에 제출한다.
- 확보하지 못한 항목은 상태 표에 미완료로 남긴다.

## 5. 90초 발표 대본

| 시간 | 화면 | 말 |
| --- | --- | --- |
| 0–15초 | 영수증 v1 | "영수증은 진짜입니다. 다툼은 누가 어느 줄을 내느냐입니다." |
| 15–30초 | "B의 이의 반영" → 비서 대화 | "B의 비서가 20:00에 떠났다고 이의를 냅니다. 추가 안주는 20:40 주문입니다. 중재 비서가 안을 내면 분담이 3-3-3에서 3.5-2-3.5로 바뀌고 이전 승인은 모두 사라집니다." |
| 30–45초 | "초안으로 주문 시도" → 409 | "옛 금액 3을 요청하면 서버가 거부합니다. 주문이 만들어지지 않습니다." |
| 45–65초 | A·B 승인 → 주문 시도 → 409 | "당사자 둘이 동의해도 부담이 늘어난 C가 동의하기 전에는 멈춥니다." |
| 65–80초 | C 승인 → 201 | "세 명이 같은 버전을 승인하면 B에서 A로 한 건만 예약됩니다. C의 몫은 미지급으로 남습니다." |
| 80–90초 | 증빙 | 실연동에 성공했으면 주문 ID, QA 거래, HSK 레지스트리 기록을 연다. 실패했으면 "이 화면은 모의이며 실제 HSP 지급은 아직 검증 전입니다"라고 말하고 테스트 결과를 보여준다. |

예상 질문과 답:

- **Gateway가 옛 버전을 막나요?** 아니요. Bill:ION이 새 지급 권한을 내주는 경로를 막습니다. 이미 서명해 넘긴 승인은 앱이 취소할 수 없어 방의 첫 예약 이후에는 수정을 열지 않습니다.
- **HSK 기록이 Sepolia 송금을 증명하나요?** 지정 기록자가 커밋을 게시했다는 사실을 증명합니다. 송금 확인은 오프체인에서 주문과 영수증 로그를 대조합니다.
- **AI 비서는 어디에 있나요?** v2는 앱의 중재 비서가 계산합니다. 정적 데모와 키가 없는 서버는 규칙 모드라 AI 모델을 호출하지 않으며, 화면에도 그렇게 표시됩니다. 이의와 상대 비서의 답은 고정된 합성 입력입니다. 비서는 부담자만 제안하고, 금액 계산과 지급 조건은 서버와 세 사람의 승인이 정합니다.
- **Gemini로 시연하려면?** `.env`에 `GEMINI_API_KEY`를 넣고 로컬 `/hsp-demo.html`을 쓴다(합성 데이터가 Gemini로 전송되고 요금이 들 수 있다). 발표 전에 한 번 실행해 결과를 확인한다. 이 경로는 가짜 모델로만 테스트했다.

장애 대비: 발표 전에 데모 화면을 녹화해 둔다. 네트워크가 없으면 로컬 `npm start`로 `/demo/hsp.html`을 연다.
