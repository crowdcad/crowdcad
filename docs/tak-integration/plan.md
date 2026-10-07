# TAK integration: plan

**Status: in development.** TAK support is not released. It is a fully optional add-on: events that don't use it behave exactly as before, and the changes to existing core code are kept small and listed below.

This plan covers a prototype that puts team positions from TAK devices (ATAK, iTAK, WinTAK) on the CrowdCAD map, and keeps a privacy-conscious location history.

Related: [data-contract.md](data-contract.md) (collections, fields, rules), [decisions.md](decisions.md) (dated decision log).

## Status

Updated at the end of each phase.

- **P0 Docs and scaffolding: done.** Plan, data contract and decision log are merged. The `tak-bridge` TypeScript scaffold, Docker image and CI are green.
- **P1 CoT inbound: built, waiting on the real-device check.**
  - This is in `crowdcad/tak-bridge` `integration/tak`: the TLS identity from the client `.p12` (the CA is optional, since the `.p12` normally bundles it); `CotStreamSource` on 8089 (pings, idle detection, backoff reconnect); CoT framing and parsing (`a-*` only); log-only mode (`CROWDCAD_BACKEND=none`); and a CoT simulator with a throwaway dev-certificate helper.
  - TLS end-to-end tests against the simulator all pass.
  - **Acceptance:** the real-device check is under [Needs Evan](#needs-evan). Other work continues.
- **P2 Backend writes and rules: done.** Acceptance is met for both backends.
  - **Bridge** (`crowdcad/tak-bridge`): a backend-agnostic `Bridge` service, plus Firebase (client SDK) and PocketBase adapters. It handles sign-in as the bridge account; live docs on more than 10 m of movement or a 60 s heartbeat; bridge and event status every 60 s; a startup sweep of stale live docs; and live-doc cleanup at close.
  - **Core rules** (touchpoint f): the TAK block in `firestore.rules` and the TAK collections and rules in `scripts/setup-pocketbase.js`.
    - Existing rules change only by the bridge exclusion on events and `mapMode` joining the protected fields.
    - The PocketBase setup is verified on a fresh install, a re-run, and an upgrade from `main`'s script.
  - **Tests** (in `tak-bridge` CI, against core's `integration/tak`):
    - **Firestore emulator.** 25 rules cases, including a regression set for the non-TAK rules, plus 4 end-to-end bridge tests. They show writes to unlinked or closed events are rejected, a bridge account cannot read event documents (the patient-data path), revocation works, and live docs update and clear at close.
    - **Local PocketBase.** 11 equivalent tests.
    - **Mutation checks.** Removing the bridge exclusion from either backend's event rules fails the isolation tests.
    - **Simulator budget.** An 8-hour, 20-device event writes 60 to 200 live docs per device-hour.
    - **Core e2e** (Firebase and PocketBase) on the tracking PR covers the existing app flows.
  - **Deferred to P5:** history writes. The rules for history are in place and tested.

- **P3 Align map: done.** The acceptance criterion is met.
  - **`src/features/tak/`.** The first module code, not yet loaded by any page:
    - an affine fit from 3 or more control points, with the estimated error in meters;
    - lat/lon to image-percent projection;
    - an alignment store for both backends;
    - the `AlignMap` component. It renders its own image and captures natural dimensions during alignment. Existing map code, percent positions and the GeoJSON import are untouched.
  - **Acceptance.** On a synthetic rotated, anisotropic map with 2 m control-point noise, held-out known coordinates land within the reported error (5 seeds, 200 points each). With exactly 3 points, the error is reported as unknown.
  - **Tooling:**
    - Touchpoint (h): vitest (`npm run test:unit`), 22 unit tests.
    - Touchpoint (g): the ESLint boundary blocks TAK internals and static value imports of the module from core.
    - Touchpoint (h): a CI job builds with TAK off and on and runs the footprint check. It passes locally, trivially so far, since nothing loads the module yet. It becomes meaningful in P4.
  - **Shared criteria.** The existing map tests (core e2e) and rules tests pass unchanged.
  - **Deferred to P4:** wiring "Align map" into the event TAK panel and event creation.

- **P4 CrowdCAD TAK UI: built. Waiting on the end-to-end check with a real device.**
  - **Touchpoints** (a), (b), (c), (d), (e) and (i) are wired, each as a lazy import gated inline on `NEXT_PUBLIC_TAK === 'on'`:
    - (a) the map overlay slot (markers in the zoomed map, plus a TAK panel as map chrome);
    - (b) the "Map: Standard / TAK live tracking" choice in the event builder;
    - (c) the TAK section in Admin settings: bridges with status, the Add TAK server wizard, "who can use this TAK server", the default history mode, remembered devices, rotate and revoke;
    - (d) end-event closes the TAK config;
    - (e) team ids at all 9 creation sites, with a TAK-only backfill;
    - (i) `next.config.js` always defines the flag.
  - **The TAK panel:**
    - status, and a recording indicator;
    - for the owner: link a bridge, choose the history mode, and align each map;
    - for dispatchers: unassigned devices with auto-link (remembered mapping, then a unique case- and space-insensitive callsign match) and a team dropdown;
    - linked devices.
  - **Tests:** 44 core unit tests. They include the team-id source audit (new teams get ids, and updates keep them; both were mutation-checked), plus linking, team positions, backfill scope and credentials.
  - **Footprint against `main`:**
    - A build without the flag contains no TAK code.
    - `/profile` and the dispatch page's first-load JS are unchanged.
    - The create pages grow by 10 to 20 bytes, for team-id generation.
    - With the flag on, TAK lives only in one lazy chunk.
  - **Browser smoke test** (Chromium, with `NEXT_PUBLIC_TAK=on`, against the Firebase emulators and the real rules): 6 of 6 steps pass, with no console errors. It covered:
    - signing in;
    - the Admin TAK section rendering;
    - the Add TAK server wizard creating a bridge account and record, and showing the `.env` block;
    - a TAK event's dispatch map showing the TAK panel;
    - linking the bridge from the panel (the config is stored, and the switch and pill update);
    - the event builder offering TAK to an allowed user.

    It found and fixed two defects: bridge creation ignored the Auth emulator, and the map-mode radio selection was invisible in the dark theme.
  - **Not yet done:**
    - A real device, end to end (see [Needs Evan](#needs-evan)).
    - Hosted bridge creation stays open (D24).

## Needs Evan

### P1: phone position in the bridge logs (real TAK Server)

The bridge runs with your real `.p12`. Run these steps yourself; the certificate and its password stay on your machine.

1. **Create the bridge's TAK user.** In TAK Portal, create a user for the bridge (for example `crowdcad-bridge`). Add it to the same TAK group your phone's user is in, then download its certificate bundle (`.p12`) and note the password.
2. **On a machine that can reach the TAK Server's port 8089** (the infra-TAK host is simplest):
   ```bash
   git clone https://github.com/crowdcad/tak-bridge.git
   cd tak-bridge
   git checkout integration/tak
   mkdir certs
   cp /path/to/crowdcad-bridge.p12 certs/client.p12
   chmod 644 certs/client.p12
   cp .env.example .env
   ```
3. **Edit `.env`:**
   - `TAK_HOST`: the TAK Server hostname, as it appears in its certificate.
   - `TAK_CLIENT_P12_PASSWORD`: the bundle's password.
   - `CROWDCAD_BACKEND=none`.

   Leave the other values as they are. Add `TAK_CA` only if step 5 shows a certificate verification error.
4. **Start it:** `docker compose up -d --build`, then `docker compose logs -f`. Expect `"msg":"connected to TAK Server"`.
5. **Send positions from the phone.** On the phone (ATAK or iTAK, connected to the same server and group), set the location reporting interval to a few seconds, or move around. Each report should appear within 5 s as a `"msg":"position"` line with the phone's callsign. Compare the line's `time` (when the bridge logged it) with its `deviceTime` (when the phone reported).
6. **Report the result.** Report pass or fail, plus any error lines. You don't need to share coordinates. Stop it with `docker compose down`.

**If something goes wrong:**
- **"password ... is wrong":** check `TAK_CLIENT_P12_PASSWORD`.
- **"legacy encryption":** follow the conversion command in the message, or add `NODE_OPTIONS=--openssl-legacy-provider` to `.env`.
- **Certificate verification errors** (`UNABLE_TO_VERIFY_LEAF_SIGNATURE`, `SELF_SIGNED_CERT_IN_CHAIN`): export the TAK Server CA as PEM to `certs/ca.pem` and set `TAK_CA=/certs/ca.pem`.
- **`ERR_TLS_CERT_ALTNAME_INVALID`:** set `TAK_SERVER_NAME` to the name in the server certificate.
- **Connected but no positions:** the bridge user is probably not in the phone's group.

### P4: end to end with a real device (emulator or a dev Firebase project)

This uses your real `.p12` on the bridge side. Run it yourself; nothing here touches production.

1. **Start the backend and app.** Run the Firebase emulators from a `crowdcad/crowdcad` checkout on `integration/tak` (`npx firebase emulators:start --only auth,firestore --project demo-crowdcad`). Start the app against them with TAK on: `NEXT_PUBLIC_TAK=on`, plus the emulator variables from `npm run test:e2e:serve`. A dev Firebase project with `NEXT_PUBLIC_TAK=on` also works.
2. **Make yourself an admin.** Sign up, then set `isAdmin: true` on your `users/{uid}` doc (emulator UI, or `scripts/setAdmin.js` against the dev project).
3. **Create the bridge.** Go to Profile > Admin > TAK > Add TAK server and follow the wizard. Copy the `.env` block.
4. **Run the bridge.** On the machine running the bridge, use the `.env` block plus the TAK section from the P1 steps. Set `CROWDCAD_BACKEND=firebase`, and add `FIRESTORE_EMULATOR_HOST` and `FIREBASE_AUTH_EMULATOR_HOST` if you're using the emulator. Then `docker compose up -d --build`. The wizard should show "Connected".
5. **Set up an event.**
   1. Create an event and choose **Map: TAK live tracking**, with the bridge preselected.
   2. Add a team whose name matches your phone's callsign.
   3. Align the map with 4 or more points you can find on the ground.
6. **Check the dispatch map.** On the dispatch page's Map tab, the TAK pill should show the device. It should auto-link to the team (or appear under "Unassigned TAK devices" if the names differ), and your position should appear on the aligned map.
7. **End the event.** Within a minute, the event's `takLive` docs should be gone.
8. **Report** pass or fail per step, plus any console errors. You don't need to share coordinates.

## Scope

**v1 (this plan):** inbound only. The bridge reads device positions from a TAK Server and writes them to CrowdCAD.

**Later:**
- v1.1: CrowdCAD posts published as static CoT markers, for aligned maps.
- TAK-CAD status, through a `TakCadPollerSource`.
- Outbound team positions, map overlays and calls. Calls stay out because of patient information.
- MapLibre basemaps.
- Device-side claiming of teams.

**Constraints:**
- Standard events do not change: no new UI on their pages, no TAK code loaded, no TAK reads or writes.
- Firebase stays the default backend and PocketBase is opt-in. The bridge supports both through one adapter interface.
- CrowdCAD works without TAK and without TAK-CAD.
- The bridge never reads event documents (see [data-contract.md](data-contract.md#principles)).
- No prototype work touches a production Firebase project. Rules and data are developed against the Firebase Emulator Suite, `@firebase/rules-unit-testing` and a local PocketBase.

## Isolation

**One feature module.** All TAK UI and logic lives in `src/features/tak/`. Its only public entry is `src/features/tak/index.ts`, which exports the module's components and functions.

**Imports.**
- Core code loads the module with a dynamic import (`import('@/features/tak')`, or `next/dynamic` for components). It does so only:
  - when an event has `mapMode === 'tak'`;
  - in the Admin settings TAK section;
  - in the event-creation map choice.
- Static imports from core are limited to `import type` from the entry.
- An ESLint `no-restricted-imports` rule in `eslint.config.mjs` blocks imports of `@/features/tak/*` internals from outside `src/features/tak/`. Only the entry itself may be imported.

**Standard events.**
- Detection needs no extra read, because it uses `event.mapMode`, a field on the event document the page already loads. Standard events don't have the field.
- Event pages for standard events must not load the TAK chunk.

**Existing map logic stays untouched.** That covers rendering, percent positions, and the GeoJSON linear lat/lng mapping. Georeferencing is an "Align map" step inside the TAK module. It is stored in a separate optional record per event map layer (`takMapAlignment`), and only TAK and heat-map code reads it. The image's natural dimensions are captured during alignment, not in the existing upload flow.

## Core touchpoints

These are every existing core file the TAK work changes. **Anything not on this list needs maintainer approval first.**

| # | Touchpoint | Files | Change |
|---|---|---|---|
| a | Map overlay slot | `src/components/modals/event/venuemapmodal.tsx`, `src/components/dispatch/venuemaptab.tsx`, `src/app/(main)/events/[eventId]/dispatch/page.tsx` | `VenueMapWithPosts` gains an optional `overlay` render prop, drawn inside the transformed map container with `{ layer, rect, scale }`. `VenueMapTab` passes it through. The dispatch page supplies it only when `mapMode === 'tak'`, from the lazily loaded module. Without the prop, nothing renders differently |
| b | Map-mode choice in event creation and editing | `src/app/(main)/events/[eventId]/create/page.tsx`, `src/app/types.ts` | One lazily loaded `TakMapModeChoice` in the Event Configuration step: "Map: Standard (default) / TAK live tracking". Stored as optional `Event.mapMode?: 'standard' \| 'tak'`, which is unset for standard events. The create page already handles editing, so the same control changes it later |
| c | Settings entry | `src/components/profile/admin-section.tsx` | One lazily loaded `TakAdminSection` in the existing Admin area of `/profile` (see [Settings](#settings)) |
| d | End-event flow | `src/app/(main)/events/[eventId]/dispatch/page.tsx` (the `ended: true` update, line ~2892) | When `mapMode === 'tak'`, after the event ends, call the module's `onEventEnded(eventId)`, which sets `closed: true` on `takConfig` |
| e | Team ids | `src/app/types.ts`, plus the 9 creation sites below and a new `src/lib/teamId.ts` | Optional `id` on `Staff` and `Supervisor`, generated at creation from now on. Core code outside TAK never reads it |
| f | Rules | `firestore.rules`, `scripts/setup-pocketbase.js`, `tests/e2e/pb_migrations/*` | One isolated, commented block of TAK rules; `!isBridge()` on event reads; `mapMode` added to the protected event fields |
| g | Import boundary (requested) | `eslint.config.mjs` | The `no-restricted-imports` rule above |

**Team-id creation sites**, each to call `newTeamId()`:
- `create/page.tsx:310` (team) and `:334` (supervisor)
- `components/modals/event/bulkimportmodal.tsx` (teams and supervisors)
- `dispatch/page.tsx:516` (test teams), `:638` (supervisor) and `:761` (team)
- `lite/create/page.tsx:437` (team) and `:459` (supervisor)

**Approved additions (D26, D27):**
- **`Event.mapMode`** (part of b): optional, `'standard' | 'tak'`, and missing means `'standard'`. Core reads it only to decide whether to load the TAK module.
- **`NEXT_PUBLIC_TAK`:** TAK is compiled in only when the value is exactly `"on"`. Otherwise the three lazy entry points are compiled out, and the creation page's query for allowed bridges is skipped. It is documented next to `NEXT_PUBLIC_BACKEND` in `.env.example` and `docs/DEPLOYMENT.md`. Gating the entry points on the flag is part of touchpoints (a) to (d).

## Team-id audit (2026-10-06)

Every code path that creates or edits `Staff` and `Supervisor` objects was checked.

**Edits preserve unknown fields.** Every edit, status, location, assignment, rename and log update spreads the existing object (`{ ...s, ... }`), so an `id` survives. That includes:
- `dispatch/page.tsx`, including the renames at `:819` (team) and `:707` (supervisor)
- `components/dispatch/calltracking.tsx`, `calltrackingcard.tsx` and `teamcardparts.tsx`
- `components/modals/event/quickcallmodal.tsx`
- `create/page.tsx:307` and `lite/create/page.tsx:425` (team edit)
- `lib/liteEventStore.ts`

`lib/liteEventAdapters.ts` passes `staff` and `supervisor` through unchanged. `lib/analyticsUtils.ts` builds derived objects that are never stored.

**No path rebuilds a team from scratch on edit**, so no fix is needed there.

**Creation sites** (9, listed above) build new objects and must generate an `id`.

**Storage:** Firestore, PocketBase (JSON fields) and Lite's IndexedDB all store the arrays as they are.

**Backfill:** only for events with TAK enabled. The TAK module assigns ids to teams that lack one, in one event write, when TAK is turned on for an event, or when its TAK panel first loads.

**Acceptance:**
- Existing events load unchanged.
- Editing or renaming a team keeps its id.
- Unit tests cover creation, edit, rename, status and location updates, and the backfill.

## Settings

The app's in-app settings area is **`/profile`** (`src/app/profile/page.tsx`, also served by the hosted site). It stacks sections: Profile info, Security, Preferences and Admin. It has no tabs.
- Any signed-in user can open `/profile`.
- The **Admin** area (`src/components/profile/admin-section.tsx`) renders only when the user's `users/{uid}.isAdmin` is true (`useAdmin`).
- Admins are set by `scripts/setAdmin.js` or `setAdminPocketbase.js`, or by an existing admin in Admin > users.

TAK setup is a **TAK** section inside that Admin area, the equivalent of a tab there, so only admins see it:
- **Self-hosted:** the instance's admins act as the organization's admins. Nothing else changes.
- **Hosted:** site admins create TAK servers on behalf of agencies.

**Contents of the TAK section:**
- **Bridge list:** name, status from the heartbeat, and last seen.
- **Add TAK server wizard:**
  1. Name the server.
  2. Create the TAK Portal bridge user, add it to the responders' groups, and download its `.p12` (instructions).
  3. Generate credentials, then show the `.env` block once, with a `docker-compose.yml` snippet.
  4. Wait for the first heartbeat, then show "Connected".
- **Who can use this TAK server:** the `allowedUsers` list, with users chosen by email.
- **Remembered device mappings.**
- **Default history mode.**
- **Rotate and revoke.**

Only admins can create, edit, rotate or revoke bridges, or change `allowedUsers`.

## Event creation

The Event Configuration step gains one choice: **"Map: Standard (default) / TAK live tracking"**.

- The TAK option lists only the bridges the current user is in `allowedUsers` for:
  - **None:** the option is disabled, with the note "Ask your admin to set up TAK".
  - **Exactly one:** it is preselected when TAK is chosen.
- **Choosing TAK** shows the history mode (default: the bridge's default, normally Summary) and offers "Align map now or later".
- **Changing it later:** the choice can be changed while editing the event.
- **Linking rule:** an event owner can link a bridge only if they are in its `allowedUsers`. The rules enforce this.
- **Standard stays the default.** Standard events write no TAK data and have no `mapMode` field.

## Architecture

```
TAK devices --TLS CoT--> TAK Server (8089) --TLS CoT--> tak-bridge (Docker, on the TAK host)
                                                             |
                                       client SDK, bridge account, rules enforced
                                                             v
                                         Firebase (default) or PocketBase
                                                             |
                                                  realtime subscriptions
                                                             v
                                CrowdCAD (src/features/tak, loaded only for TAK events)
```

**`crowdcad/tak-bridge`:**
- **TLS identity module.** Loads the client `.p12` and the TAK Server CA once.
- **`InboundSource` interface.** v1 implements `CotStreamSource` (8089, framed and parsed with `fast-xml-parser`). `TakCadPollerSource` (REST on 8443, 15 s polling, same TLS identity) is a documented stub. Handlers are keyed by CoT type prefix: `a-*` is a position. Pins (`b-m-p-*`), chat (`b-t-*`) and tasking (`t-*`) are ignored in v1.
- **Backend adapter.** Firebase (client SDK in Node) and PocketBase.
- **Aggregator.** Per (device, team) segment: 5-minute windows, the heat-map grid and detailed points.
- **Outbound,** when it comes, goes over 8089 only. TAK Server has no REST endpoint for injecting CoT.

### Bridge account flow

1. **TAK Portal (infra-TAK).** Create a `crowdcad-bridge` user, add it to the responders' groups, and download its `.p12` and password.
2. **CrowdCAD: Admin > TAK > Add TAK server.**
   - **Firebase:** a secondary Firebase app with in-memory auth persistence calls `createUserWithEmailAndPassword` for `<id>@bridge.crowdcad.org`, with a password CrowdCAD generates. The secondary app is then signed out and deleted, and the admin writes `bridgeAccounts/{bridgeUid}`.
   - **PocketBase:** an admin creates a user record with `role = 'bridge'`, which doesn't change the admin's session.
   - CrowdCAD shows the `.env` block once and never stores the password.
3. **On the TAK host:** add the certificates, paste the `.env` block, and run `docker compose up -d`.
4. **Connected:** CrowdCAD shows "Connected" when the heartbeat arrives.

- **Rotation:** add a new bridge, switch the events to it, then revoke the old one.
- **Revocation:** delete the bridge record. The rules check it on every write.

### Device linking

- Devices are keyed on TAK UID; the callsign is what's displayed.
- **Auto-link** runs in the dispatcher's browser: a callsign that matches a team name, ignoring case and spaces, is linked to that team's `teamId`.
- Unmatched devices appear under **Unassigned TAK devices**, with a team dropdown.
- **Remembered mappings** (device to team name) are kept per bridge and pre-link devices at the next event.
- A team can have several devices; its position is the most recent fix.
- Devices can be reassigned mid-event. History is credited by time, per (device, team) segment.

## Phases

Each phase ends with a PR into `integration/tak` that a maintainer approves. `integration/tak` merges into `main` only with maintainer approval.

**Applies to P3 to P5:**
- The existing map tests and rules tests pass unchanged.
- A standard event's network and bundle footprint is unchanged.
  - **Bundle:** the dispatch and summary route chunks for a standard event contain no TAK module code. This is checked against the `next build` output, by searching for a marker string exported only by `src/features/tak`.
  - **Network:** no TAK collection reads or writes for a standard event. This is checked with a test that loads a standard event with the TAK entry mocked, and asserts that it is never imported.

### P0: Docs and scaffolding (done)
- These documents.
- The `crowdcad/tak-bridge` TypeScript scaffold, Docker setup and CI.

### P1: CoT inbound (bridge repo only)
- The TLS identity module loads the `.p12` and CA.
- `CotStreamSource` connects to 8089, reconnects with backoff, and frames the CoT stream.
- Events are parsed with `fast-xml-parser`, and the bridge logs `uid`, `callsign`, `lat`, `lon` and `time` for `a-*` events.
- Unit tests cover framing (split and concatenated events), parsing, and type filtering.

**Accept:** a real device's position on a test TAK Server appears in the bridge logs within 5 s.

### P2: Backend writes and rules
- Firebase and PocketBase adapters.
- Bridge sign-in, heartbeat and status.
- Live device docs, written on more than 10 m of movement or a 60 s heartbeat.
- Startup sweep and close handling.
- **Rules (touchpoint f):** Firestore, with `@firebase/rules-unit-testing`; PocketBase, in the setup script and migrations, with tests.
- **Tests for the rules:**
  - Writes to unlinked or closed events are rejected.
  - A bridge account cannot read event documents.
  - A bridge account cannot create or edit bridge records, TAK config or device links.
  - Only users in `allowedUsers` can link a bridge.
  - Only admins can manage bridges.
  - History is owner-only.

**Accept:** emulator and local PocketBase tests prove that writes to unlinked events and patient-data reads are rejected, and that live docs update. The existing rules tests pass unchanged.

### P3: Align map (inside the TAK module)
- An "Align map" step: place at least 3 control points on the event map image, fit an affine transform, and show the residual error in meters.
- Natural image dimensions are captured during alignment.
- Stored in `takMapAlignment` per event map layer.
- Lat/lon to image-percent projection helpers.
- Optionally reuse an alignment from another event that uses the same map image.

**Accept:**
- A test map places known coordinates within the reported error.
- Existing maps, percent positions and the GeoJSON import are unchanged.
- The shared criteria above hold.

### P4: CrowdCAD TAK UI
- **Admin > TAK section:** bridge list, Add TAK server wizard, `allowedUsers`, remembered mappings, default history mode, rotate and revoke (touchpoint c).
- **Event creation:** the map-mode choice (touchpoint b).
- **The TAK panel on TAK events:** status, history mode, "Align map", and unassigned devices with auto-match and a team dropdown.
- **Live team positions** through the map overlay slot (touchpoint a), with a recording indicator.
- **End-event step** (touchpoint d).
- **Team-id creation** and TAK-only backfill (touchpoint e).

**Accept:**
- Works end to end with a real device against the emulator or a dev Firebase project.
- The team-id tests pass.
- The shared criteria above hold.

### P5: History and end-of-event view
- The bridge aggregates per-segment 5-minute windows and a sparse heat-map grid (about 5 m cells).
- Detailed mode adds 15 s points while a team is on a call.
- Cleanup at close.
- An owner-only end-of-event view: heat map, time on post, distance, coverage gaps.

**Accept:**
- A simulated 8-hour, 20-device event stays within the planned write and size budgets (set in this phase).
- The shared criteria above hold.

### P6: Packaging
- A GHCR image (`ghcr.io/crowdcad/tak-bridge`) built on version tags.
- An infra-TAK setup guide.
- A PocketBase parity check.

### Later
- v1.1: posts as static CoT markers over 8089.
- `TakCadPollerSource`. The bridge's TAK user may need TAK-CAD permissions.

## Branches

- **Integration branches:** `integration/tak` in both `crowdcad/crowdcad` and `crowdcad/tak-bridge`. A draft tracking PR from `integration/tak` to `main` stays open per repo, and is never merged without maintainer approval.
- **Topic branches:** off `integration/tak`, each merged by an approved PR.
- **Keeping current:** `main` is merged into `integration/tak` periodically. `integration/tak` is never rebased.
- **Commits:** every commit is signed off (`git commit -s`) for DCO.

## Open items

- **Hosted bridge-account creation.**
  - Client-side creation needs email/password sign-up enabled in Firebase Authentication. If a project disables it, `createUserWithEmailAndPassword` fails with `auth/admin-restricted-operation`.
  - For a hosted deployment with sign-up disabled, the maintainer chooses before P4 between a server-side creation function and manual creation for hosted users. Public sign-up is not re-enabled for this.
  - The prototype uses the emulator.
- **Organizations.** There is no organization model. `allowedUsers` stands in for one (see D19). A real organization concept is a separate future decision, needed if hosted agencies want self-serve TAK setup.
- **Roles.** v1 history is owner-only. A read-only viewer role, or a dispatcher role that can see history, is future work.
- **TAK-CAD API documentation:** pending.
- **One rules source.** Deployments that keep their own copy of the security rules must port the TAK rules when they adopt this feature. Long term, rules should be deployed from one source.
- **PocketBase read access.** The `venues` and `events` read rules and the exact `sharedWith` match need tightening (tracked separately). TAK rules that build on event visibility depend on it.
