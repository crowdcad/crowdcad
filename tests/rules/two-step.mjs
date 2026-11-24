// Firestore rules for two-step sign-in (src/lib/securitySettings.ts), against
// the emulator REST API with unsigned tokens. Run: npm run test:rules
import { call, done, expect, fields, token } from './lib.mjs';

const asOwner = (method, path, body) => call('owner', method, path, body);
const setPolicy = (mfa) => asOwner('PATCH', 'settings/securitysetting', fields({ key: 'security', value: { idleLockMinutes: 0, mfa } }));

await asOwner('PATCH', 'users/admin1', fields({ isAdmin: true }));
await asOwner('PATCH', 'users/disp1', fields({ isAdmin: false }));
await asOwner('PATCH', 'settings/certs1', fields({ key: 'certifications', list: ['CPR'] }));

const adminNo = token('admin1', 'a@x.org', false), adminYes = token('admin1', 'a@x.org', true);
const dispNo = token('disp1', 'd@x.org', false), dispYes = token('disp1', 'd@x.org', true);
const venue = (uid) => fields({ userId: uid, name: 'v' });
const auditRow = (uid) => fields({ t: Date.now(), uid, actor: 'x', action: 'auth.signIn' });

for (const policy of ['none', 'off', 'admins', 'everyone']) {
  if (policy === 'none') await asOwner('DELETE', 'settings/securitysetting'); else await setPolicy(policy);
  console.log(`-- policy ${policy}`);
  const everyone = policy === 'everyone', admins = policy === 'admins' || everyone;
  await expect('dispatcher w/o code creates venue', await call(dispNo, 'POST', 'venues', venue('disp1')), !everyone);
  await expect('dispatcher with code creates venue', await call(dispYes, 'POST', 'venues', venue('disp1')), true);
  await expect('dispatcher w/o code reads own user doc', await call(dispNo, 'GET', 'users/disp1'), true);
  await expect('dispatcher w/o code reads security settings', await call(dispNo, 'GET', 'settings/securitysetting'), policy !== 'none');
  await expect('dispatcher w/o code reads other settings', await call(dispNo, 'GET', 'settings/certs1'), !everyone);
  await expect('dispatcher w/o code writes audit row', await call(dispNo, 'POST', 'audit', auditRow('disp1')), true);
  await expect('admin w/o code reads another user', await call(adminNo, 'GET', 'users/disp1'), !admins);
  await expect('admin with code reads another user', await call(adminYes, 'GET', 'users/disp1'), true);
  await expect('dispatcher with code reads another user', await call(dispYes, 'GET', 'users/admin1'), false);
}
await setPolicy('off');
console.log('-- writing the settings');
const write = (auth, value) => call(auth, 'PATCH', 'settings/securitysetting', fields({ key: 'security', value }));
await expect('admin writes valid settings', await write(adminNo, { idleLockMinutes: 15, mfa: 'admins' }), true);
await expect('admin w/o code can no longer change them', await write(adminNo, { idleLockMinutes: 15, mfa: 'off' }), false);
await expect('admin with code changes them', await write(adminYes, { idleLockMinutes: 30, mfa: 'admins' }), true);
await expect('unknown policy refused', await write(adminYes, { idleLockMinutes: 30, mfa: 'sometimes' }), false);
await expect('extra field refused', await write(adminYes, { idleLockMinutes: 30, mfa: 'off', x: 1 }), false);
await expect('too many minutes refused', await write(adminYes, { idleLockMinutes: 9999, mfa: 'off' }), false);
await expect('dispatcher refused', await write(dispYes, { idleLockMinutes: 0, mfa: 'off' }), false);
await setPolicy('off');
done();
