// Firestore rules for two-step sign-in (src/lib/securitySettings.ts), against
// the emulator REST API with unsigned tokens. Run: npm run test:rules
const HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const BASE = 'http://' + HOST + '/v1/projects/demo-crowdcad/databases/(default)/documents';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const token = (uid, email, mfa) =>
  `${b64({ alg: 'none', typ: 'JWT' })}.${b64({
    iss: 'https://securetoken.google.com/demo-crowdcad', aud: 'demo-crowdcad', sub: uid, user_id: uid, email,
    iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600, auth_time: Math.floor(Date.now() / 1000),
    firebase: { sign_in_provider: 'password', ...(mfa ? { sign_in_second_factor: 'totp' } : {}) },
  })}.`;
const enc = (v) => {
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (Number.isInteger(v)) return { integerValue: String(v) };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } };
};
const fields = (o) => ({ fields: Object.fromEntries(Object.entries(o).map(([k, v]) => [k, enc(v)])) });
const call = async (auth, method, path, body) => {
  const r = await fetch(`${BASE}/${path}`, { method, headers: { Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return r.status;
};
const asOwner = (method, path, body) => call('owner', method, path, body);
const setPolicy = (mfa) => asOwner('PATCH', 'settings/securitysetting', fields({ key: 'security', value: { idleLockMinutes: 0, mfa } }));

await asOwner('PATCH', 'users/admin1', fields({ isAdmin: true }));
await asOwner('PATCH', 'users/disp1', fields({ isAdmin: false }));
await asOwner('PATCH', 'settings/certs1', fields({ key: 'certifications', list: ['CPR'] }));

const adminNo = token('admin1', 'a@x.org', false), adminYes = token('admin1', 'a@x.org', true);
const dispNo = token('disp1', 'd@x.org', false), dispYes = token('disp1', 'd@x.org', true);
const venue = (uid) => fields({ userId: uid, name: 'v' });
const auditRow = (uid) => fields({ t: Date.now(), uid, actor: 'x', action: 'auth.signIn' });
let n = 0, bad = 0;
const expect = async (label, got, want) => { n++; const ok = (got === 200) === want; if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: ${got}`); };

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
console.log(`${n - bad}/${n} passed`);
process.exit(bad ? 1 : 0);
