#!/usr/bin/env node
/*
Turns on authenticator apps (TOTP) as a second sign-in step for this Firebase
project, so two-step sign-in (Profile > Admin > Security) can be used. Run it
once per project. Nothing changes for anyone until an admin chooses who must
use it in the app.

Before running:
  1. Upgrade the project to Firebase Authentication with Identity Platform
     (Firebase console > Authentication > Settings > Upgrade). It has a free
     tier for email sign-in, but the project needs billing enabled.
  2. Set GOOGLE_APPLICATION_CREDENTIALS to a service account JSON path.

Usage:
  node scripts/enableTotp.js            # turn on
  node scripts/enableTotp.js --disable  # turn off (people with an app set up
                                        # then can't sign in with it; set the
                                        # app's policy to Off first)
*/

const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error('Set GOOGLE_APPLICATION_CREDENTIALS to a service account JSON path before running.');
  process.exit(1);
}

const disable = process.argv.includes('--disable');

initializeApp();

async function run() {
  await getAuth()
    .projectConfigManager()
    .updateProjectConfig({
      multiFactorConfig: {
        state: disable ? 'DISABLED' : 'ENABLED',
        providerConfigs: [
          {
            state: disable ? 'DISABLED' : 'ENABLED',
            // Accept the code from one 30-second step either side, for phone clocks that drift.
            totpProviderConfig: { adjacentIntervals: 1 },
          },
        ],
      },
    });
  console.log(
    disable
      ? 'Authenticator apps are turned off for this project.'
      : 'Authenticator apps are turned on. People can now set one up in Profile > Security, and admins can require them in Profile > Admin > Security.',
  );
}

run().catch((err) => {
  console.error(err.message || err);
  if (/identity platform|CONFIGURATION_NOT_FOUND|billing/i.test(String(err.message))) {
    console.error('Upgrade the project to Identity Platform first (see the top of this file).');
  }
  process.exit(1);
});
