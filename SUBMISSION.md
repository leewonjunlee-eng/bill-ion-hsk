# Bill:ION — HSK Chain Horizon Hackathon · Seoul (Track 2: Agent Payments & A2A Settlement)

**A disputed shared receipt gets renegotiated, and only the version everyone approved can be paid.**

## Problem

In a small group purchase, the receipt is usually genuine. The argument is about *who owes which line*. When the split changes after a dispute, an earlier payment request for the old amount must not remain payable.

**Demo video:** [video/bill-ion-demo.mp4](video/bill-ion-demo.mp4) (silent, captioned, mock demo). Rebuild it with `npm start`, then `node video/capture.mjs && node video/render.mjs` (needs Chrome and ffmpeg).

## What the demo shows (about 90 seconds)

A paid 9 units. B disputes the extra item they did not use.

| | A | B | C |
| --- | --- | --- | --- |
| v1 (draft) | 3 | 3 | 3 |
| v2 (B excluded from the extra item) | 3.5 | 2 | 3.5 |

1. B's agent says B left at 20:00; the extra order came at 20:40. A's agent states the order and card-payment times. The original app's mediation agent (`src/agents/mediate.mjs`) proposes v2, and every earlier approval is cleared. The agent proposes only who shares each line; the server computes the amounts, and nothing is payable until all three approve.
2. A payment request against v1 is refused: `409 STALE_SNAPSHOT`.
3. A and B approve, C has not: `409 APPROVALS_MISSING`.
4. C approves v2. B reserves exactly one B → A order (`201`). C → A stays unpaid.

The claim and the reply are fixed synthetic inputs. Without `GEMINI_API_KEY` (always the case on the walletless page) mediation runs in the original rule mode with **no AI model call**. With a key, the local server asks Gemini and falls back to the rules on failure; this live-model path is tested only with a fake model for the HSP demo.

The walletless page `public/demo/hsp.html` runs the same server routes inside the browser and lists each server response. It is a **mock**: role buttons are not authentication, and no funds move.

## How the payment boundary works (HSP QA path)

| Gate | Enforced by |
| --- | --- |
| All three wallets sign the same revision, amount, parties, token, chain and expiry | `src/payments/hsp-qa-approval.mjs` |
| One order per room; a stale or unpublished revision cannot reserve | `src/payments/hsp-qa-order.mjs` (SQLite transaction and unique index) |
| The EIP-712 / x402 request must match the approved terms exactly before signing | `src/payments/hsp-signing-policy.mjs` |
| A lost reply never triggers a second submission | `src/payments/hsp-qa-submit.mjs` |
| `VERIFIED` needs the HSP status and both order IDs, plus the ERC-20 `Transfer` and EIP-3009 `AuthorizationUsed(payer, nonce)` logs in one receipt | `src/payments/hsp-qa-query.mjs`, `chain-receipt.mjs` |
| One transaction cannot prove two orders | `src/payments/hsp-evidence-store.mjs` |
| On-chain evidence is append-only with a fixed writer | `contracts/SettlementEvidenceRegistry.sol` |

These gates cover payment authority issued *through Bill:ION*. They do not claim that the HSP Gateway itself enforces settlement revisions. A registry record proves that the writer published a commitment. It does not by itself validate a transfer on another chain.

## Status

| Item | State |
| --- | --- |
| Revision, approval and reservation flow (mock adapter) | Working, covered by tests |
| QA order, signing check, submission, reconciliation | Tested against stubbed gateway replies and locally generated wallet signatures |
| Live HSP QA payment | **Not yet run.** The QA host returned HTTP 403; access requires HSP Operations to allowlist the caller's IP |
| HSK transfer verifier | Read a public HSK mainnet ERC-20 transfer made by another team ([transaction](https://hsk.blockscout.com/tx/0x825822188a921f57666f2fa2925592d2364701cd534bdbfdeb30e63381d5c1bf)); read-only |
| Evidence registry | Tested on a local EVM; read-only creation simulation on HSK RPCs |
| HSK mainnet registry address | **Not deployed** |
| QA payment transaction | **None yet** |

## Existing work and new work

**Existing (not new for this hackathon):** the base web app is an earlier team project, reused with the teammates' consent. It provides the room, receipt, line-by-line allocation, mediation UI and Toss-link settlement, which `README.md` describes.

**New for this hackathon:**

- `src/payments/hsp-*.mjs` and `chain-receipt.mjs`, wired through `src/api.mjs` and `server.mjs`
- `contracts/SettlementEvidenceRegistry.sol`
- The HSP, HSK and evidence CLIs in `scripts/`; the static demo generator addition in `scripts/demo-pages.mjs`
- `public/hsp-*`, `public/registry-send.*`, `public/demo/hsp*`
- The matching `test/hsp-*`, `chain-receipt` and `evidence-registry` tests
- `ethers`, `ganache` and `solc` as development dependencies

The HSP demo room is separate from the original app's rooms. It reuses the original mediation agent on a fixed synthetic receipt and dispute; it is not connected to real user rooms. All demo data is fictional.

## Run it

Node 22.9 or newer.

```bash
npm ci
npm test
npm start        # then open http://localhost:4500/demo/hsp.html
```

On 2026-11-27 the suite reported 637 passed, 16 skipped (emulator-dependent) and 0 failed.

The QA and registry scripts use `ethers` and `solc`, so install development dependencies.
