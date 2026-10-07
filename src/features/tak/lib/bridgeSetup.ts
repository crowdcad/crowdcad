import { isPocketbaseBackend } from '@/lib/services';
import type { BridgeCredentials } from './bridgeAccount';

/**
 * Everything the "Add TAK server" wizard needs to hand the operator a
 * complete, paste-ready bridge setup: the .env contents and the exact
 * commands for where the bridge will run. Pure functions except
 * backendEnv/detectLocalSetup, which read the app's own configuration.
 */

export type Placement = 'tak-host' | 'local';
export type LocalOs = 'windows' | 'unix';

export interface TakSignIn {
  /** TAK Server hostname (not the TAK Portal web address). */
  host: string;
  username: string;
  /** The TAK user's password, or the token from TAK Portal's Enroll QR. Never stored by CrowdCAD. */
  password: string;
}

/**
 * Reads TAK Portal's Enroll QR contents, e.g.
 * tak://com.atakmap.app/enroll?host=tak.example.org&username=bridge&token=XXXX
 * Returns null if the text is not an enrollment link.
 */
export function parseEnrollLink(text: string): TakSignIn | null {
  const trimmed = text.trim();
  const q = trimmed.indexOf('?');
  if (q < 0) return null;
  const params = new URLSearchParams(trimmed.slice(q + 1));
  const host = params.get('host')?.trim();
  const username = params.get('username')?.trim();
  const password = (params.get('token') ?? params.get('password'))?.trim();
  if (!host || !username || !password) return null;
  return { host: host.replace(/^https?:\/\//, '').replace(/[:/].*$/, ''), username, password };
}

/** True for addresses only reachable from this computer. */
export const isLoopback = (hostOrUrl: string) => /(^|\/\/)(localhost|127\.\d+\.\d+\.\d+|\[?::1\]?)(:|\/|$)/i.test(hostOrUrl);

/** Whether this CrowdCAD looks like a local test setup (emulators or localhost), to preselect "this computer". */
export async function detectLocalSetup(): Promise<boolean> {
  if (typeof window !== 'undefined' && isLoopback(window.location.href)) return true;
  if (isPocketbaseBackend) return isLoopback(process.env.NEXT_PUBLIC_POCKETBASE_URL ?? '');
  const { getApp } = await import('firebase/app');
  const { getAuth } = await import('firebase/auth');
  return !!getAuth(getApp()).emulatorConfig;
}

export interface BackendEnv {
  vars: Record<string, string>;
  /** Problems with this backend for the chosen placement, in plain words. */
  warnings: string[];
}

/** Backend settings for the bridge's .env, from the app's own configuration. */
export async function backendEnv(placement: Placement): Promise<BackendEnv> {
  const warnings: string[] = [];
  if (isPocketbaseBackend) {
    const url = process.env.NEXT_PUBLIC_POCKETBASE_URL ?? 'http://127.0.0.1:8090';
    if (placement === 'tak-host' && isLoopback(url)) {
      warnings.push(
        `PocketBase is at ${url}, which the TAK host can't reach. Replace POCKETBASE_URL with an address the TAK host can reach.`,
      );
    }
    return { vars: { CROWDCAD_BACKEND: 'pocketbase', POCKETBASE_URL: url }, warnings };
  }
  const { getApp } = await import('firebase/app');
  const { getAuth } = await import('firebase/auth');
  const o = getApp().options;
  const vars: Record<string, string> = {
    CROWDCAD_BACKEND: 'firebase',
    FIREBASE_API_KEY: o.apiKey ?? '',
    FIREBASE_PROJECT_ID: o.projectId ?? '',
    FIREBASE_AUTH_DOMAIN: o.authDomain ?? '',
  };
  const emu = getAuth(getApp()).emulatorConfig;
  if (emu) {
    // Same emulators as this browser (see src/app/firebase.ts).
    vars.FIREBASE_AUTH_EMULATOR_HOST = `${emu.host}${emu.port ? `:${emu.port}` : ''}`;
    if (process.env.NEXT_PUBLIC_USE_FIRESTORE_EMULATOR === 'true') vars.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
    if (placement === 'tak-host') {
      warnings.push(
        'This CrowdCAD uses the Firebase emulators on this computer, which a bridge on the TAK host cannot reach. Choose "This computer" to test.',
      );
    }
  }
  return { vars, warnings };
}

/** The bridge's complete .env. The bridge password (and TAK password, if given) appear only here. */
export function envBlock(backend: Record<string, string>, creds: BridgeCredentials, tak: TakSignIn): string {
  const lines = [
    '# --- TAK Server ---',
    '# The bridge enrolls for its own certificate with this TAK user (port 8446),',
    '# then streams positions on 8089. The certificate is saved and renewed automatically.',
    `TAK_HOST=${tak.host}`,
    'TAK_STREAM_PORT=8089',
    `TAK_USERNAME=${tak.username}`,
    `TAK_PASSWORD=${tak.password}`,
    '',
    '# --- CrowdCAD (shown once) ---',
    ...Object.entries(backend).map(([k, v]) => `${k}=${v}`),
    `BRIDGE_EMAIL=${creds.email}`,
    `BRIDGE_PASSWORD=${creds.password}`,
    '',
    'LOG_LEVEL=info',
  ];
  return lines.join('\n') + '\n';
}

const REPO = 'https://github.com/crowdcad/tak-bridge.git';
/** TAK support is in development on this branch; switch to main at the first release. */
const BRANCH = 'integration/tak';
// Re-running the script (or an existing folder) updates the checkout instead of failing.
const UNIX_GET = [`[ -d tak-bridge ] || git clone -b ${BRANCH} ${REPO}`, 'cd tak-bridge', `git checkout ${BRANCH}`, 'git pull --ff-only'];
const PS_GET = [`if (-not (Test-Path tak-bridge)) { git clone -b ${BRANCH} ${REPO} }`, 'cd tak-bridge', `git checkout ${BRANCH}`, 'git pull --ff-only'];

/** Exact commands to install and start the bridge, with the .env written inline so it is one paste. */
export function setupCommands(placement: Placement, env: string, os: LocalOs = 'unix'): string {
  const body = env.trimEnd();
  if (placement === 'tak-host') {
    return [
      ...UNIX_GET,
      "cat > .env <<'EOF'",
      body,
      'EOF',
      'chmod 600 .env',
      'docker compose up -d --build',
      'docker compose logs -f',
    ].join('\n');
  }
  if (os === 'windows') {
    return [
      ...PS_GET,
      "@'",
      body,
      "'@ | Set-Content -Encoding utf8 .env",
      'npm ci',
      'npm run build',
      'node --env-file=.env dist/index.js',
    ].join('\n');
  }
  return [
    ...UNIX_GET,
    "cat > .env <<'EOF'",
    body,
    'EOF',
    'chmod 600 .env',
    'npm ci',
    'npm run build',
    'node --env-file=.env dist/index.js',
  ].join('\n');
}

export interface ChecklistItem {
  label: string;
  state: 'done' | 'waiting' | 'problem';
  hint?: string;
}

export interface BridgeStatusLike {
  lastSeenAt: number;
  takConnected: boolean;
  devicesSeen?: number;
  lastPositionAt?: number;
  takError?: string;
}

/** The live setup checklist, from the bridge's status document. */
export function setupChecklist(status: BridgeStatusLike | null, placement: Placement, now: number): ChecklistItem[] {
  const fresh = !!status && now - status.lastSeenAt < 3 * 60_000;
  const running: ChecklistItem = fresh
    ? { label: 'Bridge signed in to CrowdCAD', state: 'done' }
    : {
        label: 'Bridge signed in to CrowdCAD',
        state: status ? 'problem' : 'waiting',
        hint: status
          ? 'The bridge reported in before but not in the last 3 minutes. Is it still running?'
          : placement === 'tak-host'
            ? 'Waiting for the bridge. Check `docker compose logs -f` for errors about BRIDGE_EMAIL or the backend settings.'
            : 'Waiting for the bridge. Check the terminal where it runs for errors.',
      };
  const tak: ChecklistItem =
    fresh && status!.takConnected
      ? { label: 'Connected to the TAK Server', state: 'done' }
      : {
          label: 'Connected to the TAK Server',
          state: fresh && status!.takError ? 'problem' : 'waiting',
          hint: fresh
            ? (status!.takError ??
              'Not connected yet. If this lasts more than a minute, check TAK_HOST and that ports 8446 and 8089 are reachable.')
            : undefined,
        };
  const devices = status?.devicesSeen;
  const positions: ChecklistItem =
    fresh && status!.takConnected && (devices ?? 0) > 0
      ? { label: `Receiving positions (${devices} device${devices === 1 ? '' : 's'} seen)`, state: 'done' }
      : {
          label: 'Receiving positions',
          state: 'waiting',
          hint:
            fresh && status!.takConnected
              ? devices === undefined
                ? 'This bridge version does not report devices. Open an event linked to this TAK server to see positions.'
                : 'Connected, but no positions yet. Open ATAK or iTAK on a phone in one of the TAK groups the bridge user belongs to.'
              : undefined,
        };
  return [running, tak, positions];
}
