# PocketBase Setup for CrowdCAD

This guide sets up CrowdCAD with the PocketBase backend for local development or a self-hosted LAN deployment. PocketBase keeps all data on a machine you control and needs no cloud account. For the managed cloud option see [`SETUP_FIREBASE.md`](SETUP_FIREBASE.md), and for a side-by-side comparison see [`DEPLOYMENT.md`](DEPLOYMENT.md).

A step-by-step version of this guide for readers with no terminal experience, with separate Mac and Windows instructions, is published at [crowdcad.org/docs/pocketbase-setup](https://crowdcad.org/docs/pocketbase-setup).

Relevant source files:

- `src/lib/services/pocketbase/client.ts` and `PocketbaseAuthService.ts`: runtime client and auth adapter
- `docker-compose.yml`, `Dockerfile` and `Dockerfile.pocketbase`: the Docker setup used below
- `scripts/setup-pocketbase.js`: collection and access-rule provisioning
- `scripts/setAdminPocketbase.js`: first-admin bootstrap

Keep `.env.local` and superuser credentials out of version control.

## Prerequisites

- **Git**
- **Node.js 20 or newer** with npm. The current LTS release is recommended. Node runs the provisioning scripts on the host even when the app itself runs in Docker.
- **Docker Desktop** (Windows, macOS or Linux). On Windows it can be installed with `winget install -e --id Docker.DockerDesktop`. It depends on WSL2 and usually needs a restart after the first install.

Commands below work in PowerShell on Windows and in bash or zsh on macOS and Linux. Git Bash on Windows rewrites arguments that start with `/`, which breaks the `docker exec ... /pb/pocketbase` command in step 5. If you use Git Bash, prefix that command with `MSYS_NO_PATHCONV=1`.

The PocketBase image downloads the release that matches the host CPU (`amd64` or `arm64`), so Apple Silicon Macs run it natively. The pinned version is set by `PB_VERSION` in `Dockerfile.pocketbase` (currently 0.37.1).

## Setup

### 1. Fork and clone

Fork [crowdcad/crowdcad](https://github.com/crowdcad/crowdcad) on GitHub, clone your fork and add the original repository as the `upstream` remote so you can pull future releases:

```bash
git clone https://github.com/YOUR_USERNAME/crowdcad.git
cd crowdcad
git remote add upstream https://github.com/crowdcad/crowdcad.git
```

Each checkout has its own `.env.local` and `.pb-data/`. If you already have a Firebase checkout, clone PocketBase into a separate directory.

### 2. Configure environment variables

```bash
cp .env.example .env.local
```

Set these values in `.env.local`:

```env
NEXT_PUBLIC_BACKEND=pocketbase
NEXT_PUBLIC_POCKETBASE_URL=http://127.0.0.1:8090
PB_URL=http://127.0.0.1:8090
PB_ADMIN_EMAIL=admin@example.com
PB_ADMIN_PASSWORD=YourPassword123
```

| Variable | Read by | Purpose |
|---|---|---|
| `NEXT_PUBLIC_BACKEND` | App (build time) | Selects the PocketBase service implementations |
| `NEXT_PUBLIC_POCKETBASE_URL` | App (build time) | PocketBase URL the browser connects to |
| `PB_URL` | Scripts only | PocketBase URL the provisioning scripts use from the host |
| `PB_ADMIN_EMAIL` / `PB_ADMIN_PASSWORD` | Scripts only | Superuser credentials for provisioning |

`NEXT_PUBLIC_*` values are inlined into the client bundle at build time. Rebuild the `web` image after changing them.

Avoid `$`, `#` and spaces in `PB_ADMIN_PASSWORD`. Docker Compose treats `$` as variable interpolation when it reads the env file.

### 3. Install Node dependencies

```bash
npm install
```

The provisioning scripts load `.env.local` through `dotenv`. Without `node_modules` they fall back to the shell environment and exit with `PB_ADMIN_EMAIL and PB_ADMIN_PASSWORD must be set`.

### 4. Build and start the containers

```bash
docker compose --env-file .env.local up -d --build
```

This starts two services:

- `web`: a production build of the Next.js app on port 3000
- `pocketbase`: PocketBase on port 8090, with data persisted to `./.pb-data`

The first build takes several minutes.

### 5. Create the PocketBase superuser

This is a one-time step. The account is stored in `.pb-data/` and persists across restarts.

```bash
docker exec pocketbase /pb/pocketbase superuser upsert admin@example.com 'YourPassword123'
```

Use the same email and password as `PB_ADMIN_EMAIL` and `PB_ADMIN_PASSWORD`.

### 6. Create collections and access rules

```bash
node scripts/setup-pocketbase.js
```

This creates the `venues`, `events`, `dispatchLogs`, `_storage` and `settings` collections, adds an `isAdmin` field to the built-in `users` collection and applies access rules that mirror `firestore.rules`. Only a record's owner or an admin can edit or delete a venue or end an event. The rule constants at the top of the script define exactly what each collection allows.

The script is idempotent. It reapplies its rules on every run, including to existing collections, so rule edits made in the admin UI are reverted the next time it runs. Change the script if you need different rules.

Sign-up fails with "Failed to create record" until this step has run.

### 7. Open the app

- App: `http://localhost:3000`
- PocketBase admin UI: `http://localhost:8090/_/`

Create your user account from the app's sign-up screen. PocketBase requires passwords of at least 8 characters.

### 8. Grant yourself admin access

A one-time bootstrap for Profile > Admin (certification list, admin management). The script reads `PB_URL`, `PB_ADMIN_EMAIL` and `PB_ADMIN_PASSWORD` from `.env.local`:

```bash
node scripts/setAdminPocketbase.js you@example.com
```

Use the email of the account you created in step 7. After that user signs in, they can grant or revoke admin access for others from Profile > Admin > Manage Admins.

## Serving other devices on your network

`NEXT_PUBLIC_POCKETBASE_URL` is the address each browser uses to reach PocketBase, so `127.0.0.1` only works on the host machine. To serve other devices on the LAN:

1. Find the host's LAN IP address (for example `192.168.1.20`). Give the host a DHCP reservation so the address stays the same.
2. Set `NEXT_PUBLIC_POCKETBASE_URL=http://192.168.1.20:8090` in `.env.local`. `PB_URL` can stay `127.0.0.1` since the scripts run on the host.
3. Rebuild: `docker compose --env-file .env.local up -d --build`.
4. Allow inbound connections on ports 3000 and 8090 in the host firewall.
5. Other devices open `http://192.168.1.20:3000`.

## Stopping and restarting

```bash
docker compose down
docker compose --env-file .env.local up -d
```

Collections, records and the superuser persist in `.pb-data/`, so steps 5 to 8 do not need repeating.

## Updating to a new release

Pull the latest release from `upstream` into your fork, then rebuild:

```bash
git fetch upstream
git merge upstream/main
git push origin main
npm install
docker compose --env-file .env.local up -d --build
node scripts/setup-pocketbase.js
```

Rerunning `setup-pocketbase.js` applies any new collections, fields or rules the release added. Check [`CHANGELOG.md`](../CHANGELOG.md) for release-specific steps.

## Backups

All PocketBase data lives in `.pb-data/`. Stop the stack with `docker compose down` and copy that directory to back it up. You can also schedule backups from the admin UI under **Settings > Backups**.

## Forgot-password emails and SMTP

`PocketbaseAuthService` calls PocketBase's built-in `requestPasswordReset` and `confirmPasswordReset` APIs. The app provides its own `/reset-password` page (`src/app/reset-password/page.tsx`), which reads a `token` (or `oobCode`) query parameter and submits it to `confirmPasswordReset`. There is no custom server logic. `Dockerfile.pocketbase` only copies `pb_hooks` or `pb_migrations` into the image if you uncomment those lines.

Two admin UI settings are needed before password reset works. Neither is configured automatically:

1. **Point the reset email at the app.** PocketBase's default template links to its own admin UI. Under **Collections > users > Options > Email templates > Reset password**, set the action URL to:

   ```
   {APP_URL}/reset-password?token={TOKEN}
   ```

   Replace `{APP_URL}` with the app's URL, for example `http://localhost:3000`.

2. **Configure outbound SMTP.** PocketBase does not send email until you enter an SMTP host, port and credentials under **Settings > Mail settings**. These settings are stored in `.pb-data/` and are not exposed as environment variables.

`setup-pocketbase.js` prints a reminder of both steps when it finishes.

## Running without Docker

Download the PocketBase binary for your platform from [pocketbase.io/docs](https://pocketbase.io/docs) and place it in the project root:

```bash
./pocketbase superuser upsert admin@example.com 'YourPassword123'
./pocketbase serve --http=0.0.0.0:8090
```

In a second terminal, set `.env.local` as in step 2 (use the LAN IP for `NEXT_PUBLIC_POCKETBASE_URL` if other devices will connect), then:

```bash
npm install
node scripts/setup-pocketbase.js
npm run build
npm start
```

Use `npm run dev` in place of `build` and `start` for development.

## Troubleshooting

- **`docker: command not found`, or Docker cannot connect to the daemon.** Docker Desktop is not installed or not running. Start it and wait for the engine to report that it is running.
- **`PB_ADMIN_EMAIL and PB_ADMIN_PASSWORD must be set`.** Run `npm install` so the scripts can load `.env.local`, and check that you ran the script from the project root.
- **"Failed to create record" on sign-up.** Run `node scripts/setup-pocketbase.js`.
- **Sign-up rejects a password.** PocketBase requires at least 8 characters. The client does not check this before submitting.
- **Other devices load the page but cannot sign in.** `NEXT_PUBLIC_POCKETBASE_URL` still points at `127.0.0.1`, or the `web` image was not rebuilt after changing it. See [Serving other devices on your network](#serving-other-devices-on-your-network).
- **`docker exec ... /pb/pocketbase` fails in Git Bash.** Git Bash rewrote the `/pb/...` path. Prefix the command with `MSYS_NO_PATHCONV=1` or run it in PowerShell.
