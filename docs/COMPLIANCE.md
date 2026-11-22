# Security settings and your risk assessment

CrowdCAD is software your organization runs on its own Firebase project or PocketBase server. It isn't certified under HIPAA or any other law, and using it doesn't make an organization compliant with anything. What it gives you is a set of controls. Your organization decides which ones it needs, in its own risk assessment, and is responsible for how it runs and uses them.

Most of these settings are off until an admin turns them on, because the right answer depends on how you work. A staffed, secured command post with a team map on the wall needs different settings from laptops carried around a public venue.

## The controls

| Control | Default | Where |
| --- | --- | --- |
| [Audit log](#audit-log) | Always on for signed-in accounts | Profile > Admin > Audit log |
| [Idle lock](#idle-lock-and-display-boards) | Off | Profile > Admin > Security |
| [Display boards](#idle-lock-and-display-boards) | No browser marked | Profile > Admin > Security, per browser |
| [Two-step sign-in](#two-step-sign-in) | Off | Profile > Admin > Security; each person in Profile > Security |
| Security headers and Content Security Policy | Sent; the policy only reports until `CSP_ENFORCE=on` | `.env`, see [SECURITY.md](../SECURITY.md) |
| No telemetry | Nothing is sent to CrowdCAD or analytics services | [SECURITY.md](../SECURITY.md#no-telemetry) |
| Lite mode | No account; data stays in that browser until deleted or exported | `/lite` |

## Audit log

Every signed-in account adds rows as it works: sign-in and sign-out, idle-lock unlocks, password and two-step changes, event create/end/delete/export, sharing changes, admin grants and security setting changes. Rows hold who, what and when, never patient details. Nobody can edit or delete a row, admins included. Admins see the last 30 days in Profile > Admin > Audit log.

The log doesn't record who viewed what. For reads, turn on your backend's own logs: on Firebase, Cloud Audit Logs "Data Access" for Firestore (Google Cloud console > IAM & Admin > Audit Logs); on PocketBase, its request logs (Settings > Logs).

## Idle lock and display boards

With the idle lock on, a signed-in dispatch page covers itself after the minutes you set without any input, and asks for the password (and the two-step code, if the account has one) again. Data keeps updating underneath, so nothing is missed. Reloading the page or opening a new tab doesn't get around it. "Sign out instead" ends the session.

A **display board** is a browser an admin has marked, in Profile > Admin > Security, as a screen in a staffed, secured area, such as a team map on a command-post wall. The idle lock never covers it. The mark belongs to that browser only, and turning it on or off is recorded in the audit log.

If your organization is subject to HIPAA, note that its automatic-logoff specification (45 CFR 164.312(a)(2)(iii)) is "addressable" and names no time limit. Your risk assessment decides whether you need a lock and how long it waits. If you decide you don't, write down why, for example that dispatch positions are always staffed and in a secured area.

## Two-step sign-in

After their password, people enter a code:

- **Firebase:** a code from an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password and the like).
- **PocketBase:** a code sent to their email.

Choose who must use it in Profile > Admin > Security: **Off**, **Admins only**, or **Everyone** (admins and dispatchers). People are asked when they sign in on a new device or after signing out, not every time they open the app. On Firebase, anyone can also add an app to their own account in Profile > Security, even when it isn't required.


The database enforces it, not just the app. On Firebase, the Firestore rules refuse a session that didn't sign in with its code. With "Admins only", an admin without it keeps dispatcher access but loses admin powers. On PocketBase, the server won't issue a session without the emailed code, so the setting applies at each person's next sign-in.

To prevent a lockout, an admin can only turn it on after using it themselves in that session: on Firebase by setting up an app and confirming a code, on PocketBase by receiving a test code.

### Setting up Firebase

Authenticator apps need the project upgraded to Firebase Authentication with Identity Platform, then turned on once:

1. Firebase console > Authentication > Settings > Upgrade to Identity Platform. It has a free tier for email sign-in, but the project needs billing enabled. Check current pricing for your project before upgrading.
2. With a service account: `GOOGLE_APPLICATION_CREDENTIALS=key.json node scripts/enableTotp.js`
3. In the app: set up your own app in Profile > Security, then choose who must use it in Profile > Admin > Security.

Firebase only lets a verified email set up an app. The setup screen offers to send the verification link.

**Lost phone:** `node scripts/resetTwoStep.js <email>` removes that person's app and signs them out everywhere. They set up a new one on their next visit.

### Setting up PocketBase

1. Set up email in the PocketBase admin UI (Settings > Mail settings), with real SMTP credentials.
2. Run `node scripts/setup-pocketbase.js` (it adds the rule that follows the setting).
3. In the app: Profile > Admin > Security, send yourself a test code, then choose who must use it.

**If email stops working** while codes are required, a PocketBase superuser can open the `settings` collection in the admin UI and set the `securitysetting` record's `value.mfa` to `"off"`.

## What stays with your organization

- Choosing these settings, and writing down why.
- Running your Firebase project or PocketBase server: who can reach it, backups, updates, its own logs, and any agreements your organization needs with the hosting provider.
- Training staff, devices, and what happens to exports and printouts.
- Lite mode: data stays in the browser that created it until someone deletes or exports it. That browser's user is responsible for it.
