// Shared helpers for the Firestore rules tests: the emulator REST API with unsigned tokens.
// Every other .mjs file here is a test that run.mjs runs (npm run test:rules).
const HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const PROJECT = 'demo-crowdcad';
const BASE = `http://${HOST}/v1/projects/${PROJECT}/databases/(default)/documents`;
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

/** An ID token for `uid` (no signature: the emulator doesn't check it). `mfa` adds a second step. */
export const token = (uid, email, mfa = false) =>
  `${b64({ alg: 'none', typ: 'JWT' })}.${b64({
    iss: `https://securetoken.google.com/${PROJECT}`, aud: PROJECT, sub: uid, user_id: uid, email,
    iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600, auth_time: Math.floor(Date.now() / 1000),
    firebase: { sign_in_provider: 'password', ...(mfa ? { sign_in_second_factor: 'totp' } : {}) },
  })}.`;

const enc = (v) => {
  if (v === null) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (Number.isInteger(v)) return { integerValue: String(v) };
  if (typeof v === 'number') return { doubleValue: v };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } };
};

/** A document body for the REST API. */
export const fields = (o) => ({ fields: Object.fromEntries(Object.entries(o).map(([k, v]) => [k, enc(v)])) });

/** One request; returns the HTTP status. `auth` is a token, 'owner' (bypasses rules) or null (signed out). */
export const call = async (auth, method, path, body) => {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) headers.Authorization = `Bearer ${auth}`;
  const r = await fetch(`${BASE}/${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return r.status;
};

/** Writes as the emulator's owner, past the rules (test setup). */
export const seed = (path, data) => call('owner', 'PATCH', path, fields(data));
export const wipe = (path) => call('owner', 'DELETE', path);

/** A structured query (a list) under `parent` ('' for the root), filtered on `field <op> value` (EQUAL, ARRAY_CONTAINS). */
export const query = async (auth, collection, field, value, parent = '', op = 'EQUAL') => {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) headers.Authorization = `Bearer ${auth}`;
  const where = { fieldFilter: { field: { fieldPath: field }, op, value: enc(value) } };
  const r = await fetch(`${BASE}${parent ? `/${parent}` : ''}:runQuery`, {
    method: 'POST', headers, body: JSON.stringify({ structuredQuery: { from: [{ collectionId: collection }], where } }),
  });
  return r.status;
};

let n = 0, bad = 0;
/** Records one check: `got` is a status, `want` whether it should be allowed. */
export const expect = (label, got, want) => {
  n++;
  const ok = (got === 200) === want;
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: ${got}`);
};
export const section = (title) => console.log(`-- ${title}`);
/** Prints the tally and exits non-zero on any failure. */
export const done = () => {
  console.log(`${n - bad}/${n} passed`);
  process.exit(bad ? 1 : 0);
};
