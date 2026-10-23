#!/usr/bin/env node
/*
Grants (or revokes) admin access for a CrowdCAD user, identified by email, by
setting `isAdmin` on their `users/{uid}` Firestore document.

This is a one-time bootstrap step for the *first* admin on a deployment —
once at least one admin exists, further admins can be granted/revoked from
the "Manage Admins" panel in Profile > Admin.

Usage:
  node scripts/setAdmin.js <email>              # grant admin
  node scripts/setAdmin.js <email> --revoke      # revoke admin

Ensure you have a service account JSON and set `GOOGLE_APPLICATION_CREDENTIALS`.
*/

const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error('Set GOOGLE_APPLICATION_CREDENTIALS to a service account JSON path before running.');
  process.exit(1);
}

const email = process.argv[2];
const revoke = process.argv.includes('--revoke');

if (!email) {
  console.error('Usage: node scripts/setAdmin.js <email> [--revoke]');
  process.exit(1);
}

initializeApp();

async function run() {
  const userRecord = await getAuth().getUserByEmail(email);
  await getFirestore().collection('users').doc(userRecord.uid).set(
    { isAdmin: !revoke },
    { merge: true },
  );
  console.log(`${revoke ? 'Revoked' : 'Granted'} admin access for ${email} (uid: ${userRecord.uid})`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
