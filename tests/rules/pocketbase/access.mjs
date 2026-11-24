// Least privilege on PocketBase (#44): the API rules scripts/setup-pocketbase.js applies, checked the way
// tests/rules/access.mjs checks firestore.rules, signing in as each kind of account. Needs a fresh PocketBase
// that the setup script has just set up: run it with npm run test:pocketbase (scripts/scratch-pocketbase.mjs).
const URL = process.env.PB_URL;
const ADMIN = { email: process.env.PB_ADMIN_EMAIL, password: process.env.PB_ADMIN_PASSWORD };
const PASSWORD = 'Passw0rd!rules';

if (!URL || !ADMIN.email || !ADMIN.password) {
  console.error('Run through scripts/scratch-pocketbase.mjs (npm run test:pocketbase): it needs a fresh, set-up PocketBase.');
  process.exit(2);
}

let n = 0, bad = 0;
const expect = (label, ok, got) => {
  n++;
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: ${got}`);
};
const section = (title) => console.log(`-- ${title}`);

async function api(token, method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = token;
  const r = await fetch(`${URL}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // Not JSON.
  }
  return { status: r.status, json };
}

const ok2xx = (s) => s >= 200 && s < 300;
/** A check that the request was allowed (2xx) or refused (anything else). */
const allowed = async (label, req, want) => {
  const { status } = await req;
  expect(label, ok2xx(status) === want, status);
};
/** A check on whether a list shows a record (PocketBase filters lists by the rule instead of refusing them). */
const sees = async (label, token, collection, id, want) => {
  const { status, json } = await api(token, 'GET', `/api/collections/${collection}/records?perPage=200`);
  const found = ok2xx(status) && (json?.items ?? []).some((r) => r.id === id);
  expect(label, found === want, found ? 'listed' : 'not listed');
};

try {
  const su = (await api(null, 'POST', '/api/collections/_superusers/auth-with-password', { identity: ADMIN.email, password: ADMIN.password })).json.token;
  const create = async (collection, data) => {
    const r = await api(su, 'POST', `/api/collections/${collection}/records`, data);
    if (!ok2xx(r.status)) throw new Error(`seed ${collection}: ${r.status} ${JSON.stringify(r.json)}`);
    return r.json.id;
  };
  const account = async (collection, email, extra = {}) => {
    const id = await create(collection, { email, password: PASSWORD, passwordConfirm: PASSWORD, verified: true, ...extra });
    const auth = await api(null, 'POST', `/api/collections/${collection}/auth-with-password`, { identity: email, password: PASSWORD });
    return { id, token: auth.json.token };
  };

  const owner = await account('users', 'owner@x.org');
  const shared = await account('users', 'shared@x.org');
  const stranger = await account('users', 'stranger@x.org');
  const admin = await account('users', 'admin@x.org', { isAdmin: true });

  const event = (extra = {}) => create('events', { name: 'Game', userId: owner.id, sharedWith: ['shared@x.org'], ended: false, ...extra });
  const e1 = await event();
  const eHeld = await event({ legalHold: true });
  const eOrg = await event({ sharedWith: [], isOrgEvent: true });
  const v1 = await create('venues', { name: 'Stadium', userId: owner.id, sharedWith: ['shared@x.org'] });
  const auditE1 = await create('audit', { t: Date.now(), uid: owner.id, actor: 'owner@x.org', action: 'event.create', eventId: e1 });
  const auditOther = await create('audit', { t: Date.now(), uid: admin.id, actor: 'admin@x.org', action: 'admin.grant' });
  await create('settings', { key: 'certifications', list: ['CPR'] });

  section('signed out');
  await allowed("can't view an event", api(null, 'GET', `/api/collections/events/records/${e1}`), false);
  await sees("doesn't list events", null, 'events', e1, false);
  await sees("doesn't list settings", null, 'settings', 'x', false);

  section('events');
  await allowed('owner views', api(owner.token, 'GET', `/api/collections/events/records/${e1}`), true);
  await allowed('shared user views', api(shared.token, 'GET', `/api/collections/events/records/${e1}`), true);
  await allowed('admin views', api(admin.token, 'GET', `/api/collections/events/records/${e1}`), true);
  await allowed("stranger can't view", api(stranger.token, 'GET', `/api/collections/events/records/${e1}`), false);
  await sees("stranger doesn't list it", stranger.token, 'events', e1, false);
  await sees('stranger lists an org event', stranger.token, 'events', eOrg, true);
  await allowed('creates its own event', api(stranger.token, 'POST', '/api/collections/events/records', { name: 'Mine', userId: stranger.id }), true);
  await allowed("can't create one for someone else", api(stranger.token, 'POST', '/api/collections/events/records', { name: 'X', userId: owner.id }), false);
  await allowed('shared user dispatches', api(shared.token, 'PATCH', `/api/collections/events/records/${e1}`, { calls: [] }), true);
  for (const [field, value] of [['userId', shared.id], ['ended', true], ['legalHold', true], ['sharedWith', ['me@x.org']]])
    await allowed(`shared user can't change ${field}`, api(shared.token, 'PATCH', `/api/collections/events/records/${e1}`, { [field]: value }), false);
  await allowed("stranger can't update", api(stranger.token, 'PATCH', `/api/collections/events/records/${e1}`, { calls: [] }), false);
  await allowed("owner can't delete a held event", api(owner.token, 'DELETE', `/api/collections/events/records/${eHeld}`), false);
  await allowed("admin can't delete a held event", api(admin.token, 'DELETE', `/api/collections/events/records/${eHeld}`), false);
  await allowed("shared user can't delete", api(shared.token, 'DELETE', `/api/collections/events/records/${e1}`), false);
  await allowed('owner places a hold', api(owner.token, 'PATCH', `/api/collections/events/records/${e1}`, { legalHold: true }), true);
  await allowed('owner releases it', api(owner.token, 'PATCH', `/api/collections/events/records/${e1}`, { legalHold: false }), true);

  section('venues');
  await allowed('owner views', api(owner.token, 'GET', `/api/collections/venues/records/${v1}`), true);
  await allowed('shared user views', api(shared.token, 'GET', `/api/collections/venues/records/${v1}`), true);
  await allowed("stranger can't view", api(stranger.token, 'GET', `/api/collections/venues/records/${v1}`), false);
  await allowed("shared user can't edit", api(shared.token, 'PATCH', `/api/collections/venues/records/${v1}`, { name: 'x' }), false);

  section('users');
  await allowed("can't view another account", api(stranger.token, 'GET', `/api/collections/users/records/${owner.id}`), false);
  await allowed("can't make itself admin", api(stranger.token, 'PATCH', `/api/collections/users/records/${stranger.id}`, { isAdmin: true }), false);
  await allowed('signing up as admin is refused', api(null, 'POST', '/api/collections/users/records', { email: 'new@x.org', password: PASSWORD, passwordConfirm: PASSWORD, isAdmin: true }), false);

  section('settings');
  await sees('signed-in account lists settings', stranger.token, 'settings', (await api(su, 'GET', '/api/collections/settings/records')).json.items[0].id, true);
  await allowed("non-admin can't write", api(owner.token, 'POST', '/api/collections/settings/records', { key: 'records', value: { deleteEndedAfterDays: 1 } }), false);
  await allowed('admin writes', api(admin.token, 'POST', '/api/collections/settings/records', { id: 'recordretention', key: 'records', value: { deleteEndedAfterDays: 30 } }), true);

  section('audit log');
  await allowed('writes a row as itself', api(stranger.token, 'POST', '/api/collections/audit/records', { t: Date.now(), uid: stranger.id, actor: 'x', action: 'auth.signIn' }), true);
  await allowed("can't write a row as someone else", api(stranger.token, 'POST', '/api/collections/audit/records', { t: Date.now(), uid: owner.id, actor: 'x', action: 'auth.signIn' }), false);
  await sees('admin lists any row', admin.token, 'audit', auditOther, true);
  await sees("event owner lists its event's rows", owner.token, 'audit', auditE1, true);
  await sees("event owner doesn't list other rows", owner.token, 'audit', auditOther, false);
  await sees("shared user doesn't list the event's rows", shared.token, 'audit', auditE1, false);
  await allowed("admin can't edit a row", api(admin.token, 'PATCH', `/api/collections/audit/records/${auditE1}`, { action: 'x' }), false);
  await allowed("admin can't delete a row", api(admin.token, 'DELETE', `/api/collections/audit/records/${auditE1}`), false);

} catch (err) {
  console.error(err);
  bad++;
}
console.log(`${n - bad}/${n} passed`);
process.exit(bad ? 1 : 0);
