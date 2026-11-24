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
| [Retention](#retention) | Off: ended events are kept until someone deletes them | Profile > Admin > Records |
| [Legal hold](#legal-hold) | No event held | An event's summary page |
| [Full event record](#full-event-record) | Available to the event's owner and admins | An event's summary page |

## Audit log

Every signed-in account adds rows as it works: sign-in and sign-out, idle-lock unlocks, password and two-step changes, event create/end/delete/export, legal holds, retention deletions, sharing changes, admin grants and security setting changes. Rows hold who, what and when, never patient details. Nobody can edit or delete a row, admins included. Admins see the last 30 days in Profile > Admin > Audit log.

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

## Retention

An admin can turn on deleting ended events a set number of days after they end (1 to 3,650). Deleting an event takes everything kept for it: calls, teams, logs, clinic records and any optional feature's data. Events on legal hold are skipped. Each deletion leaves an audit row (`event.purge`) with the event's name and end date, so you can show what was deleted and when. The rows themselves are never deleted.

Deleting by hand works the same way: the event list's **Delete** removes everything kept for the event, and refuses an event on legal hold.

The purge runs on the server, with the backend's own credentials (on Firebase the Admin SDK, on PocketBase `PB_ADMIN_EMAIL` and `PB_ADMIN_PASSWORD`). An admin can check what's due and delete it from Profile > Admin > Records. To run it on a schedule, set `RECORDS_PURGE_KEY` on the server to a long random value, then have a scheduler send, once a day:

```
POST https://<your app>/api/records
x-records-key: <RECORDS_PURGE_KEY>
content-type: application/json

{"action":"purge"}
```

- **Firebase:** a Cloud Scheduler HTTP job with that method, header and body.
- **PocketBase:** a cron job on the server, for example `17 3 * * * curl -fsS -X POST -H "x-records-key: $RECORDS_PURGE_KEY" -H "content-type: application/json" -d '{"action":"purge"}' https://<your app>/api/records`.

Send `{"action":"purge","dryRun":true}` to get the list without deleting anything.

Retention covers the live database only. Backups and exports keep their own copies until they expire, so set their retention to match.

## Legal hold

The event's owner or an admin can place a legal hold from the event's summary page. While it's on, nobody can delete the event (the database rules refuse it, not just the app), and retention keeps it. Placing and releasing a hold are recorded in the audit log.

## Full event record

The event's owner or an admin can export an event's complete record as one JSON file from its summary page (**Full Record**). It holds the event with every call and its log, every team and its log, the clinic records, the event log and surge history, the event's audit rows, and any optional feature's data for it. Use it for record keeping and records requests. The CSV exports stay the everyday summaries. Each export is recorded in the audit log.

## Deploying for regulated use

CrowdCAD doesn't make a deployment compliant with HIPAA, FERPA, state privacy laws or anything else. If your organization has obligations like these, work through this list with whoever is responsible for them. It covers what CrowdCAD touches, not your whole program.

**Agreements**
- Sign a Business Associate Agreement (or your sector's equivalent) with your hosting provider before any patient data goes in.
- On Firebase, check Google's current list of services covered by its BAA. Check each service you use: the database (Cloud Firestore), sign-in (upgrade to Identity Platform, which two-step sign-in already needs), file storage, and wherever the app runs (Cloud Run, Cloud Functions or Firebase Hosting).
- On PocketBase, the agreement is with whoever runs the server and stores its disks and backups.

**Encryption**
- In transit: serve the app and PocketBase only over HTTPS. Firebase does this already. Put PocketBase behind a TLS reverse proxy.
- At rest: Google encrypts Firestore data at rest. PocketBase keeps its data in SQLite files under `pb_data`, which aren't encrypted by themselves, so put them on an encrypted disk.

**Backups**
- Firebase: turn on Firestore point-in-time recovery, scheduled exports to a Cloud Storage bucket, or both.
- PocketBase: Settings > Backups, with S3-compatible storage.
- Encrypt backup destinations, limit who can reach them, and test a restore.

**Logs**
- CrowdCAD's audit log records changes and exports. For who read what, turn on your backend's logs: Cloud Audit Logs "Data Access" for Firestore, or PocketBase's request logs with a retention you choose (Settings > Logs).

**In the app**
- Two-step sign-in for admins, or everyone.
- The idle lock, with display boards marked.
- A retention period, and legal hold for events under a records request or litigation.
- Someone who reviews the audit log on a schedule.

**Risk analysis.** Write down, for your deployment:

| Question | Your answer |
| --- | --- |
| What patient or student data goes into CrowdCAD, and who can see it? | |
| Where is it stored, and under which agreement? | |
| Who has admin access to the app, the backend console and the backups? | |
| Which devices are used, and are they shared, locked and encrypted? | |
| Which settings above are on, and why are any left off? | |
| How long are events kept, and who places legal holds? | |
| How would you notice and respond to a lost device or a compromised account? | |

**Who does what**

| CrowdCAD (the software) | Your organization |
| --- | --- |
| Access rules in the database, enforced on the server | Choosing who gets accounts and admin rights, and removing them |
| Two-step sign-in, idle lock, audit log, retention, legal hold, full record export | Turning on the settings you need, and writing down why |
| No telemetry; Lite data stays in the browser | Hosting, agreements, encryption, backups and backend logs |
| Security fixes in new releases | Applying updates, training staff, handling incidents |

## What stays with your organization

- Choosing these settings, and writing down why.
- Running your Firebase project or PocketBase server: who can reach it, backups, updates, its own logs, and any agreements your organization needs with the hosting provider.
- Training staff, devices, and what happens to exports and printouts.
- Lite mode: data stays in the browser that created it until someone deletes or exports it. That browser's user is responsible for it.
