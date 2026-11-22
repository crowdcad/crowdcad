#!/usr/bin/env node
/*
Removes a person's authenticator app (Firebase), for when they've lost their
phone. On their next visit, if the organization requires two-step sign-in,
they're asked to set up a new one. Record why in your own records; the
person's next sign-in and new setup appear in the audit log.

PocketBase sends codes by email, so there's nothing to reset there. If email
stops working while two-step sign-in is required, a PocketBase superuser can
open the settings collection in the admin UI and set the
`securitysetting` record's value.mfa to "off".

Usage:
  node scripts/resetTwoStep.js <email>

Ensure you have a service account JSON and set `GOOGLE_APPLICATION_CREDENTIALS`.
*/

const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error('Set GOOGLE_APPLICATION_CREDENTIALS to a service account JSON path before running.');
  process.exit(1);
}

const email = process.argv[2];
if (!email) {
  console.error('Usage: node scripts/resetTwoStep.js <email>');
  process.exit(1);
}

initializeApp();

async function run() {
  const auth = getAuth();
  const user = await auth.getUserByEmail(email);
  await auth.updateUser(user.uid, { multiFactor: { enrolledFactors: null } });
  // End their existing sessions too, so a lost phone or laptop stays signed out.
  await auth.revokeRefreshTokens(user.uid);
  console.log(`Removed the authenticator app for ${email} and signed them out everywhere.`);
}

run().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
