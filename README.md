<br/>
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="public/crowdcad_icon.png">
  <img src="public/crowdcad_icon_dark.png" alt="CrowdCAD" width="85" align="left">
</picture>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="public/logo_text.png">
  <img src="public/logo_text_dark.png" alt="CrowdCAD" width="260" style="position: relative;">
</picture>

<br/>

[![CI](https://github.com/evanqua/crowdcad/workflows/CI/badge.svg)](https://github.com/evanqua/crowdcad/actions/workflows/ci.yml)
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL%203.0-blue.svg)](LICENSE.md)
[![Version](https://img.shields.io/badge/version-1.6.0-green.svg)](CHANGELOG.md)
[![Discord](https://img.shields.io/badge/Discord-Join-5865F2?logo=discord&logoColor=white)](https://discord.gg/7detyFE7GM)
[![DOI](https://zenodo.org/badge/1169795235.svg)](https://doi.org/10.5281/zenodo.18864888)

<br clear="left"/>


CrowdCAD is an open-source, browser-based Computer-Aided Dispatch (CAD) system for volunteer EMS and event medical teams. Developer and operational documentation lives in `docs/` and the policy files linked below. A live demo and beginner-friendly setup guides are at [crowdcad.org](https://crowdcad.org).

#### Quick links

- **User guide:** [docs/USER_GUIDE.md](docs/USER_GUIDE.md)
- **Architecture:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- **Component patterns:** [docs/COMPONENTS.md](docs/COMPONENTS.md)
- **Choosing a backend:** [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
- **Firebase setup:** [docs/SETUP_FIREBASE.md](docs/SETUP_FIREBASE.md)
- **PocketBase setup:** [docs/SETUP_POCKETBASE.md](docs/SETUP_POCKETBASE.md)
- **PocketBase data model (ICD):** [docs/ICD.md](docs/ICD.md)
- **Contributing guide:** [CONTRIBUTING.md](CONTRIBUTING.md)
- **Code of Conduct:** [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- **Changelog:** [CHANGELOG.md](CHANGELOG.md)
- **Security and reporting:** [SECURITY.md](SECURITY.md)
- **License:** [LICENSE.md](LICENSE.md)
- **Privacy:** [PRIVACY.md](PRIVACY.md)
- **Deployment disclaimer:** [DISCLAIMER.md](DISCLAIMER.md)

#### Quickstart

CrowdCAD supports two backends maintained side by side. **Firebase** is managed cloud infrastructure. **PocketBase** is self-hosted with Docker and needs no cloud account. [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) compares them. You only need one.

New to the terminal? Follow the step-by-step guides with Mac and Windows instructions at [crowdcad.org/docs](https://crowdcad.org/docs).

**1. Fork and clone.** Fork this repository on GitHub, then:

```bash
git clone https://github.com/YOUR_USERNAME/crowdcad.git
cd crowdcad
git remote add upstream https://github.com/evanqua/crowdcad.git
npm install
cp .env.example .env.local
```

The `upstream` remote lets you pull future releases into your fork.

**2a. Firebase.** Create a Firebase project with Email/Password auth and a Firestore database, paste its web config into `.env.local`, deploy the rules and start the app:

```bash
firebase deploy --only firestore:rules --project YOUR_PROJECT_ID
npm run dev
```

Full steps, including Storage, the first admin and hosting: [docs/SETUP_FIREBASE.md](docs/SETUP_FIREBASE.md).

**2b. PocketBase.** Set `NEXT_PUBLIC_BACKEND=pocketbase` and the `PB_*` values in `.env.local`, then:

```bash
docker compose --env-file .env.local up -d --build
docker exec pocketbase /pb/pocketbase superuser upsert admin@example.com 'YourPassword123'
node scripts/setup-pocketbase.js
```

Full steps, including LAN access, the first admin, backups and password-reset email: [docs/SETUP_POCKETBASE.md](docs/SETUP_POCKETBASE.md).

The app runs at `http://localhost:3000`.

**Updating.** Pull new releases from `upstream`:

```bash
git fetch upstream
git merge upstream/main
git push origin main
```

Then follow the "Updating to a new release" section of your backend's setup guide.

#### Testing

The E2E suite uses Playwright BDD. The Firebase suite runs against the Firebase Emulator Suite, and the test runner starts the emulators and a production build automatically.

Prerequisites:

- [Firebase CLI](https://firebase.google.com/docs/cli): `npm install -g firebase-tools`
- Playwright browsers: `npx playwright install --with-deps chromium`

First-time setup (the example file already holds working emulator defaults):

```bash
cp .env.test.local.example .env.test.local
```

Run the suites:

```bash
npm run test:e2e             # Firebase suite
npm run test:e2e:pocketbase  # PocketBase suite
npm run test:e2e:ui          # interactive Playwright UI
npm run test:e2e:debug       # step through with the Playwright inspector
```

`bddgen` generates Playwright specs from the `.feature` files before each run. Open the HTML report with `npx playwright show-report`.

#### When to read the other docs

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) before cross-cutting changes
- [docs/COMPONENTS.md](docs/COMPONENTS.md) before adding UI components or modals
- [docs/ICD.md](docs/ICD.md) before changing the shape of venue or event data
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) if you have not chosen a backend yet
- [docs/USER_GUIDE.md](docs/USER_GUIDE.md) for operator workflows

#### Reporting and policies

- Report security issues as described in [SECURITY.md](SECURITY.md).
- Community expectations are in [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
- [PRIVACY.md](PRIVACY.md) explains how CrowdCAD handles data, and [DISCLAIMER.md](DISCLAIMER.md) sets the terms under which it is made available to deploying organizations.

#### Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for workflow and PR guidance.

#### Community and visibility

CrowdCAD's mission is to make volunteer event medical services safer and more effective. To help it reach more organizations:

- Fork the repository when adopting or modifying CrowdCAD. Forks preserve attribution and make upstream collaboration visible.
- Star and watch the repository if you use it.
- Link back to this repository from your organization's README or site.

#### Stay connected

- **Release notifications:** [sign up here](https://forms.gle/XbGvaRhpd8kH9wqFA). The list is used for release announcements only.
- **Discord:** [join the CrowdCAD Discord](https://discord.gg/7detyFE7GM) for feature discussion, debugging help and operational formatting ideas.

#### Support and contact

For questions, security reports or hosting inquiries, email support@crowdcad.org.

#### Acknowledgements

CrowdCAD is built by volunteers and the maintainers listed in the project metadata.

CrowdCAD is an open-source software framework and does not provide HIPAA compliance out of the box. Organizations hosting CrowdCAD are solely responsible for ensuring their implementation meets applicable legal and regulatory requirements, including HIPAA. CrowdCAD contributors assume no responsibility for how this software is used.
