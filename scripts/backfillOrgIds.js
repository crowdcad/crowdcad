/*
Simple backfill script to set `orgId` on `events` based on their venue's `orgId`.
Run locally with a service account or using `firebase login` and the Admin SDK.

Usage:
  node scripts/backfillOrgIds.js

Ensure you have a service account JSON and set `GOOGLE_APPLICATION_CREDENTIALS`.
*/

const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error('Set GOOGLE_APPLICATION_CREDENTIALS to a service account JSON path before running.');
  process.exit(1);
}

initializeApp();
const db = getFirestore();

async function run() {
  console.log('Loading venues map...');
  const venuesSnap = await db.collection('venues').get();
  const venueMap = new Map();
  venuesSnap.forEach((d) => {
    const data = d.data();
    if (data && data.orgId) venueMap.set(d.id, data.orgId);
  });

  console.log(`Found ${venueMap.size} venues with orgId`);

  const eventsSnap = await db.collection('events').get();
  console.log(`Scanning ${eventsSnap.size} events`);

  let updated = 0;
  for (const doc of eventsSnap.docs) {
    const e = doc.data();
    if (e.orgId) continue; // already set
    const venueId = e.venueId;
    if (!venueId) continue;
    const orgId = venueMap.get(venueId);
    if (!orgId) continue;

    await db.collection('events').doc(doc.id).update({ orgId });
    updated++;
    if (updated % 50 === 0) console.log(`Updated ${updated} events...`);
  }

  console.log(`Done. Updated ${updated} events.`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
