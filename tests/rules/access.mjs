// Least privilege (#44): for every collection, each kind of account can read and write only what it
// should. Accounts: the event's owner, someone it's shared with, a member of its organization, a stranger,
// an admin, and a signed-out request. With RULES_DEMO=1 (the hosted site's rules, which add
// demoActive()) an expired demo account is checked too. Run: npm run test:rules
import { call, done, expect, fields, query, section, seed, token, wipe } from './lib.mjs';

const DEMO = process.env.RULES_DEMO === '1';

const owner = token('owner1', 'owner@x.org');
const shared = token('shared1', 'shared@x.org');
const member = token('member1', 'member@x.org');
const stranger = token('stranger1', 'stranger@x.org');
const admin = token('admin1', 'admin@x.org');
const demo = token('demo1', 'demo@x.org');

await wipe('settings/securitysetting');
await seed('users/owner1', { email: 'owner@x.org' });
await seed('users/admin1', { isAdmin: true });
await seed('users/stranger1', { email: 'stranger@x.org' });
if (DEMO) await seed('users/demo1', { isDemo: true, demoExpiresAt: new Date(Date.now() - 86_400_000) });
await seed('organizations/org1', { members: ['owner1', 'member1'] });
await seed('venues/v1', { userId: 'owner1', name: 'Stadium', sharedWith: ['shared@x.org'] });
await seed('venues/vorg', { userId: 'owner1', name: 'Shared', isOrgVenue: true });
const eventDoc = { userId: 'owner1', name: 'Game', sharedWith: ['shared@x.org'], orgId: 'org1', ended: false, calls: [] };
await seed('events/e1', eventDoc);
await seed('events/eheld', { ...eventDoc, legalHold: true });
await seed('dispatchLogs/l1', { userId: 'owner1', eventId: 'e1' });
await seed('audit/a1', { t: 1, uid: 'owner1', actor: 'owner@x.org', action: 'event.create', eventId: 'e1' });
await seed('audit/a2', { t: 2, uid: 'admin1', actor: 'admin@x.org', action: 'admin.grant' });
await seed('settings/certs', { key: 'certifications', list: ['CPR'] });
await seed('dispatchVocabularyPresets/p1', { createdBy: 'owner1', name: 'Mine' });

const patch = (path, data, mask) =>
  [path + (mask ? `?${mask.map((f) => `updateMask.fieldPaths=${f}`).join('&')}` : ''), fields(data)];
const update = (auth, path, data) => call(auth, 'PATCH', ...patch(path, data, Object.keys(data)));

section('signed out');
for (const path of ['events/e1', 'venues/v1', 'users/owner1', 'settings/certs', 'audit/a1', 'dispatchLogs/l1', 'organizations/org1'])
  expect(`signed out can't read ${path}`, await call(null, 'GET', path), false);
expect("signed out can't create an event", await call(null, 'POST', 'events', fields({ userId: 'x', name: 'n' })), false);

section('events');
expect('owner reads', await call(owner, 'GET', 'events/e1'), true);
expect('shared user reads', await call(shared, 'GET', 'events/e1'), true);
expect('org member reads', await call(member, 'GET', 'events/e1'), true);
expect('admin reads', await call(admin, 'GET', 'events/e1'), true);
expect("stranger can't read", await call(stranger, 'GET', 'events/e1'), false);
expect('owner lists own events', await query(owner, 'events', 'userId', 'owner1'), true);
expect("stranger can't list someone else's events", await query(stranger, 'events', 'userId', 'owner1'), false);
expect('creates an event as itself', await call(stranger, 'POST', 'events', fields({ userId: 'stranger1', name: 'Mine' })), true);
expect("can't create an event for someone else", await call(stranger, 'POST', 'events', fields({ userId: 'owner1', name: 'Theirs' })), false);
expect('shared user dispatches', await update(shared, 'events/e1', { calls: [] }), true);
for (const f of ['userId', 'sharedWith', 'ended', 'legalHold']) {
  const value = f === 'sharedWith' ? ['me@x.org'] : f === 'userId' ? 'shared1' : true;
  expect(`shared user can't change ${f}`, await update(shared, 'events/e1', { [f]: value }), false);
}
expect("stranger can't update", await update(stranger, 'events/e1', { calls: [] }), false);
expect('owner places a legal hold', await update(owner, 'events/e1', { legalHold: true, legalHoldAt: Date.now(), legalHoldBy: 'owner@x.org' }), true);
expect("owner can't delete a held event", await call(owner, 'DELETE', 'events/e1'), false);
expect("admin can't delete a held event", await call(admin, 'DELETE', 'events/eheld'), false);
expect('owner releases the hold', await update(owner, 'events/e1', { legalHold: false }), true);
expect("shared user can't delete", await call(shared, 'DELETE', 'events/e1'), false);
expect("stranger can't delete", await call(stranger, 'DELETE', 'events/e1'), false);
expect('owner deletes', await call(owner, 'DELETE', 'events/e1'), true);
await seed('events/e1', eventDoc);

section('venues');
expect('owner reads', await call(owner, 'GET', 'venues/v1'), true);
expect('shared user reads', await call(shared, 'GET', 'venues/v1'), true);
expect('anyone signed in reads an org venue', await call(stranger, 'GET', 'venues/vorg'), true);
expect("stranger can't read", await call(stranger, 'GET', 'venues/v1'), false);
expect("shared user can't edit", await update(shared, 'venues/v1', { name: 'x' }), false);
expect("shared user can't delete", await call(shared, 'DELETE', 'venues/v1'), false);
expect('admin edits', await update(admin, 'venues/v1', { name: 'Stadium' }), true);

section('organizations');
expect('member reads', await call(member, 'GET', 'organizations/org1'), true);
expect("stranger can't read", await call(stranger, 'GET', 'organizations/org1'), false);
expect("stranger can't join by editing", await update(stranger, 'organizations/org1', { members: ['owner1', 'member1', 'stranger1'] }), false);

section('users');
expect('reads own', await call(owner, 'GET', 'users/owner1'), true);
expect("can't read another's", await call(owner, 'GET', 'users/stranger1'), false);
expect("can't make itself admin", await update(stranger, 'users/stranger1', { isAdmin: true }), false);
expect('updates its own profile', await update(stranger, 'users/stranger1', { displayName: 'S' }), true);
expect('admin reads anyone', await call(admin, 'GET', 'users/stranger1'), true);

section('dispatch logs');
expect('owner reads', await call(owner, 'GET', 'dispatchLogs/l1'), true);
expect("shared user can't read", await call(shared, 'GET', 'dispatchLogs/l1'), false);

section('settings');
expect('anyone signed in reads', await call(stranger, 'GET', 'settings/certs'), true);
expect("non-admin can't write", await update(owner, 'settings/certs', { list: [] }), false);
const retention = (value) => call(admin, 'PATCH', 'settings/recordretention', fields({ key: 'records', value }));
expect('admin sets retention', await retention({ deleteEndedAfterDays: 365 }), true);
expect('admin turns retention off', await retention({ deleteEndedAfterDays: 0 }), true);
expect('retention refuses too many days', await retention({ deleteEndedAfterDays: 99999 }), false);
expect('retention refuses an unknown field', await retention({ deleteEndedAfterDays: 30, purgeAll: true }), false);
expect("owner can't set retention", await call(owner, 'PATCH', 'settings/recordretention', fields({ key: 'records', value: { deleteEndedAfterDays: 1 } })), false);

section('audit log');
const row = (uid, extra = {}) => fields({ t: Date.now(), uid, actor: 'x', action: 'auth.signIn', ...extra });
expect('writes a row as itself', await call(stranger, 'POST', 'audit', row('stranger1')), true);
expect("can't write a row as someone else", await call(stranger, 'POST', 'audit', row('owner1')), false);
expect("can't write a backdated row", await call(stranger, 'POST', 'audit', fields({ t: 1, uid: 'stranger1', actor: 'x', action: 'auth.signIn' })), false);
expect("can't add an unknown field", await call(stranger, 'POST', 'audit', row('stranger1', { patient: 'x' })), false);
expect('admin reads any row', await call(admin, 'GET', 'audit/a2'), true);
expect("owner can't read a row about no event", await call(owner, 'GET', 'audit/a2'), false);
expect("event owner reads its event's rows", await call(owner, 'GET', 'audit/a1'), true);
expect("event owner lists its event's rows", await query(owner, 'audit', 'eventId', 'e1'), true);
expect("shared user can't read the event's rows", await call(shared, 'GET', 'audit/a1'), false);
expect("stranger can't list an event's rows", await query(stranger, 'audit', 'eventId', 'e1'), false);
expect("admin can't edit a row", await update(admin, 'audit/a1', { action: 'x' }), false);
expect("admin can't delete a row", await call(admin, 'DELETE', 'audit/a1'), false);

section('dispatch language presets');
expect('anyone signed in reads', await call(stranger, 'GET', 'dispatchVocabularyPresets/p1'), true);
expect("only its creator edits", await update(stranger, 'dispatchVocabularyPresets/p1', { name: 'x' }), false);

if (DEMO) {
  section('expired demo account');
  await seed('events/edemo', { userId: 'demo1', name: 'Demo' });
  expect("can't read its own event", await call(demo, 'GET', 'events/edemo'), false);
  expect("can't create an event", await call(demo, 'POST', 'events', fields({ userId: 'demo1', name: 'n' })), false);
  expect("can't create a venue", await call(demo, 'POST', 'venues', fields({ userId: 'demo1', name: 'n' })), false);
}

done();
