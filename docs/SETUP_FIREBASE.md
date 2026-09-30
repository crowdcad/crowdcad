# Firebase Setup for CrowdCAD

This guide sets up CrowdCAD with the Firebase backend for local development and production. Firebase is the managed cloud option and the path to use if your organization needs HIPAA-eligible infrastructure through a signed Google BAA. For the self-hosted option see [`SETUP_POCKETBASE.md`](SETUP_POCKETBASE.md), and for a side-by-side comparison see [`DEPLOYMENT.md`](DEPLOYMENT.md).

A step-by-step version of this guide for readers with no terminal experience, with separate Mac and Windows instructions, is published at [crowdcad.org/docs/firebase-setup](https://crowdcad.org/docs/firebase-setup).

Runtime initialization lives in `src/app/firebase.ts`. Access control lives in `firestore.rules`.

Firebase web config values (including the API key) are public by design and ship in the client bundle. Security comes from Firestore and Storage rules. Service account keys are private: never commit them or expose them to client code.

## Prerequisites

- Git
- Node.js 20 or newer with npm (current LTS recommended)
- Firebase CLI: `npm install -g firebase-tools`
- A Google account

On Windows PowerShell, globally installed npm commands are `.ps1` scripts. If PowerShell reports that running scripts is disabled, run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once.

## 1. Fork and clone

Fork [evanqua/crowdcad](https://github.com/evanqua/crowdcad) on GitHub, clone your fork and add the original repository as the `upstream` remote so you can pull future releases:

```bash
git clone https://github.com/YOUR_USERNAME/crowdcad.git
cd crowdcad
git remote add upstream https://github.com/evanqua/crowdcad.git
npm install
```

## 2. Create and configure the Firebase project

In the [Firebase Console](https://console.firebase.google.com/):

1. **Create a project.** Google Analytics is optional and can be turned off. Record the project ID.
2. **Authentication:** open **Build > Authentication**, click **Get started** and enable the **Email/Password** provider. CrowdCAD uses email and password sign-in only.
3. **Firestore:** open **Build > Firestore Database**, click **Create database**, choose a location and start in **production mode**. The location cannot be changed later. Step 4 deploys the real rules.
4. **Storage (optional):** only venue map image uploads use Cloud Storage. Creating a default bucket requires the Blaze (pay-as-you-go) plan. Without a bucket everything else works, and map uploads fail.
5. **Web app:** open **Project settings > General > Your apps**, add a Web app (Firebase Hosting setup is not needed) and copy the `firebaseConfig` values.

## 3. Environment variables

```bash
cp .env.example .env.local
```

```env
NEXT_PUBLIC_BACKEND=firebase
NEXT_PUBLIC_FIREBASE_API_KEY=AIza...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project-id.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=1234567890
NEXT_PUBLIC_FIREBASE_APP_ID=1:1234567890:web:abcdef123456
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=G-XXXXXXX
DISABLE_TELEMETRY=true
```

- `firebase.ts` requires `apiKey`, `projectId`, `authDomain` and `storageBucket`. Keep the `storageBucket` value from the web config even if you skipped Storage.
- Buckets created since late 2024 use `PROJECT_ID.firebasestorage.app`. Older projects use `PROJECT_ID.appspot.com`.
- `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` is optional.
- `DISABLE_TELEMETRY=true` is recommended for any deployment that may handle PHI.

## 4. Deploy the security rules

A production-mode database denies all reads and writes until rules are deployed.

```bash
firebase login
firebase deploy --only firestore:rules --project YOUR_PROJECT_ID
```

This deploys `firestore.rules` from the repository root. Redeploy it after any release that changes the file.

If you created a Storage bucket, set its rules under **Storage > Rules** in the console. Uploads are written to `venue_maps/`. A minimal rule set:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /venue_maps/{file} {
      allow read: if true;
      allow write: if request.auth != null
        && request.resource.size < 20 * 1024 * 1024
        && request.resource.contentType.matches('image/.*');
    }
  }
}
```

## 5. Run the app

```bash
npm run dev
```

Open `http://localhost:3000` and create an account.

For event use, run a production build:

```bash
npm run build
npm start
```

`next start` listens on all interfaces, so other devices on the same network can open `http://<host LAN IP>:3000`.

## 6. Grant yourself admin access

CrowdCAD's app-level admin role (Profile > Admin: certification list and admin management) is a boolean `isAdmin` field on the user's `users/{uid}` document. Users cannot set it on themselves, so the first admin is bootstrapped with a service account:

1. In the console, open **Project settings > Service accounts** and click **Generate new private key**. Store the JSON file outside the repository.
2. Sign in to the app once with the account that should become admin.
3. Run:

   ```bash
   # macOS / Linux
   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json node scripts/setAdmin.js you@example.com
   ```

   ```powershell
   # Windows PowerShell
   $env:GOOGLE_APPLICATION_CREDENTIALS="C:\path\to\service-account.json"
   node scripts/setAdmin.js you@example.com
   ```

After that user signs in, they can grant or revoke admin access for others from Profile > Admin > Manage Admins. Delete the key from **Service accounts** in the Google Cloud console once you no longer need it.

## Forgot-password emails

The login screen's "Forgot password?" link uses Firebase Auth's `sendPasswordResetEmail`. Firebase sends the email itself, so no SMTP setup is needed. The app's domain must be listed under **Authentication > Settings > Authorized domains**. `localhost` and the project's `firebaseapp.com` and `web.app` domains are listed by default.

## Updating to a new release

```bash
git fetch upstream
git merge upstream/main
git push origin main
npm install
firebase deploy --only firestore:rules --project YOUR_PROJECT_ID
npm run build
npm start
```

Check [`CHANGELOG.md`](../CHANGELOG.md) for release-specific steps.

## Emulator Suite

The Emulator Suite runs Auth, Firestore and Storage locally for rules development and the E2E tests. Ports are set in `firebase.json`.

```bash
firebase emulators:start --only firestore,auth,storage
```

The app connects to the emulators when `NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true` and `NEXT_PUBLIC_USE_FIRESTORE_EMULATOR=true` are set. See the `test:e2e:serve` script in `package.json` for a working example.

## Deploying to Firebase Hosting

Firebase Hosting serves Next.js through its web frameworks integration, which requires the Blaze plan. `firebase.json` in this repository contains rules and emulator settings only. `firebase.json.template` includes a `hosting` block you can merge into it:

```bash
firebase experiments:enable webframeworks
npm run build
firebase deploy --only hosting,firestore:rules --project YOUR_PROJECT_ID
```

Any other Node host that runs `npm run build` and `npm start` (or the `Dockerfile`) also works. Add the deployed domain to Authorized domains.

For CI deploys, store the `NEXT_PUBLIC_FIREBASE_*` values and a deploy credential as CI secrets. Prefer Workload Identity Federation or a least-privilege service account over a long-lived `firebase login:ci` token.

## Compliance

- If Firestore or Storage will hold PHI, sign a Google BAA for the project before any real data enters it, and confirm every third-party integration is also covered.
- Do not send PHI to analytics, crash reporting or other third-party services without a BAA.

## Production checklist

- Signed Google BAA if processing PHI
- `firestore.rules` deployed and tested, and Storage rules set if Storage is enabled
- MFA on admin Google accounts, and service accounts scoped to least privilege
- `DISABLE_TELEMETRY=true`
- Scheduled Firestore exports, encrypted and covered by the BAA where applicable
- Documented incident response and breach notification plans

## Troubleshooting

- **`Missing or insufficient permissions` in the browser console.** Rules were not deployed to this project. Run step 4 and confirm `--project` matches `NEXT_PUBLIC_FIREBASE_PROJECT_ID`.
- **`auth/operation-not-allowed` on sign-up.** Enable the Email/Password provider.
- **`auth/unauthorized-domain`.** Add the domain or IP you are using under Authorized domains.
- **`Missing required Firebase env vars` in the terminal or browser.** `.env.local` is missing one of the listed values, or the server was started before the file was saved. Stop it, fix the file and start it again. `NEXT_PUBLIC_*` values are read at build time, so rerun `npm run build` before `npm start`.
- **Rules behave unexpectedly.** Reproduce against the Emulator Suite and inspect the rules evaluation in the Emulator UI (`http://localhost:4000`).
