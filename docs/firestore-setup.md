# #3 Firestore connection guide

## What works now

- `FirestoreStore` in `src/store/firestore.mjs` follows the same Store contract as `MemoryStore`. The server uses it only with `STORE=firestore`; otherwise data stays in memory as before. Either way, `encryptedStore` encrypts account and location summary fields.
- The agent log `seq` is assigned per room in a transaction, and account deletion (`eraseUser`) is written in one transaction. The result is the same as `MemoryStore` (both use `eraseUserSnapshot`).
- Receipt photos can exceed the Firestore document limit (1MiB), so they go in Cloud Storage `receipts/{expense id}`.
- Security rules: `firestore.rules` (only room members read, transfers only by their parties, all writes by the server only) and `storage.rules` (everything server only).
- If the server uses Firestore and the user is logged in, the room screen receives the agent log with `onSnapshot`. Otherwise it polls every 2 seconds. If the real-time connection is refused, it continues with polling and tries real-time again the next time the room is opened.
- Firestore charges per document read, so frequent reads were reduced. `tick()` (every minute) reads only transfers with work to do (`scheduled`, `due`, `opened`, `sent`) and reads each room only once per tick. The My rooms list and profile changes use `roomsOf(uid)` with the `_memberUids` index to read only my rooms. The server also puts a read cache (`src/store/cached.mjs`) in front of Firestore: a document or list read once is returned from memory for 60 seconds, and a write clears that collection.
- The server already does the money math. The front end sends only expense input (lines, unit prices, people present), and the server computes shares, net balances, invoices and transfers with `public/core.js`. Tests confirm on Firestore too that "shares sum to the amount paid, and net balances sum to 0".
- The demo (`index.html`, `demo/`) does not use the server store and runs inside the browser, so it is unchanged.

## Connecting to a team Firebase project

After preparing the project and login as in the #2 guide (`docs/auth-location-setup.md`):

1. **Create Firestore.** Console → Firestore Database → Create database → Standard edition, Native mode. Keep the database ID `(default)` (the code opens only the default DB). `asia-northeast1` (Tokyo), the same as Cloud Run, is recommended. The location cannot be changed later. Choose **production mode** (deny all) as the starting rules. Test mode lets anyone read and write for 30 days, and step 3 overwrites it with our rules anyway.
2. **Create Storage.** Console → Storage. Since 2026-02-03, Cloud Storage for Firebase requires the **Blaze plan** (the free usage quota remains). Note the bucket name (`<project>.firebasestorage.app` or the old `<project>.appspot.com`). Blaze bills by usage, so also set a budget alert in Cloud Console → Billing → Budgets and alerts. A budget only sends alerts; it does not stop billing.
3. **Deploy the rules.** `firebase deploy --only firestore:rules,storage --project <project>`. Do this before switching the server to `STORE=firestore` (step 5). Without the rules, the screen's real-time subscription is refused and falls back to 2-second polling, which reads at least 4 documents every 2 seconds (deletion marker, location consent, room, log), so one tab with a room open uses about 7,200 reads per hour (the free quota is 50,000 reads per day).
4. **Server permissions.** Give the Cloud Run service account `Cloud Datastore User` (roles/datastore.user) and `Storage Object Admin` (roles/storage.objectAdmin) on the bucket. If the default compute service account has the project `Editor` role (roles/editor), both permissions are already included. Do not connect a local server to real Firestore; check with the emulator below. Locally there is no production `PAYOUT_ENC_KEY`, so a development key is used, and if documents encrypted that way get into the real DB, the deployed server's `tick()` cannot decrypt them and stops (step 7).
5. **Environment variables.** In addition to the four Firebase values from #2:

   ```dotenv
   STORE=firestore
   FIREBASE_STORAGE_BUCKET=<bucket name>
   ```

6. **Deploy.** For an already deployed service, add only the environment variables without rebuilding. `--set-env-vars` replaces the whole list and drops the Firebase values, so use `--update-env-vars`.

   ```bash
   gcloud run services update agent-settlement --region asia-northeast1 --project <project> --update-env-vars STORE=firestore,FIREBASE_STORAGE_BUCKET=<bucket name>
   ```

   Keep `--max-instances 1`. The in-server request queue (`src/state-locks.mjs`), QR tokens, AI cache and read cache assume a single instance (see `ARCHITECTURE.md`). If there is a problem, return to the memory-store revision with `gcloud run services update-traffic agent-settlement --region asia-northeast1 --project <project> --to-revisions <revision before the switch>=100`. Firestore data stays as it is after rolling back, and to move forward again use `--to-latest` instead of `--to-revisions`.
7. **Never change `PAYOUT_ENC_KEY` once accounts are in Firestore.** If it changes, encrypted accounts cannot be decrypted, `tick()` stops, and transfer reminders stop for every room.

## With the emulator, without a project

Java 21 or newer and firebase-tools are required.

```sh
npm run test:emulators   # starts the emulators, runs all tests (including Firestore contract and rules), then stops them
```

To connect the server to the emulators and view the screens, run `firebase emulators:start --only auth,firestore,storage --project demo-agent-settlement`, and add the emulator values from the #2 guide plus the following to `.env`.

```dotenv
STORE=firestore
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1:9199
FIREBASE_STORAGE_BUCKET=demo-agent-settlement.appspot.com
```

In production (`NODE_ENV=production`), the server does not start if emulator values are present.

## What remains

- **There is no way to create a room.** With Firebase on, the #2 rules turn off the development seed (`/api/dev/seed`). So until #4 room creation and joining, there is no way to open a room with a real account. The Osaka seed (`src/dev/seed.mjs`) can be used with any Store as is.
- **`_memberUids`.** When #4 creates rooms, it is filled automatically if it goes through the Store's `put('rooms', …)`. If written to Firestore directly, the rules do not recognize members.
- **#5 agent settings** can be written to `agents/{uid}` as is. Direct front-end reads are blocked (shared memories, encrypted account).
- There is no migration of in-memory data to Firestore (data on the currently deployed server is lost on restart anyway).
- Expired location consent is still cleaned up by `sweep()` on requests and ticks. If consents become numerous, switching to Firestore TTL would be better.
- It has not yet been checked with a real Firebase project or real Google login. It has been checked only with the emulator.
