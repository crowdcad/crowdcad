#!/usr/bin/env node
/**
 * setup-pocketbase.js
 *
 * Creates all collections required by CrowdCAD in a running PocketBase instance,
 * and applies the access rules that keep editing/ending someone else's venue or
 * event to their owner or an admin only (mirrors firestore.rules — see the rule
 * constants below). Run this once after starting PocketBase for the first time,
 * or any time you want to ensure the schema and rules are up to date — the
 * script is fully idempotent, and re-applies its rules on every run even to
 * collections that already existed.
 *
 * Prerequisites:
 *   - PocketBase is running and reachable at PB_URL
 *   - A superadmin account exists (created with `./pocketbase superuser upsert`)
 *
 * Usage:
 *   PB_URL=http://192.168.x.x:8090 \
 *   PB_ADMIN_EMAIL=admin@example.com \
 *   PB_ADMIN_PASSWORD=YourPassword! \
 *   node scripts/setup-pocketbase.js
 *
 * All three env vars can also be placed in a .env.local file — the script will
 * read it automatically when dotenv is available.
 */

// Optional: load .env.local if present (dotenv is already a dev dependency)
try {
  require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });
} catch {
  // dotenv not available — rely on env vars being set externally
}

const PB_URL = (process.env.PB_URL ?? 'http://127.0.0.1:8090').replace(/\/$/, '');
const ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.PB_ADMIN_PASSWORD;

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error(
    'Error: PB_ADMIN_EMAIL and PB_ADMIN_PASSWORD must be set.\n' +
      'Example:\n' +
      '  PB_URL=http://192.168.x.x:8090 \\\n' +
      '  PB_ADMIN_EMAIL=admin@example.com \\\n' +
      '  PB_ADMIN_PASSWORD=YourPassword! \\\n' +
      '  node scripts/setup-pocketbase.js',
  );
  process.exit(1);
}

async function pbFetch(apiPath, options = {}) {
  const res = await fetch(`${PB_URL}${apiPath}`, options);
  return res;
}

// Access rules applied to every collection this script manages. These mirror
// firestore.rules exactly, so a self-hosted PocketBase deployment gets the
// same "only the owner or an admin can edit important things" guarantees as
// the Firebase backend does — this is the only backend config a self-hoster
// forking this repo actually runs, so it needs to be correct standalone,
// not just documented as a manual follow-up step.
const AUTH_RULE = '@request.auth.id != ""';

// A record's own `userId` field must match the requester, or the requester
// must be an admin. Used for venues (update/delete) and dispatchLogs
// (list/view/update/delete) — anything owner-scoped with no broader sharing
// concept.
const OWNER_OR_ADMIN_RULE = `${AUTH_RULE} && (userId = @request.auth.id || @request.auth.isAdmin = true)`;

// Creating a record requires naming yourself as its owner, not someone else
// — mirrors firestore.rules' create rules for venues/events/dispatchLogs.
const SELF_OWNED_CREATE_RULE = `${AUTH_RULE} && @request.body.userId = @request.auth.id`;

// Event fields that control who owns, can see, or can end an event — a
// shared user or org-event member (anyone the app lets into the dispatch
// view besides the owner/admin) must not be able to touch these via a
// direct write, even though they need broad write access to ordinary
// dispatch fields (calls, staff/supervisor status, equipment) for
// dispatching to work at all. Mirrors firestore.rules'
// isEventProtectedFieldsUnchanged().
const EVENT_PROTECTED_FIELDS = ['userId', 'sharedWith', 'isOrgEvent', 'ended', 'endedAt', 'mapMode'];
const EVENT_PROTECTED_FIELDS_UNTOUCHED = EVENT_PROTECTED_FIELDS.map(
  (field) => `@request.body.${field}:isset = false`,
).join(' && ');

const EVENT_UPDATE_RULE =
  `${AUTH_RULE} && (` +
  `userId = @request.auth.id || @request.auth.isAdmin = true || ` +
  `((sharedWith ~ @request.auth.email || isOrgEvent = true) && ${EVENT_PROTECTED_FIELDS_UNTOUCHED})` +
  `)`;

// TAK bridge accounts (in development, optional) are users with
// role = 'bridge'. They never read or write events; see the TAK section at
// the end of main() and docs/tak-integration/data-contract.md.
const NOT_BRIDGE = "@request.auth.role != 'bridge'";

// The built-in `users` auth collection. `isAdmin` is carved out of a
// self-write everywhere below — without that, any signed-up user could set
// `isAdmin: true` on their own record directly via the API (the Profile >
// Admin panel's "self or admin" buttons are a client-side convenience only)
// and grant themselves full admin rights, including editing or deleting
// any other user's venues/events. Only an existing admin may set `isAdmin`
// on anyone, self included. Mirrors firestore.rules' /users/{userId} rule.
const USERS_RULES = {
  listRule: `${AUTH_RULE} && (id = @request.auth.id || @request.auth.isAdmin = true)`,
  viewRule: `${AUTH_RULE} && (id = @request.auth.id || @request.auth.isAdmin = true)`,
  // Left open for public sign-up (PocketBase's own default), but a create
  // request can't set isAdmin to true on the new account.
  // A create request can't set isAdmin, and only an admin can create a TAK
  // bridge account (role = 'bridge').
  createRule:
    '(@request.body.isAdmin:isset = false || @request.body.isAdmin = false) && ' +
    "(@request.body.role:isset = false || @request.body.role = '' || @request.auth.isAdmin = true)",
  updateRule:
    `${AUTH_RULE} && (` +
    `@request.auth.isAdmin = true || ` +
    `(id = @request.auth.id && @request.body.isAdmin:isset = false && @request.body.role:isset = false)` +
    `)`,
  deleteRule: `${AUTH_RULE} && (id = @request.auth.id || @request.auth.isAdmin = true)`,
};

async function getAdminToken() {
  const res = await pbFetch('/api/collections/_superusers/auth-with-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Superadmin authentication failed: ${res.status} — ${body}`);
  }
  const { token } = await res.json();
  return token;
}

async function ensureCollection(headers, name, fields, rules, indexes = []) {
  const check = await pbFetch(`/api/collections/${name}`, { headers });
  if (check.ok) {
    console.log(`  [skip]   ${name} — already exists`);
    // The collection already existed (e.g. from an earlier run of this
    // script, before its rules were tightened) — bring its rules up to
    // date too, instead of only ever setting them at creation time.
    await ensureRules(headers, name, rules);
    await ensureIndexes(headers, name, indexes);
    return;
  }

  const authRule = '@request.auth.id != ""';
  const res = await pbFetch('/api/collections', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name,
      type: 'base',
      fields,
      // Restrict access to authenticated users by default.
      // Adjust these rules in the PocketBase admin UI to match your security policy.
      listRule: rules?.listRule ?? authRule,
      viewRule: rules?.viewRule ?? authRule,
      createRule: rules?.createRule ?? authRule,
      updateRule: rules?.updateRule ?? authRule,
      deleteRule: rules?.deleteRule ?? authRule,
      indexes,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to create collection '${name}': ${res.status} — ${body}`);
  }
  console.log(`  [create] ${name}`);
}

/** Adds any of `indexes` (CREATE INDEX statements) missing from an existing collection. */
async function ensureIndexes(headers, collectionName, indexes) {
  if (!indexes || indexes.length === 0) return;
  const res = await pbFetch(`/api/collections/${collectionName}`, { headers });
  if (!res.ok) throw new Error(`Failed to read collection '${collectionName}': ${res.status}`);
  const collection = await res.json();
  const existing = collection.indexes || [];
  const missing = indexes.filter((i) => !existing.includes(i));
  if (missing.length === 0) return;
  const patchRes = await pbFetch(`/api/collections/${collectionName}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ indexes: [...existing, ...missing] }),
  });
  if (!patchRes.ok) {
    const body = await patchRes.text();
    throw new Error(`Failed to add indexes to '${collectionName}': ${patchRes.status} — ${body}`);
  }
  console.log(`  [update] ${collectionName} indexes`);
}

const RULE_KEYS = ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule'];

/**
 * Brings an existing collection's API rules in line with `rules` (only the
 * keys present in `rules` are considered — omit a key to leave whatever
 * that rule is currently set to alone). Used both to retrofit a collection
 * that already existed under looser rules from an earlier run of this
 * script, and to (re-)apply rules to a collection this script doesn't
 * create itself, like the built-in `users` auth collection.
 */
async function ensureRules(headers, collectionName, rules) {
  if (!rules) return;

  const res = await pbFetch(`/api/collections/${collectionName}`, { headers });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to read collection '${collectionName}': ${res.status} — ${body}`);
  }
  const collection = await res.json();

  const patch = {};
  for (const key of RULE_KEYS) {
    if (key in rules && collection[key] !== rules[key]) {
      patch[key] = rules[key];
    }
  }

  if (Object.keys(patch).length === 0) {
    console.log(`  [skip]   ${collectionName} rules — already up to date`);
    return;
  }

  const patchRes = await pbFetch(`/api/collections/${collectionName}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(patch),
  });
  if (!patchRes.ok) {
    const body = await patchRes.text();
    throw new Error(`Failed to update rules for '${collectionName}': ${patchRes.status} — ${body}`);
  }
  console.log(`  [update] ${collectionName} rules — ${Object.keys(patch).join(', ')}`);
}

async function ensureField(headers, collectionName, field) {
  const res = await pbFetch(`/api/collections/${collectionName}`, { headers });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to read collection '${collectionName}': ${res.status} — ${body}`);
  }
  const collection = await res.json();
  const existing = collection.fields || [];
  if (existing.some((f) => f.name === field.name)) {
    console.log(`  [skip]   ${collectionName}.${field.name} — already exists`);
    return;
  }

  const patchRes = await pbFetch(`/api/collections/${collectionName}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ fields: [...existing, field] }),
  });
  if (!patchRes.ok) {
    const body = await patchRes.text();
    throw new Error(`Failed to add field '${field.name}' to '${collectionName}': ${patchRes.status} — ${body}`);
  }
  console.log(`  [add]    ${collectionName}.${field.name}`);
}

// =====================================================================
// TAK integration (in development, optional). Mirrors the TAK block in
// firestore.rules; see docs/tak-integration/data-contract.md.
//
// - Bridge accounts are users with role = 'bridge' plus a tak_bridges
//   record, both created only by admins. Deleting the tak_bridges record
//   revokes the bridge: every bridge rule checks it exists.
// - "Event readers" mirror the events viewRule above (any signed-in
//   non-bridge user today). Tighten them together with events.
// - Aliased @collection joins (e.g. @collection.events:ev) keep each
//   lookup's conditions on the same joined record.
// =====================================================================
const TAK_EVENT_READER = `${AUTH_RULE} && ${NOT_BRIDGE}`;
const takEventOwner = (eventExpr) =>
  `@collection.events:ev.id ?= ${eventExpr} && @collection.events:ev.userId ?= @request.auth.id`;
const TAK_IS_BRIDGE =
  `${AUTH_RULE} && @request.auth.role = 'bridge' && @collection.tak_bridges:self.bridgeUser ?= @request.auth.id`;
const takLinkedBridge = (eventExpr) =>
  `${TAK_IS_BRIDGE} && @collection.tak_event_config:lc.event ?= ${eventExpr} && ` +
  `@collection.tak_event_config:lc.bridge ?= @request.auth.id`;
const takBridgeCanWrite = (eventExpr) =>
  `${TAK_IS_BRIDGE} && @collection.tak_event_config:wc.event ?= ${eventExpr} && ` +
  `@collection.tak_event_config:wc.bridge ?= @request.auth.id && ` +
  `@collection.tak_event_config:wc.enabled ?= true && @collection.tak_event_config:wc.closed ?= false`;
const takAllowedUser = (bridgeExpr) =>
  `${AUTH_RULE} && ${NOT_BRIDGE} && @collection.tak_bridges:ab.bridgeUser ?= ${bridgeExpr} && ` +
  `@collection.tak_bridges:ab.allowedUsers.id ?= @request.auth.id`;
const TAK_ADMIN = `${AUTH_RULE} && ${NOT_BRIDGE} && @request.auth.isAdmin = true`;
const TAK_BODY_HISTORY_MODE =
  "(@request.body.historyMode:isset = false || @request.body.historyMode = 'off' || " +
  "@request.body.historyMode = 'summary' || @request.body.historyMode = 'detailed')";

async function ensureTakCollections(headers) {
  console.log('\nTAK collections (optional add-on):');
  const usersCollection = await (await pbFetch('/api/collections/users', { headers })).json();

  await ensureCollection(
    headers,
    'tak_bridges',
    [
      { name: 'bridgeUser', type: 'text', required: true },
      { name: 'label', type: 'text', required: true },
      { name: 'createdBy', type: 'text' },
      { name: 'allowedUsers', type: 'relation', collectionId: usersCollection.id, maxSelect: 999 },
      { name: 'defaultHistoryMode', type: 'text' },
    ],
    {
      listRule: `${AUTH_RULE} && (bridgeUser = @request.auth.id || allowedUsers.id ?= @request.auth.id || @request.auth.isAdmin = true)`,
      viewRule: `${AUTH_RULE} && (bridgeUser = @request.auth.id || allowedUsers.id ?= @request.auth.id || @request.auth.isAdmin = true)`,
      createRule: `${TAK_ADMIN} && @request.body.createdBy = @request.auth.id && @request.body.bridgeUser != @request.auth.id`,
      updateRule: `${TAK_ADMIN} && @request.body.createdBy:isset = false && @request.body.bridgeUser:isset = false`,
      deleteRule: TAK_ADMIN,
    },
    ['CREATE UNIQUE INDEX idx_tak_bridges_user ON tak_bridges (bridgeUser)'],
  );

  await ensureCollection(
    headers,
    'tak_device_mappings',
    [
      { name: 'bridge', type: 'text', required: true },
      { name: 'deviceUid', type: 'text', required: true },
      { name: 'teamName', type: 'text', required: true },
      { name: 'callsign', type: 'text' },
      { name: 'updatedBy', type: 'text' },
    ],
    {
      listRule: `${TAK_ADMIN} || ${takAllowedUser('bridge')}`,
      viewRule: `${TAK_ADMIN} || ${takAllowedUser('bridge')}`,
      createRule: `(${TAK_ADMIN} || ${takAllowedUser('@request.body.bridge')}) && @request.body.updatedBy = @request.auth.id`,
      updateRule:
        `(${TAK_ADMIN} || ${takAllowedUser('bridge')}) && @request.body.updatedBy = @request.auth.id && ` +
        '@request.body.bridge:isset = false',
      deleteRule: TAK_ADMIN,
    },
    ['CREATE UNIQUE INDEX idx_tak_device_mappings ON tak_device_mappings (bridge, deviceUid)'],
  );

  await ensureCollection(
    headers,
    'tak_bridge_status',
    [
      { name: 'bridge', type: 'text', required: true },
      { name: 'lastSeenAt', type: 'number' },
      { name: 'takConnected', type: 'bool' },
      { name: 'version', type: 'text' },
      { name: 'linkedEventCount', type: 'number' },
    ],
    {
      listRule: `bridge = @request.auth.id || ${TAK_ADMIN} || ${takAllowedUser('bridge')}`,
      viewRule: `bridge = @request.auth.id || ${TAK_ADMIN} || ${takAllowedUser('bridge')}`,
      createRule: `${TAK_IS_BRIDGE} && @request.body.bridge = @request.auth.id`,
      updateRule: `${TAK_IS_BRIDGE} && bridge = @request.auth.id && @request.body.bridge:isset = false`,
      deleteRule: TAK_ADMIN,
    },
    ['CREATE UNIQUE INDEX idx_tak_bridge_status ON tak_bridge_status (bridge)'],
  );

  // Linking: the owner may set `bridge` only to a bridge they're allowed to
  // use. An admin may only change `closed` (the end-event flow).
  await ensureCollection(
    headers,
    'tak_event_config',
    [
      { name: 'event', type: 'text', required: true },
      { name: 'bridge', type: 'text' },
      { name: 'enabled', type: 'bool' },
      { name: 'closed', type: 'bool' },
      { name: 'historyMode', type: 'text' },
    ],
    {
      listRule: `${TAK_EVENT_READER} || (${TAK_IS_BRIDGE} && bridge = @request.auth.id)`,
      viewRule: `${TAK_EVENT_READER} || (${TAK_IS_BRIDGE} && bridge = @request.auth.id)`,
      createRule:
        `${AUTH_RULE} && ${NOT_BRIDGE} && ${takEventOwner('@request.body.event')} && ` +
        `(@request.body.bridge:isset = false || @request.body.bridge = '' || ${takAllowedUser('@request.body.bridge')}) && ` +
        TAK_BODY_HISTORY_MODE,
      updateRule:
        `${AUTH_RULE} && ${NOT_BRIDGE} && @request.body.event:isset = false && ${TAK_BODY_HISTORY_MODE} && (` +
        `(${takEventOwner('event')} && (@request.body.bridge:isset = false || @request.body.bridge = '' || ` +
        `@request.body.bridge = bridge || ${takAllowedUser('@request.body.bridge')})) || ` +
        '(@request.auth.isAdmin = true && @request.body.bridge:isset = false && @request.body.enabled:isset = false && ' +
        '@request.body.historyMode:isset = false))',
      deleteRule: `${AUTH_RULE} && ${NOT_BRIDGE} && ${takEventOwner('event')}`,
    },
    ['CREATE UNIQUE INDEX idx_tak_event_config ON tak_event_config (event)'],
  );

  await ensureCollection(
    headers,
    'tak_map_alignment',
    [
      { name: 'event', type: 'text', required: true },
      { name: 'layerId', type: 'text', required: true },
      { name: 'mapUrl', type: 'text' },
      { name: 'naturalWidth', type: 'number' },
      { name: 'naturalHeight', type: 'number' },
      { name: 'controlPoints', type: 'json' },
      { name: 'transform', type: 'json' },
      { name: 'residualM', type: 'number' },
    ],
    {
      listRule: TAK_EVENT_READER,
      viewRule: TAK_EVENT_READER,
      createRule: `${AUTH_RULE} && ${NOT_BRIDGE} && ${takEventOwner('@request.body.event')}`,
      updateRule: `${AUTH_RULE} && ${NOT_BRIDGE} && ${takEventOwner('event')} && @request.body.event:isset = false`,
      deleteRule: `${AUTH_RULE} && ${NOT_BRIDGE} && ${takEventOwner('event')}`,
    },
    ['CREATE UNIQUE INDEX idx_tak_map_alignment ON tak_map_alignment (event, layerId)'],
  );

  await ensureCollection(
    headers,
    'tak_device_links',
    [
      { name: 'event', type: 'text', required: true },
      { name: 'deviceUid', type: 'text', required: true },
      { name: 'teamId', type: 'text', required: true },
      { name: 'linkedAt', type: 'number' },
      { name: 'method', type: 'text' },
      { name: 'linkedBy', type: 'text' },
    ],
    {
      listRule: `${TAK_EVENT_READER} || ${takLinkedBridge('event')}`,
      viewRule: `${TAK_EVENT_READER} || ${takLinkedBridge('event')}`,
      createRule:
        `${TAK_EVENT_READER} && @request.body.linkedBy = @request.auth.id && ` +
        "(@request.body.method = 'auto' || @request.body.method = 'manual')",
      updateRule:
        `${TAK_EVENT_READER} && @request.body.linkedBy = @request.auth.id && @request.body.event:isset = false && ` +
        "(@request.body.method:isset = false || @request.body.method = 'auto' || @request.body.method = 'manual')",
      deleteRule: TAK_EVENT_READER,
    },
    ['CREATE UNIQUE INDEX idx_tak_device_links ON tak_device_links (event, deviceUid)'],
  );

  await ensureCollection(
    headers,
    'tak_live',
    [
      { name: 'event', type: 'text', required: true },
      { name: 'bridge', type: 'text', required: true },
      { name: 'deviceUid', type: 'text', required: true },
      { name: 'lat', type: 'number' },
      { name: 'lon', type: 'number' },
      { name: 'hae', type: 'number' },
      { name: 'ce', type: 'number' },
      { name: 'course', type: 'number' },
      { name: 'speed', type: 'number' },
      { name: 'callsign', type: 'text' },
      { name: 'cotType', type: 'text' },
      { name: 'deviceTime', type: 'number' },
      { name: 'receivedAt', type: 'number' },
    ],
    {
      listRule: `${TAK_EVENT_READER} || ${takLinkedBridge('event')}`,
      viewRule: `${TAK_EVENT_READER} || ${takLinkedBridge('event')}`,
      createRule:
        `${takBridgeCanWrite('@request.body.event')} && @request.body.bridge = @request.auth.id && ` +
        '@request.body.lat >= -90 && @request.body.lat <= 90 && @request.body.lon >= -180 && @request.body.lon <= 180',
      updateRule:
        `${takBridgeCanWrite('event')} && @request.body.event:isset = false && @request.body.bridge:isset = false && ` +
        '@request.body.deviceUid:isset = false',
      deleteRule: `${takLinkedBridge('event')} || (${AUTH_RULE} && ${NOT_BRIDGE} && ${takEventOwner('event')})`,
    },
    ['CREATE UNIQUE INDEX idx_tak_live ON tak_live (event, deviceUid)'],
  );

  // History: owner-only reads in v1. Writes follow the event's historyMode.
  const historyWrite = (eventExpr, mode) =>
    `${takBridgeCanWrite(eventExpr)} && ` +
    (mode === 'detailed'
      ? "@collection.tak_event_config:wc.historyMode ?= 'detailed'"
      : "@collection.tak_event_config:wc.historyMode ?!= 'off'");
  const historyRead = `(${AUTH_RULE} && ${NOT_BRIDGE} && ${takEventOwner('event')}) || ${takLinkedBridge('event')}`;
  await ensureCollection(
    headers,
    'tak_history',
    [
      { name: 'event', type: 'text', required: true },
      { name: 'bridge', type: 'text', required: true },
      { name: 'segmentId', type: 'text', required: true },
      { name: 'deviceUid', type: 'text' },
      { name: 'teamId', type: 'text' },
      { name: 'startedAt', type: 'number' },
      { name: 'endedAt', type: 'number' },
      { name: 'windows', type: 'json' },
      { name: 'grid', type: 'json' },
    ],
    {
      listRule: historyRead,
      viewRule: historyRead,
      createRule: `${historyWrite('@request.body.event', 'summary')} && @request.body.bridge = @request.auth.id`,
      updateRule: `${historyWrite('event', 'summary')} && @request.body.event:isset = false && @request.body.bridge:isset = false`,
      deleteRule: `${AUTH_RULE} && ${NOT_BRIDGE} && ${takEventOwner('event')}`,
    },
    ['CREATE UNIQUE INDEX idx_tak_history ON tak_history (segmentId)'],
  );
  await ensureCollection(
    headers,
    'tak_history_points',
    [
      { name: 'event', type: 'text', required: true },
      { name: 'bridge', type: 'text', required: true },
      { name: 'segmentId', type: 'text', required: true },
      { name: 'chunk', type: 'number' },
      { name: 'points', type: 'json' },
    ],
    {
      listRule: historyRead,
      viewRule: historyRead,
      createRule: `${historyWrite('@request.body.event', 'detailed')} && @request.body.bridge = @request.auth.id`,
      updateRule: `${historyWrite('event', 'detailed')} && @request.body.event:isset = false && @request.body.bridge:isset = false`,
      deleteRule: `${AUTH_RULE} && ${NOT_BRIDGE} && ${takEventOwner('event')}`,
    },
    ['CREATE UNIQUE INDEX idx_tak_history_points ON tak_history_points (segmentId, chunk)'],
  );

  await ensureCollection(
    headers,
    'tak_event_status',
    [
      { name: 'event', type: 'text', required: true },
      { name: 'bridge', type: 'text', required: true },
      { name: 'lastSeenAt', type: 'number' },
      { name: 'takConnected', type: 'bool' },
      { name: 'liveDeviceCount', type: 'number' },
    ],
    {
      listRule: TAK_EVENT_READER,
      viewRule: TAK_EVENT_READER,
      createRule: `${takLinkedBridge('@request.body.event')} && @request.body.bridge = @request.auth.id`,
      updateRule: `${takLinkedBridge('event')} && @request.body.event:isset = false`,
      deleteRule: TAK_ADMIN,
    },
    ['CREATE UNIQUE INDEX idx_tak_event_status ON tak_event_status (event)'],
  );
}

async function main() {
  console.log(`Connecting to PocketBase at ${PB_URL} ...`);

  let token;
  try {
    token = await getAdminToken();
  } catch (err) {
    console.error(`\nAuthentication error: ${err.message}`);
    console.error('Make sure PocketBase is running and the credentials are correct.');
    process.exit(1);
  }

  console.log('Authenticated. Setting up collections...\n');

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  // `role` on `users` comes first: the rules below refer to
  // @request.auth.role, and PocketBase rejects rules naming unknown fields.
  await ensureField(headers, 'users', { name: 'role', type: 'text' });

  await ensureCollection(
    headers,
    'venues',
    [
      { name: 'name', type: 'text', required: true },
      { name: 'userId', type: 'text' },
      { name: 'equipment', type: 'json' },
      { name: 'layers', type: 'json' },
      { name: 'posts', type: 'json' },
      { name: 'mapUrl', type: 'text' },
      { name: 'sharedWith', type: 'json' },
      { name: 'isOrgVenue', type: 'bool' },
    ],
    {
      // Reading a venue stays open to any signed-in user (matches
      // firestore.rules — org-visibility scoping isn't implemented on
      // either backend). Only the creator or an admin may create/update/
      // delete one, so a random org member can't edit or delete someone
      // else's venue preset.
      listRule: AUTH_RULE,
      viewRule: AUTH_RULE,
      createRule: SELF_OWNED_CREATE_RULE,
      updateRule: OWNER_OR_ADMIN_RULE,
      deleteRule: OWNER_OR_ADMIN_RULE,
    },
  );

  // `isOrgVenue` on `venues` — set for deployments where this collection
  // already existed before the field was added above.
  await ensureField(headers, 'venues', { name: 'isOrgVenue', type: 'bool' });

  await ensureCollection(
    headers,
    'events',
    [
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
      { name: 'clinics', type: 'json' },
      { name: 'dispatchZones', type: 'json' },
      { name: 'isOrgEvent', type: 'bool' },
      { name: 'ended', type: 'bool' },
      { name: 'endedAt', type: 'number' },
      { name: 'mapMode', type: 'text' },
    ],
    {
      // Same reasoning as venues: read stays open, but update is
      // field-limited for anyone who isn't the owner or an admin — a
      // shared user or org-event member can dispatch (write ordinary
      // fields), but can't touch who owns/can see/can end the event. See
      // EVENT_UPDATE_RULE above (mirrors firestore.rules exactly).
      // TAK bridge accounts never read or write events (NOT_BRIDGE).
      listRule: `${AUTH_RULE} && ${NOT_BRIDGE}`,
      viewRule: `${AUTH_RULE} && ${NOT_BRIDGE}`,
      createRule: `${SELF_OWNED_CREATE_RULE} && ${NOT_BRIDGE}`,
      updateRule: `${EVENT_UPDATE_RULE} && ${NOT_BRIDGE}`,
      deleteRule: `${OWNER_OR_ADMIN_RULE} && ${NOT_BRIDGE}`,
    },
  );

  // `clinics` on `events` — set for deployments where this collection
  // already existed before the field was added above.
  await ensureField(headers, 'events', { name: 'clinics', type: 'json' });
  // Same, for `dispatchZones` (map zones support).
  await ensureField(headers, 'events', { name: 'dispatchZones', type: 'json' });

  // `isOrgEvent`/`ended`/`endedAt` on `events` — set for deployments where
  // this collection already existed before these fields were added above.
  // Without them, "Designate as org event" and "End Event" silently no-op:
  // PocketBase drops any field in an update request that isn't part of the
  // collection's schema, so the field never actually persists even though
  // the request itself succeeds.
  await ensureField(headers, 'events', { name: 'isOrgEvent', type: 'bool' });
  await ensureField(headers, 'events', { name: 'ended', type: 'bool' });
  await ensureField(headers, 'events', { name: 'endedAt', type: 'number' });
  // `mapMode` on `events` ('standard' | 'tak'; unset means standard) — set
  // for deployments where this collection existed before TAK support.
  await ensureField(headers, 'events', { name: 'mapMode', type: 'text' });

  await ensureCollection(
    headers,
    'dispatchLogs',
    [
      { name: 'eventId', type: 'text' },
      { name: 'userId', type: 'text' },
      { name: 'data', type: 'json' },
    ],
    {
      // Owner-scoped in both directions (matches firestore.rules) — these
      // are raw interaction logs, not something even a shared/org-event
      // dispatcher needs to read or write.
      listRule: OWNER_OR_ADMIN_RULE,
      viewRule: OWNER_OR_ADMIN_RULE,
      createRule: SELF_OWNED_CREATE_RULE,
      updateRule: OWNER_OR_ADMIN_RULE,
      deleteRule: OWNER_OR_ADMIN_RULE,
    },
  );

  // `userId` on `dispatchLogs` — set for deployments where this collection
  // already existed before the field was added above; the app's own query
  // for a user's dispatch logs (Profile > Security) filters on it.
  await ensureField(headers, 'dispatchLogs', { name: 'userId', type: 'text' });

  await ensureCollection(headers, '_storage', [
    { name: 'path', type: 'text', required: true },
    { name: 'file', type: 'file', options: { maxSelect: 1, maxSize: 52428800 } },
  ]);

  await ensureCollection(
    headers,
    'settings',
    [
      { name: 'key', type: 'text', required: true },
      { name: 'list', type: 'json' },
    ],
    {
      // Readable by any authenticated user (needed at event-create time);
      // writable only by admins.
      listRule: '@request.auth.id != ""',
      viewRule: '@request.auth.id != ""',
      createRule: '@request.auth.isAdmin = true',
      updateRule: '@request.auth.isAdmin = true',
      deleteRule: '@request.auth.isAdmin = true',
    },
  );

  // `isAdmin` on the built-in `users` auth collection — grants access to the
  // Profile > Admin section. Grant it per-user via scripts/setAdminPocketbase.js
  // (or the Manage Admins panel, once at least one admin exists).
  await ensureField(headers, 'users', { name: 'isAdmin', type: 'bool' });

  // `dispatchVocabularyPresetId` on `users` — stores the dispatcher's chosen
  // dispatch-language preset (see src/hooks/useDispatchVocabulary.ts). Without
  // this field, PocketBase silently drops it from update requests since it's
  // not in the users schema, which also triggers an authStore refresh (PocketBase
  // auto-syncs authStore on updates to the authenticated user's own record) that
  // immediately reloads the stale preset from the server and undoes the change.
  await ensureField(headers, 'users', { name: 'dispatchVocabularyPresetId', type: 'text' });

  // List/View/Update/Delete on `users` — applied automatically now (used to
  // be a manual admin-UI step, easy to forget on a fresh deployment). See
  // USERS_RULES above for what this closes off and why. Create is
  // deliberately left alone otherwise — PocketBase's own default already
  // allows public sign-up, which this app depends on.
  await ensureRules(headers, 'users', USERS_RULES);

  await ensureTakCollections(headers);

  console.log('\nDone. CrowdCAD collections are ready, with owner/admin-scoped access rules applied automatically.');
  console.log(
    'This script re-applies those rules every time it runs, so a manual change to venues/events/dispatchLogs/users\n' +
      "rules in the admin UI (Collections > <name> > API Rules) will be reverted on the next run — that's by design,\n" +
      'so a deployment can never silently drift away from these guarantees. If you need different rules, this file\n' +
      '(scripts/setup-pocketbase.js) is the place to change them, not the admin UI.',
  );
  console.log(
    "\nForgot-password emails: PocketBase's default reset-password email links to its\n" +
      "own admin UI, not this app. In the admin UI go to Collections > users > Options >\n" +
      'Email templates > Reset password, and change the action URL to:\n' +
      '  {APP_URL}/reset-password?token={TOKEN}\n' +
      "(replace {APP_URL} with your deployed app's URL). Also configure Settings > Mail\n" +
      "settings with real SMTP credentials — without it, PocketBase can't send these\n" +
      'emails at all. Neither of these is set automatically for the same reason as above.',
  );
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
