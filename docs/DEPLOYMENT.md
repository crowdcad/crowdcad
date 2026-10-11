# Deployment and Self-Hosting Guide

CrowdCAD supports two backends. Both are maintained in parallel and selected with `NEXT_PUBLIC_BACKEND` (`firebase` or `pocketbase`). This guide helps you choose one. Each setup guide then covers everything through a running deployment:

- [`SETUP_FIREBASE.md`](SETUP_FIREBASE.md): managed cloud backend on Firebase and Google Cloud
- [`SETUP_POCKETBASE.md`](SETUP_POCKETBASE.md): self-hosted backend on your own machine or LAN, run with Docker

Beginner-friendly versions of both guides, with separate Mac and Windows steps, are at [crowdcad.org/docs](https://crowdcad.org/docs).

TAK live tracking is an optional add-on, in development and off by default. It is compiled in only when `NEXT_PUBLIC_TAK` is exactly `on`; missing or any other value compiles it out. See [`tak-integration/plan.md`](tak-integration/plan.md).

On Firebase, TAK also needs one Firestore index, deployed once per project: `firebase deploy --only firestore:indexes --project YOUR_PROJECT_ID`. It's defined in `firestore.indexes.json` (a collection-group index on `takConfig.bridgeUid`). The TAK bridge uses it to find the events linked to it; without it the bridge connects but never sees an event. The emulators don't need it. The full bridge setup is in the [tak-bridge setup guide](https://github.com/crowdcad/tak-bridge/blob/integration/tak/docs/setup-infra-tak.md).

With TAK on, `NEXT_PUBLIC_TAK_BASEMAPS` and `NEXT_PUBLIC_TAK_GEOCODER_URL` choose the basemaps and place search used for aligning maps and viewing history. Both default to open OpenStreetMap-based services and accept `off`, which stops requests to outside map services. See `.env.example` and decision D55.

## Choosing a backend

| | **Firebase** | **PocketBase** |
|---|---|---|
| Infrastructure | Managed by Google Cloud | Your machine or LAN, run with Docker |
| Cloud account | Firebase project required | None |
| HIPAA path | Signed Google BAA covering Firestore, Auth, Storage and Hosting | No managed BAA. Your organization owns compliance for the infrastructure it runs. |
| Operations | Google handles uptime, scaling and patching | Your organization handles the server, backups and updates |
| Cost | Usage-based cloud billing. Map image uploads need the Blaze plan. | Your own hardware, which can be $0 |
| Internet needed during an event | Yes | No, if all devices share the LAN |
| Good fit for | Organizations that want managed infrastructure and can sign a Google BAA for PHI | Organizations that want data to stay at the venue, no recurring cloud cost or no cloud account |

The choice depends on your infrastructure, compliance and operational needs. The app's features are the same on both backends.

## Fork and clone

Fork [crowdcad/crowdcad](https://github.com/crowdcad/crowdcad) on GitHub, whichever backend you choose. A fork keeps your changes attributable, gives you a place to commit organization-specific configuration and lets you pull future releases from `upstream`:

```bash
git clone https://github.com/YOUR_USERNAME/crowdcad.git
cd crowdcad
git remote add upstream https://github.com/crowdcad/crowdcad.git
```

Common prerequisites are Git and Node.js 20 or newer. PocketBase also needs Docker Desktop.

## Staying up to date

Releases are listed in [`CHANGELOG.md`](../CHANGELOG.md). To update a fork:

```bash
git fetch upstream
git merge upstream/main
git push origin main
npm install
```

Then follow the redeploy steps in your backend's guide. PocketBase reruns `setup-pocketbase.js` and rebuilds the containers. Firebase redeploys `firestore.rules` and rebuilds the app.

## Operational guidance for both backends

- **Access control.** Firebase enforces access with Firestore and Storage rules. PocketBase enforces it with collection rules applied by `scripts/setup-pocketbase.js`. Test them before real users sign in.
- **Authentication.** Require strong passwords, and MFA on admin accounts where the backend supports it.
- **Telemetry and logs.** Set `DISABLE_TELEMETRY=true` in production and review custom code for `console.log` or analytics calls that could capture PHI.
- **Backups.** Encrypt backups and export destinations. Under Firebase, confirm they are covered by the BAA when handling PHI.
- **Least privilege.** Scope service accounts and admin roles narrowly.

## Post-deploy checks

- Sign in, create a venue, create an event and log a test call.
- Confirm the security rules or collection rules are active in the production environment.
- Open the app from a second device on the network your team will use.

## Notes

- Each organization supplies its own backend. Never reuse another organization's Firebase project or PocketBase instance.
- Maintainer-hosted SaaS would require a separate BAA and an operational HIPAA program on the maintainer side, independent of which backend you self-host.
