import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '../../.env.test.local') });

const PB_URL = `http://127.0.0.1:${process.env.E2E_PB_PORT || '8090'}`;
const ADMIN_EMAIL = process.env.PB_E2E_ADMIN_EMAIL ?? 'admin@pbtest.local';
const ADMIN_PASSWORD = process.env.PB_E2E_ADMIN_PASSWORD ?? 'Admin1234567890!';


type FieldDef = { name: string; type: string; required?: boolean; options?: Record<string, unknown> };
type AdminHeaders = { 'Content-Type': string; Authorization: string };

async function pbFetch(apiPath: string, options: RequestInit = {}) {
  return fetch(`${PB_URL}${apiPath}`, options);
}

async function getAdminToken(): Promise<string> {
  const res = await pbFetch('/api/collections/_superusers/auth-with-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`[global-setup:pb] Superadmin auth failed: ${res.status} — ${body}`);
  }
  const { token } = (await res.json()) as { token: string };
  return token;
}

async function ensureBaseCollection(
  headers: AdminHeaders,
  name: string,
  fields: FieldDef[],
): Promise<void> {
  // Empty-string rules = anyone (including authenticated users) can access.
  // Fine for E2E test environment.
  const rules = { listRule: '', viewRule: '', createRule: '', updateRule: '', deleteRule: '' };

  const check = await pbFetch(`/api/collections/${name}`, { headers });
  if (check.ok) {
    // Collection exists — ensure the access rules are set correctly (first run may have created it without rules)
    await pbFetch(`/api/collections/${name}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(rules),
    });
    return;
  }
  const create = await pbFetch('/api/collections', {
    method: 'POST',
    headers,
    body: JSON.stringify({ name, type: 'base', fields, ...rules }),
  });
  if (!create.ok) {
    const body = await create.text();
    throw new Error(
      `[global-setup:pb] Failed to create collection '${name}': ${create.status} — ${body}`,
    );
  }
  console.log(`[global-setup:pb] Created collection: ${name}`);
}

async function wipeCollection(headers: AdminHeaders, col: string): Promise<void> {
  const res = await pbFetch(`/api/collections/${col}/records?perPage=500`, { headers });
  if (!res.ok) return;
  const { items } = (await res.json()) as { items: Array<{ id: string }> };
  await Promise.all(
    items.map((item) =>
      pbFetch(`/api/collections/${col}/records/${item.id}`, { method: 'DELETE', headers }),
    ),
  );
}

async function ensureTestUser(
  headers: AdminHeaders,
  email: string,
  password: string,
): Promise<void> {
  // Delete existing test user if present
  const filter = encodeURIComponent(`email="${email}"`);
  const listRes = await pbFetch(`/api/collections/users/records?filter=${filter}`, { headers });
  if (listRes.ok) {
    const { items } = (await listRes.json()) as { items: Array<{ id: string }> };
    await Promise.all(
      items.map((item) =>
        pbFetch(`/api/collections/users/records/${item.id}`, { method: 'DELETE', headers }),
      ),
    );
  }

  const createRes = await pbFetch('/api/collections/users/records', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      email,
      password,
      passwordConfirm: password,
      emailVisibility: true,
      verified: true,
    }),
  });
  if (!createRes.ok) {
    const body = await createRes.text();
    throw new Error(
      `[global-setup:pb] Failed to create test user: ${createRes.status} — ${body}`,
    );
  }
}

async function ensureField(
  headers: AdminHeaders,
  collectionName: string,
  field: FieldDef,
): Promise<void> {
  const res = await pbFetch(`/api/collections/${collectionName}`, { headers });
  if (!res.ok) return;
  const collection = (await res.json()) as { fields?: Array<{ name: string }> };
  const existing = collection.fields || [];
  if (existing.some((f) => f.name === field.name)) return;

  await pbFetch(`/api/collections/${collectionName}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ fields: [...existing, field] }),
  });
}

async function globalSetup(): Promise<void> {
  const email = process.env.E2E_TEST_EMAIL;
  const password = process.env.E2E_TEST_PASSWORD;
  if (!email || !password) {
    throw new Error('E2E_TEST_EMAIL and E2E_TEST_PASSWORD must be set in .env.test.local');
  }

  const token = await getAdminToken();
  const headers: AdminHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  // Ensure all required collections exist (run in parallel — each is independent)
  await Promise.all([
    ensureBaseCollection(headers, 'venues', [
      { name: 'name', type: 'text', required: true },
      { name: 'userId', type: 'text' },
      { name: 'equipment', type: 'json' },
      { name: 'layers', type: 'json' },
      { name: 'posts', type: 'json' },
      { name: 'mapUrl', type: 'text' },
      { name: 'sharedWith', type: 'json' },
      { name: 'isOrgVenue', type: 'bool' },
    ]),
    ensureBaseCollection(headers, 'events', [
      { name: 'name', type: 'text' },
      { name: 'date', type: 'text' },
      { name: 'userId', type: 'text' },
      { name: 'venue', type: 'json' },
      { name: 'sharedWith', type: 'json' },
      { name: 'postingTimes', type: 'json' },
      { name: 'staff', type: 'json' },
      { name: 'supervisor', type: 'json' },
      { name: 'calls', type: 'json' },
      { name: 'status', type: 'text' },
      { name: 'eventPosts', type: 'json' },
      { name: 'eventEquipment', type: 'json' },
      { name: 'pendingAssignments', type: 'json' },
      { name: 'postAssignments', type: 'json' },
      { name: 'interactionSessions', type: 'json' },
    ]),
    ensureBaseCollection(headers, '_storage', [
      { name: 'path', type: 'text', required: true },
      { name: 'file', type: 'file', options: { maxSelect: 1, maxSize: 52428800 } },
    ]),
    // The audit log (src/lib/services/audit.ts).
    ensureBaseCollection(headers, 'audit', [
      { name: 't', type: 'number', required: true },
      { name: 'uid', type: 'text', required: true },
      { name: 'actor', type: 'text' },
      { name: 'action', type: 'text', required: true },
      { name: 'target', type: 'text' },
      { name: 'eventId', type: 'text' },
      { name: 'detail', type: 'text' },
    ]),
    ensureBaseCollection(headers, 'dispatchLogs', [
      { name: 'eventId', type: 'text' },
      { name: 'data', type: 'json' },
    ]),
  ]);

  // Covers .pb-data directories persisted from before this field existed —
  // ensureBaseCollection only sets fields at creation time, not on existing collections.
  await ensureField(headers, 'venues', { name: 'isOrgVenue', type: 'bool' });
  await ensureField(headers, 'events', { name: 'ended', type: 'bool' });
  // Vehicles (src/lib/vehicles.ts).
  for (const field of [{ name: 'vehiclesEnabled', type: 'bool' }, { name: 'vehicles', type: 'json' }]) await ensureField(headers, 'venues', field);
  for (const field of [{ name: 'vehiclesEnabled', type: 'bool' }, { name: 'eventVehicles', type: 'json' }]) await ensureField(headers, 'events', field);
  // Legal hold (tests/e2e/features/records.feature).
  for (const field of [{ name: 'legalHold', type: 'bool' }, { name: 'legalHoldAt', type: 'number' }, { name: 'legalHoldBy', type: 'text' }]) {
    await ensureField(headers, 'events', field);
  }

  // Wipe all data collections to ensure a clean state for every test run
  await Promise.all([
    wipeCollection(headers, 'venues'),
    wipeCollection(headers, 'events'),
    wipeCollection(headers, '_storage'),
    wipeCollection(headers, 'dispatchLogs'),
  ]);

  // Re-create the test user with known credentials
  await ensureTestUser(headers, email, password);

  console.log(`[global-setup:pb] Ready. Test user: ${email}`);
}

export default globalSetup;
