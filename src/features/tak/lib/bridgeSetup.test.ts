import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/services', () => ({ isPocketbaseBackend: false, dbService: {} }));

const { envBlock, isLoopback, parseEnrollLink, setupChecklist, setupCommands } = await import('./bridgeSetup');

const creds = { bridgeUid: 'u1', email: 'abc@bridge.crowdcad.org', password: 'p@ss-123' };
const tak = { host: 'takserver.example.org', username: 'crowdcad-bridge', password: 'tak-secret' };

describe('parseEnrollLink', () => {
  it('reads host, username and token', () => {
    expect(parseEnrollLink(' tak://com.atakmap.app/enroll?host=takserver.example.org&username=bridge&token=abc123 ')).toEqual({
      host: 'takserver.example.org',
      username: 'bridge',
      password: 'abc123',
    });
  });

  it('accepts password= and strips a scheme or port from the host', () => {
    expect(parseEnrollLink('tak://com.atakmap.app/enroll?host=https://tak.example.org:8446&username=b&password=x')?.host).toBe(
      'tak.example.org',
    );
  });

  it('decodes encoded values', () => {
    expect(parseEnrollLink('tak://x/enroll?host=h&username=a%40b&token=p%2Bq')).toMatchObject({ username: 'a@b', password: 'p+q' });
  });

  it('rejects anything else', () => {
    expect(parseEnrollLink('takserver.example.org')).toBeNull();
    expect(parseEnrollLink('tak://x/enroll?host=h&username=u')).toBeNull();
  });
});

describe('isLoopback', () => {
  it('spots local-only addresses', () => {
    for (const a of ['http://localhost:3000/admin', 'http://127.0.0.1:8090', 'localhost', 'http://[::1]:8090']) expect(isLoopback(a)).toBe(true);
    for (const a of ['https://pb.example.org', 'http://192.168.1.5:8090', 'https://localhost.example.org']) expect(isLoopback(a)).toBe(false);
  });
});

describe('envBlock', () => {
  const block = envBlock({ CROWDCAD_BACKEND: 'firebase', FIREBASE_PROJECT_ID: 'demo-x' }, creds, tak);

  it('is complete: TAK sign-in, backend and bridge account', () => {
    for (const line of [
      'TAK_HOST=takserver.example.org',
      'TAK_STREAM_PORT=8089',
      'TAK_USERNAME=crowdcad-bridge',
      'TAK_PASSWORD=tak-secret',
      'CROWDCAD_BACKEND=firebase',
      'FIREBASE_PROJECT_ID=demo-x',
      'BRIDGE_EMAIL=abc@bridge.crowdcad.org',
      'BRIDGE_PASSWORD=p@ss-123',
    ]) {
      expect(block).toContain(`${line}\n`);
    }
    expect(block).not.toContain('P12');
  });

  it('contains each secret exactly once', () => {
    expect(block.match(/p@ss-123/g)).toHaveLength(1);
    expect(block.match(/tak-secret/g)).toHaveLength(1);
  });
});

describe('setupCommands', () => {
  const block = envBlock({ CROWDCAD_BACKEND: 'firebase' }, creds, tak);

  it('TAK host: writes .env with a quoted heredoc and starts Docker', () => {
    const cmds = setupCommands('tak-host', block);
    expect(cmds).toContain("cat > .env <<'EOF'\n# --- TAK Server ---");
    expect(cmds).toContain('BRIDGE_PASSWORD=p@ss-123\n');
    expect(cmds).toMatch(/\nLOG_LEVEL=info\nEOF\nchmod 600 \.env\ndocker compose up -d --build\n/);
  });

  it('this computer, Windows: a PowerShell here-string with its closing marker at column 0', () => {
    const cmds = setupCommands('local', block, 'windows');
    expect(cmds).toContain("\n@'\n# --- TAK Server ---");
    expect(cmds).toContain("\n'@ | Set-Content -Encoding utf8 .env\n");
    expect(cmds).toMatch(/npm ci\nnpm run build\nnode --env-file=\.env dist\/index\.js$/);
    expect(cmds).not.toContain('docker');
  });

  it('this computer, macOS or Linux: heredoc then node', () => {
    const cmds = setupCommands('local', block, 'unix');
    expect(cmds).toContain("cat > .env <<'EOF'");
    expect(cmds).toMatch(/node --env-file=\.env dist\/index\.js$/);
  });
});

describe('setupChecklist', () => {
  const now = 1_000_000_000;
  const states = (s: Parameters<typeof setupChecklist>[0]) => setupChecklist(s, 'local', now).map((i) => i.state);

  it('waits for the bridge before it reports', () => {
    expect(states(null)).toEqual(['waiting', 'waiting', 'waiting']);
    expect(setupChecklist(null, 'tak-host', now)[0]!.hint).toContain('docker compose logs');
  });

  it('flags a bridge that stopped reporting', () => {
    expect(states({ lastSeenAt: now - 10 * 60_000, takConnected: true, devicesSeen: 2 })[0]).toBe('problem');
  });

  it('shows the TAK error in plain words', () => {
    const items = setupChecklist({ lastSeenAt: now, takConnected: false, takError: 'Connection refused: check TAK_HOST' }, 'local', now);
    expect(items.map((i) => i.state)).toEqual(['done', 'problem', 'waiting']);
    expect(items[1]!.hint).toContain('Connection refused');
  });

  it('asks for a phone once connected but before any positions', () => {
    const items = setupChecklist({ lastSeenAt: now, takConnected: true, devicesSeen: 0 }, 'local', now);
    expect(items.map((i) => i.state)).toEqual(['done', 'done', 'waiting']);
    expect(items[2]!.hint).toContain('TAK groups');
  });

  it('is all done with positions', () => {
    const items = setupChecklist({ lastSeenAt: now, takConnected: true, devicesSeen: 1 }, 'local', now);
    expect(items.map((i) => i.state)).toEqual(['done', 'done', 'done']);
    expect(items[2]!.label).toContain('1 device seen');
  });

  it('copes with an older bridge that does not report devices', () => {
    expect(setupChecklist({ lastSeenAt: now, takConnected: true }, 'local', now)[2]!.hint).toContain('does not report devices');
  });
});
