# HSK submission runbook (steps to do by hand)

The deadline is **13:00 KST on 12/03**; aim to submit at 10:00. Commands are run in Git Bash from `bill-ion/`.
Do not leave private keys, signature files or the saved order JSON (it includes `proofSalt`) in the repository, chat or screen recordings.
Keep the working files below in a folder outside `bill-ion/` (for example `../private/`).

## 0. Check first

- [x] Teammates' consent: received (11/27). The team name and authorship wording in the submission still need to be decided.
- [ ] How to publish the code. Decide yourself whether to create a new repository for judging. The rules require a Git link and a demo video.
      This repository does not include a Pages deployment workflow (`.github/workflows/pages.yml`), so pushing to main does not publish `public/` through it.
- [ ] Whether it is acceptable to submit without a real QA payment. The payment track requires HSP, so if access is blocked, check with the organizers.

## 1. HSP QA access (most urgent)

Send HSP Operations the public egress IP of the computer that will run the payment and ask them to allowlist it.
Contact (official Q&A): Telegram `@w3frances` or `dingyunpeng@hashkey.com`. If you use a VPN or the cloud, use the IP of that execution environment.

```text
Hello, we are building a Track 2 project (Bill:ION) for HSK Chain Horizon Seoul.
Our HSP QA MCP initialize call returns HTTP 403.
Could you allowlist this egress IP and confirm when it is active? IP: <your egress IP>
```

Do not retry the connection repeatedly before you receive confirmation of the registration.

## 2. One QA payment

Preparation: 3 participant wallets. B (the payer) needs at least 0.02 Sepolia Circle USDC
(`0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`, see the Faucet instructions). After connecting, it is checked against the `get_chain_config` result.

**Time limit:** the split proposal expires 24 hours after the demo room is first opened. Finish 2-1 through 2-6 within that time.
Only if it has expired **and no QA order has ever been created**, delete both `.hsp-demo.sqlite*` and `.hsp-qa-orders.sqlite*` and start over
(deleting only the demo DB gets blocked with `HSP_QA_REVISION_NOT_NEWER`). If an order remains in `CREATING` or in `UNKNOWN` or a later state, do not delete.

1. `DEV_SEED=1 BILLION_HSP_DEMO=1 npm start`, then press "Apply B's dispute" at `http://127.0.0.1:4500/hsp-demo.html`.
2. Create `../private/wallets.json`.
   `{"chainId":11155111,"token":"0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238","merchantName":"Bill:ION","wallets":{"a":"0x…","b":"0x…","c":"0x…"}}`
3. `node scripts/export-hsp-qa-room.mjs ../private/wallets.json ../private/manifest.json`
   Record the `revisionCommitment` in the output.
4. At `/hsp-wallet-approval.html`, open `manifest.json`, sign with the three wallets in turn and download `bill-ion-qa-approvals.json`.
5. `node scripts/create-hsp-qa-order.mjs ../private/manifest.json ../private/bill-ion-qa-approvals.json ../private/order.json`
6. `node scripts/prepare-hsp-qa-signature.mjs ../private/order.json ../private/prepared.json > ../private/wallet-request.json`
7. At `/hsp-payment-sign.html`, open `wallet-request.json`, check the terms, sign with wallet B and download `wallet-signature.txt`.
8. `node scripts/submit-hsp-qa-payment.mjs <revisionCommitment> ../private/prepared.json ../private/wallet-signature.txt`
   Check the terms on screen and enter the order ID. **Even if the reply is lost, do not submit again.**
9. Query until `node scripts/verify-hsp-qa-payment.mjs <revisionCommitment>` returns `VERIFIED` (5 confirmation blocks).
10. Write the order ID and transaction hash into the status table in `SUBMISSION.md`, and delete `wallet-signature.txt`.

We have not yet seen the real response format. If `*_MISMATCH` or `*_UNVERIFIED` appears in steps 5–9, do not turn off the check; check the response format first.

## 3. HSK mainnet registry (real HSK gas fees)

First rehearse the same sequence once on testnet (133).

1. Decide the writer wallet. **It cannot be changed after deployment.**
2. `node scripts/prepare-evidence-registry-deployment.mjs 177 <writer> > ../private/deploy.json`
3. Start the server, select `deploy.json` at `/registry-send.html` and send it from the writer wallet.
4. Check the contract address in the explorer. For source verification, use the `input` from the output of `node scripts/build-evidence-registry.mjs` (standard JSON, compiler 0.8.30).
5. After the QA payment is `VERIFIED`:
   `node scripts/prepare-evidence-record.mjs 177 <registry> <writer> <flow-id> > ../private/record.json`
   → send it from the same page.

Recompiling and deploying from Remix changes the metadata, so the runtime code comparison in step 5 can fail. Use the page from step 3.

## 4. Public demo and submission

- Static demo: upload `public/` together with `src/` as `public/src/`, and `/demo/hsp.html` works without a server or wallet.
  Decide the hosting location yourself. After uploading, open it in another browser.
- Add the contract address, record transaction and QA transaction links you obtained to `SUBMISSION.md`, then submit to DoraHacks.
- Leave items you could not obtain as incomplete in the status table.

## 5. 90-second presentation script

| Time | Screen | What to say |
| --- | --- | --- |
| 0–15s | Receipt v1 | "The receipt is genuine. The argument is about who pays which line." |
| 15–30s | "Apply B's dispute" → agent conversation | "B's agent disputes, saying B left at 20:00. The extra snacks were ordered at 20:40. When the mediator agent makes its proposal, the split changes from 3-3-3 to 3.5-2-3.5 and all earlier approvals disappear." |
| 30–45s | "Try ordering with the draft" → 409 | "If the old amount of 3 is requested, the server refuses. No order is created." |
| 45–65s | A and B approve → try to order → 409 | "Even if two parties agree, it stops until C, whose share went up, agrees." |
| 65–80s | C approves → 201 | "When all three approve the same version, exactly one order from B to A is reserved. C's share stays unpaid." |
| 80–90s | Evidence | If the live integration succeeded, open the order ID, QA transaction and HSK registry record. If it failed, say "This screen is a mock and a real HSP payment has not been verified yet" and show the test results. |

Expected questions and answers:

- **Does the Gateway block old versions?** No. Bill:ION blocks the path that issues new payment authority. The app cannot revoke an approval that has already been signed and handed over, so revisions are not opened after the room's first reservation.
- **Does the HSK record prove the Sepolia transfer?** It proves that the designated writer published the commitment. The transfer is checked off-chain by matching the order against the receipt logs.
- **Where are the AI agents?** The app's mediation agent computes v2. The static demo and a server without a key run in rule mode, so no AI model is called, and the screen says so. The dispute and the other agent's reply are fixed synthetic inputs. The agent only proposes who pays; the amounts and payment terms are decided by the server and the three people's approvals.
- **To demo with Gemini?** Put `GEMINI_API_KEY` in `.env` and use the local `/hsp-demo.html` (synthetic data is sent to Gemini and charges may apply). Run it once before presenting and check the result. This path has been tested only with a fake model.

Failure backup: record the demo screen before presenting. If there is no network, open `/demo/hsp.html` with a local `npm start`.
