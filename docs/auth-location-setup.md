# #2 / #7 implementation and connection guide

## Current scope

- #2: Google login and logout screens, profile name and color, my room list, ID token and revocation verification, room member access control, existing per-user AI rate limit kept. The no-login demo API is kept.
- #7 (redesigned 11/3): there is no check-in in advance. **When disputing**, only the visits within that expense's time window (first order to payment) are read, inside the browser, from the Google Maps Timeline export file the user chooses (`public/timeline.js`). Only "the time you left the place you were at for the first order" and the arrival time at the next place, or "stayed at the same place until payment", are sent to the server. The file, coordinates and place names are not sent. If there are no records or confidence is low, nothing is added and people handle it directly.
- The summary is attached only if the user turns on the attach-to-dispute switch (that moment is consent), and is deleted after 7 days or with "delete my location summary". The leaving time becomes the `left_at` that mediation already uses and removes that person from later orders. Because the user submitted it, it could be forged or altered, so it always has `requiresHumanApproval=true` and is never auto-accepted. Only lines where mediation reports conflicting evidence have confidence capped at 0.49 or lower.
- Account deletion: after one confirmation dialog (no re-login window), the profile, agent settings, location summaries and original receipts of the user's own expenses are deleted. Shared settlement amounts are kept and moved to an independent anonymous UID per room, removing the account link. Personal information copied into old text, and transfer links, QR codes and the model cache, are cleaned up too. The access-blocking marker for the original account is kept only for retrying deletion.
- Basis: the team guide in Epic #1 and `ARCHITECTURE.md`. Firebase/GCP project creation, real OAuth and deployment were not performed.

## Items not yet complete

### Reflecting the 11/3 review

- Kept the reviewer's per-room processing queue and the parties-only hiding of location summaries.
- Added `Evidence.requiresHumanApproval` and `LineAlloc.evidenceConflict`. The model returns `evidenceConflict` per line; the server caps only that line at 0.49 and keeps the rest of the confidence values. The semantic judgment of whether there is a conflict is left to the model, so complete conflict detection is not guaranteed. The rule fallback does not guess conflicts.
- Location evidence requires approval from both parties and is never auto-accepted. Old check-in and check-out records (without `source`) are not used as evidence.
- Everyone in a room reads invoices, so they do not contain location summary text. The original reason is left as is, and `hasLocationSummary` shows only a gray "location summary, unconfirmed" badge. Deleting the summary removes the badge.
- If the login settings request fails temporarily, it initializes again on the next request (concurrent calls share one request). `test/auth-browser-init.test.mjs`.
- When merging #35, direct reads of `disputes` in `firestore.rules` must be blocked, or the API's hiding can be bypassed. This branch has no Firestore rules file; that change belongs to the owner of #35.

1. **Connect a Firebase project and verify real Google OAuth.** The team project needs to be set up in the order below.
2. **Connect #3 persistent storage.** It is currently MemoryStore, so profiles, rooms and summaries are lost when the server restarts. The new collections `users`, `deletedUsers`, `locationConsents` and `locationEvidence` must be supported under the same Store contract. Production also needs TTL deletion and transactions for request/deletion races.
3. **Connect the #3 account deletion contract.** An `eraseUser(uid)` implementation and tests for MemoryStore are provided. FirestoreStore must connect the same atomic deletion and anonymization. A store without support blocks deletion with 503. If the Auth API fails during deletion, a tombstone blocks normal access and deletion can be retried from the deletion status screen. Anonymization does not forgive debts; the app does not transfer or write off a deleted user's unsettled amounts on its own.
4. **Check real timeline files.** The parser reads the phone export (`semanticSegments`) and the old Takeout format (`timelineObjects`) based on public analysis. These are not official Google schemas, so they need checking against real export files (Android and iOS). Times are in Korea time; time differences abroad need separate design. Place coordinates are not used, so "where you were at the first order" is treated as the place of that expense. Places matching is not implemented.
5. Room creation and invites belong to #4. A new account shows an empty room list. Once #5 agent rule settings are connected, disputes are generated automatically within the range delegated in advance.

## 2026-11-02 integration check

- All 193 tests passed (including the official Auth Emulator, 0 skipped). Real Google OAuth and GPS on a real device remain to be verified separately.
- The latest main's account encryption, prompt input defenses, prevention of duplicate re-split calls, receipt capture and deployed file versioning are all kept.
- Account deletion was checked with `encryptedStore(MemoryStore)`, assembled as in the real server: the deleted user's QR codes and account copies are removed, others' accounts decrypt normally and shared amounts are kept.
- Location consent revocation and expiry, and profile changes, prompt other participants' screens to refresh through events with no personal information. API responses use `Cache-Control: no-store`.
- On PRs and branch pushes, `.github/workflows/test.yml` runs `npm ci` and `npm test` on Node 22.
- There is no Firebase project yet. Merging only this branch does not automatically complete Google login or Cloud Run API deployment. Real account verification is needed after agreeing the connection contracts above with the owners of #3/#4.

## Run first without a project

On Node 22.9 or newer:

```sh
npm ci --ignore-scripts
npm test
npm start
```

- `http://localhost:4500/`: home screen and demo.
- `/account.html`: notice that no project is configured. It does not fake a successful login.
- If you need a development room, set `DEV_SEED=1` in `.env`, restart and use `/room.html`. Development identities are for the local development server only. They are disabled with Firebase configured or in production mode.
- Login and permission tests inject a Firebase verifier and call the HTTP API for real. They do not replace testing real Google OAuth.

## When creating Firebase for the first time

1. Create a team project in the [Firebase Console](https://console.firebase.google.com/). If an existing GCP project is identified, Firebase can be added to it.
2. Project settings → register a web app. Write `.env` by mapping the web app settings `projectId`, `apiKey`, `authDomain` and `appId` to `.env.example`. These are public client settings, not a service account secret key.
3. Authentication → Sign-in method → enable Google and choose a support email.
4. Authentication → Settings → Authorized domains: add `localhost` for local testing and the domain of your deployed front end. Register any other deployment domain with its real name.
5. For local server credentials, use `gcloud auth application-default login`. It needs permission to look up and delete Firebase Auth users in that project. Cloud Run uses a service account and Application Default Credentials. Do not put a secret key JSON in the public folder or the repository.
6. Inject the four Firebase settings into server environment variables and restart. On `/account.html`, check Google popup login → save name and color → after logout, it returns to the My account login screen.
7. Connect memberships in the team's #3/#4 data using Firebase UIDs. Existing demo UIDs (`me`, `ms` and so on) are not converted to real accounts automatically.

## Integration check with the Auth Emulator, without cost or a project

After installing the official Firebase CLI:

```sh
firebase emulators:start --only auth --project demo-agent-settlement
```

`.env` for a separate server:

```dotenv
FIREBASE_PROJECT_ID=demo-agent-settlement
FIREBASE_API_KEY=demo-api-key
FIREBASE_AUTH_DOMAIN=demo-agent-settlement.firebaseapp.com
FIREBASE_APP_ID=demo-app-id
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
```

After `npm start`, check the emulator flow of the Google button on localhost. This is not real OAuth and must not be used in production. The server rejects emulator settings in production mode. The emulator log port is set to 4502 so it does not collide with the app's 4500.

The official Auth Emulator and the real Firebase Admin SDK were used to integration-test token verification → save profile → list my rooms → delete account → reject the old token. To reproduce while the emulator is running:

```powershell
$env:FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099'
$env:RUN_FIREBASE_EMULATOR_TESTS='1'
node --test test/firebase-emulator.test.mjs
```

Plain `npm test` skips this integration test and runs all the other contract and HTTP tests. The emulator test does not replace verification of real Google OAuth.

## Checking location evidence

1. On a phone, get a JSON file with "Export Timeline data" in Google Maps Timeline settings (the menu location may differ by device and version).
2. When an invoice arrives needing review, choose the option saying an expense doesn't match → select the expense and write what doesn't match.
3. In the check-with-location-history section, choose the timeline file. Only that expense's time window is read inside the browser and a one-line preview is shown. If there are no records, it says nothing was found and sends without evidence. In a development room, the fake development record option lets you try the same flow.
4. It is attached only if the attach-to-dispute switch is on. Only `{ expenseId, leftAt, nextAt, nextHome }` or `{ expenseId, stayedUntil }` goes to the server, which checks the times are within that expense's window and rebuilds the summary with the same rules.
5. Only the other party to the dispute (the person who paid) and the person who raised it see the summary; others in the same room see only that a location summary is attached. The summary is not copied into permanent events.
6. On "delete my location summary" on the dispute screen, or at 7-day expiry, the summary is deleted and related unconfirmed mediation proposals go back to review. Amounts both sides already agreed on are kept. What the other side has already read cannot be recalled.

## #7 research on official routes (2026-11-01)

| Route | What was checked / decision |
| --- | --- |
| Google Maps Timeline | Per-device storage and export from Android settings are documented. No official way to read a personal timeline directly through a current API was found. We do not assume Google login alone gives access. |
| Data Portability API | The Maps schema covers contributions, saved places, settings and so on. Support for timeline visit history was not confirmed, so it was not adopted as the basis of this feature. |
| File export / Takeout | **Adopted 11/3.** Since 2025-06-09 the timeline is stored only on the device, so the file the user exports from the phone is read only inside the browser at dispute time. The phone format and the old Takeout format are supported, with ongoing checks against real files. |
| Geolocation | Implemented as check-in and check-out on 11/2 and removed on 11/3. It requires checking in beforehand and cannot be used after the settlement is over. |
| Places API | A separate follow-up integration usable for finding a place from a business name. It does not prove a user's past visit, so manual place selection is used this time. |

Official sources:

- [Firebase Google login](https://firebase.google.com/docs/auth/web/google-signin)
- [Admin SDK token verification](https://firebase.google.com/docs/auth/admin/verify-id-tokens)
- [Admin SDK initialization](https://firebase.google.com/docs/admin/setup)
- [Firebase CDN modules](https://firebase.google.com/docs/web/alt-setup)
- [Auth Emulator](https://firebase.google.com/docs/emulator-suite/connect_auth)
- [Google Timeline and device export](https://support.google.com/maps/answer/6258979?co=GENIE.Platform%3DAndroid&hl=en)
- [Data Portability Maps schema](https://developers.google.com/data-portability/schema-reference/maps)
- [Geolocation standard](https://www.w3.org/TR/geolocation/)
- [Places Text Search](https://developers.google.com/maps/documentation/places/web-service/text-search)
