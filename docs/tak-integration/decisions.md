# TAK integration: decision log

TAK support is in development. Entries are dated and are not edited after the fact. A later entry supersedes an earlier one.

Related: [plan.md](plan.md), [data-contract.md](data-contract.md).

## 2026-10-06

### D1. Target TAK Server first, through the protocol
Target the official TAK Server as deployed by infra-TAK, since the TAK-CAD server plugin requires it. Implement against the protocol: TLS CoT streaming on 8089, with a client certificate from a `.p12`. OpenTAKServer and FreeTAKServer are tested later, best effort.

### D2. One adapter, both backends, no Admin SDK
The bridge supports Firebase (default) and PocketBase through one adapter interface.

- It authenticates as a dedicated bridge account, using the client SDK in Node, so security rules apply.
- The standard path does not use the Admin SDK.
- Rules let a bridge account write only TAK position, history and status data, and only for events it is linked to.

### D3. Bridge account creation
- **Firebase:**
  - A secondary Firebase app with in-memory auth creates the bridge user, so the signed-in user is not signed out.
  - CrowdCAD generates the password and shows it once.
  - The signed-in user then writes `bridgeAccounts/{bridgeUid}` with `ownerUid`. There is no role field on `users/{uid}`.
  - Bridge emails use a domain the project controls (`<id>@bridge.crowdcad.org`).
- **PocketBase:** a user with `role = 'bridge'`, settable only by an admin or by the bridge's owner.
- **Rotation:** create a new bridge account, then delete the old record. **Revocation:** delete the record.
- **No escalation:** an account with a bridge record cannot create or edit bridge records, event TAK config or device links.

### D4. Self-hosted bridge, no hosted bridge in v1
The bridge runs as a Docker container on each deployment's TAK host. Setup:
1. Create a TAK Portal user and download its `.p12`.
2. Create a bridge connection in CrowdCAD, which shows a one-time `.env` block.
3. Run `docker compose up -d`.
4. Check the status shown in CrowdCAD.

### D5. Scope is ownership plus explicit linking
CrowdCAD has no organization model. A bridge belongs to the user who creates it, and only an event's owner can link or unlink a bridge for that event.

For TAK purposes, the bridge record stands in for an organization. Remembered device-to-team-name mappings and the default history mode live under it.

### D6. The bridge never reads event documents
Callsign-to-team matching runs in the dispatcher's browser.

- **The bridge reads only:** the event's TAK config (linked bridge, enabled, closed, history mode) and device links (device UID to an opaque team id, linked time, method).
- **It writes only:** live device docs, history docs and status.
- **History** is aggregated per (device, team) segment, so a device reassigned mid-event starts a new segment.

### D7. Device linking
- Devices are keyed on TAK UID; the callsign is what's displayed.
- Auto-link when the callsign matches a team name, ignoring case and spaces.
- Unmatched devices appear in an "Unassigned TAK devices" list with a team dropdown.
- Mappings are remembered per bridge and pre-link devices at the next event.
- Multiple devices per team; team position = most recent fix.
- Reassignment is allowed mid-event.
- Device-side claiming is deferred.

### D8. Direction
- v1: inbound only.
- v1.1: posts as static CoT markers, once maps are georeferenced.
- Deferred: outbound team positions, map overlays, and calls (calls because of patient information).
- Outbound goes over the 8089 stream only, since TAK Server does not accept CoT over REST.

### D9. TAK-CAD is designed for, not built
- A shared TLS identity module loads the `.p12` once for every connection.
- An `InboundSource` interface. v1 implements `CotStreamSource`, and `TakCadPollerSource` (REST on 8443, 15 s polling) is a documented stub.
- CrowdCAD must work without TAK-CAD.
- The bridge's TAK user may need TAK-CAD permissions later.
- TAK-CAD API documentation is pending.

### D10. Positions and history
- **`historyMode`:** `off`, `summary` (default) or `detailed`.
  - The default is set on the bridge record.
  - Each event can override it in the event's TAK config.
  - The map viewer shows an indicator while recording is on.
- **Live data:** one doc per device, overwritten. Written on more than 10 m of movement, or every 60 s as a heartbeat.
- **`summary` history:** per-segment 5-minute windows (time-weighted mean position, spread, sample count) and a sparse heat-map grid of seconds per cell (about 5 m). The bridge computes both in memory from the full-rate stream.
- **`detailed` history:** `summary`, plus 15 s points while the team is assigned to a call.
- **`off`:** live only. Nothing is kept after close.
- **End-of-event analytics** (heat map, time on post, distance, coverage gaps) are computed in the browser from the summary docs.

### D11. Access in v1
- Live positions are readable by anyone who can read the event.
- History is readable by the event owner only.
- A read-only viewer role or a dispatcher role that can see history is future work.

### D12. Cleanup does not depend on TTL
Through the adapter, so both backends behave the same, the bridge:
- deletes live device docs when an event closes;
- on startup, sweeps stale live docs for its linked events.

The existing end-event flow also sets `closed` on the event's TAK config. A Firestore TTL policy is an optional backstop for operators.

### D13. No production data or rules during development
- No prototype work writes data to, or deploys rules to, a production Firebase project.
- Rules are developed and tested with the Firebase Emulator Suite, `@firebase/rules-unit-testing` and a local PocketBase.
- Rules live in this repository.

### D14. Maps v1: control points, not basemaps
- Control points on the existing map images.
- An affine fit from 3 or more points, with the residual error shown in meters.
- Natural image dimensions are saved.
- All TAK and history data is stored as lat/lon and projected to image space at render.
- MapLibre is deferred.

### D15. License and code provenance
- `crowdcad/tak-bridge` is AGPL-3.0, matching this repository. Source files carry SPDX headers.
- An earlier TAK prototype exists outside this repository. None of its code is copied. Contributions of prior work are welcome by PR with DCO sign-off.

### D16. Repository and branch workflow
- **Integration branches:** `integration/tak` in both repositories.
- **Topic branches:** off `integration/tak`, each merged by an approved PR.
- **Tracking PRs:** one draft from `integration/tak` to `main` per repository, never merged without approval.
- **Keeping current:** `main` is merged in periodically, and `integration/tak` is never rebased.
- **Commits:** every commit is signed off for DCO.

### D17. TAK is a fully optional add-on
- **Standard events.** Their behavior does not change. They load no TAK code and read or write no TAK data.
- **One module.** All TAK UI and logic lives in `src/features/tak/`. Core loads it with a dynamic import, and only for events with `mapMode === 'tak'`, the Admin TAK section, and the event-creation map choice.
- **Imports.** Core imports only the module's public entry. An ESLint `no-restricted-imports` rule blocks imports of its internals from outside it.

### D18. Core touchpoints are listed and capped
The plan's "Core touchpoints" section lists every existing core file the TAK work changes:
- (a) a map overlay slot;
- (b) the map-mode choice in event creation;
- (c) a TAK section in the Admin settings area;
- (d) a step in the end-event flow that sets `closed` on the TAK config;
- (e) team ids;
- (f) an isolated block of TAK rules, plus `!isBridge()` on event reads;
- (g) the ESLint import rule.

Anything beyond that list needs maintainer approval first.

### D19. No organization model; `allowedUsers` stands in. Supersedes D3 and D5 where they differ.
- **Who manages bridges.** Bridges are created, edited, rotated and revoked only by admins, meaning the users that the existing Admin settings area is shown to (`users/{uid}.isAdmin`). Admins also manage each bridge's `allowedUsers`: uids, chosen by email in the UI.
- **Self-hosted:** the instance's admins act as the organization's admins.
- **Hosted:** site admins create TAK servers on behalf of agencies.
- **Linking.** An event owner can link a bridge only if they are in its `allowedUsers`. The escalation block in D3 is unchanged.
- **The future.** A real organization concept is a separate decision, needed if hosted agencies want self-serve TAK setup.

### D20. TAK setup lives in the Admin settings area. Supersedes D3's "Org settings".
The in-app settings page is `/profile`. Any signed-in user can open it, but its Admin area is shown only to admins. TAK setup is a TAK section in that Admin area. It holds:
- the bridge list, with status and last seen;
- the Add TAK server wizard;
- "Who can use this TAK server";
- remembered device mappings;
- the default history mode;
- rotate and revoke.

### D21. One map-mode choice at event creation
- The Event Configuration step offers "Map: Standard (default) / TAK live tracking".
- The TAK option lists only bridges the user is allowed to use. With none, it is disabled, with "Ask your admin to set up TAK". With exactly one, it is preselected.
- Choosing TAK shows the history mode and offers "Align map now or later".
- The choice can be changed while editing the event.
- It is stored as the optional event field `mapMode`, so event pages know whether to load TAK without an extra read. `mapMode` is a protected field: only the owner or an admin can change it.

### D22. Map alignment is a TAK step and does not touch existing maps. Supersedes D14 where they differ.
- **Existing logic stays as it is:** map rendering, percent positions and the GeoJSON linear mapping.
- **"Align map"** is a step inside the TAK module.
  - It places at least 3 control points, fits an affine transform, and shows the residual error in meters.
  - It is stored in a separate optional record per event map layer (`takMapAlignment`), read only by TAK and heat-map code.
- **Natural image dimensions** are captured during alignment, not in the existing upload flow.

### D23. Team ids
- **Shape.** `Staff` and `Supervisor` get an optional `id`.
- **Generation.** At every creation site from now on. A backfill runs only for TAK events.
- **Readers.** Core code outside TAK never reads it.
- **The audit** of every code path that edits teams found that all of them preserve unknown fields. Edits and renames therefore keep the id.

### D24. Hosted bridge-account creation stays open
- **The requirement.** Client-side bridge creation needs email/password sign-up enabled in Firebase Authentication.
- **The decision point.** If a hosted deployment has sign-up disabled, the maintainer chooses before P4 between a server-side creation function and manual creation for hosted users.
- **Not an option.** Public sign-up is not re-enabled for this.
- **The prototype** uses the Firebase emulator.

### D25. Footprint acceptance for P3 to P5
- The existing map and rules tests pass unchanged.
- A standard event's network and bundle footprint is unchanged.

## 2026-10-07

### D26. `Event.mapMode` approved
- **Field.** `Event.mapMode` is an optional field with values `'standard' | 'tak'`. Missing means `'standard'`.
- **Readers.** Core reads it only to decide whether to load the TAK module.
- **Protection.** It is a protected event field: only the owner or an admin can change it.

### D27. `NEXT_PUBLIC_TAK` build flag approved, opt-in
- **When TAK is compiled in.** Only when `NEXT_PUBLIC_TAK` is exactly `"on"`. Missing or any other value compiles TAK out, including the event-creation map choice, the Admin TAK section, and the creation page's query for allowed bridges.
- **Where it's documented.** Next to `NEXT_PUBLIC_BACKEND`, in `.env.example` and `docs/DEPLOYMENT.md`.

### D28. Log-only bridge mode
`CROWDCAD_BACKEND=none` connects to TAK and logs positions without writing anywhere, and needs no bridge account. It's for checking the TAK side of a setup, for diagnostics, and for the P1 real-device check.

### D29. The CA comes from the client `.p12` by default
- **Default.** TAK client bundles normally include the server CA, and Node trusts CA certificates bundled in the `.p12` (confirmed by tests). So `TAK_CA` is optional.
- **A separate CA** must be PEM. A truststore `.p12` is rejected, with the `openssl` command to convert it.
- **Legacy-encrypted `.p12` bundles** get an explanatory error, with a re-export command or the `--openssl-legacy-provider` fallback.

### D30. A CoT simulator stands in for TAK hardware
- **What it is.** A seeded, deterministic simulator in `tak-bridge` (`src/sim/`). Synthetic devices dwell at posts and walk between them.
- **Two ways to run it.** It runs either on a virtual clock (an 8-hour, 20-device event in well under a second), or as a TLS server replaying CoT in real or compressed time.
- **Uses.** The P1 and P2 tests and the P5 budget tests. Real-device checks are listed under "Needs Evan" in plan.md, and never block other work.

### D31. Rules and adapter tests live in `tak-bridge`
- **Where.** The Firestore rules tests (`@firebase/rules-unit-testing`), the PocketBase rules tests, and the adapter end-to-end tests are in `crowdcad/tak-bridge`.
- **How.** Its CI checks out this repository's `integration/tak` for `firestore.rules` and `scripts/setup-pocketbase.js`.
- **Why.** This needs no change to core's `package.json` or CI, which are outside the approved touchpoints.
- **The cost.** A rules change in core is exercised by the next `tak-bridge` CI run, not by core's own CI. Core's e2e suites still cover the existing app flows against the same rules.

### D32. `!isBridge()` costs one rules read on event access
- **What it costs.** `isBridge()` is an `exists()` on `bridgeAccounts/{uid}`, which Firestore bills as one document read per rules evaluation.
- **Where it applies.** Every event read and write gains this check.
- **What it doesn't change.** Behavior and network traffic for non-bridge users are unchanged. The check is kept, because it is the authoritative bridge test. An email-domain check would be free, but it can be spoofed.

### D33. The PocketBase bridge polls instead of using realtime
- **The choice.** The PocketBase adapter polls config and device links every 5 s.
- **Why.** PocketBase realtime relies on a browser-style `EventSource`, which Node does not reliably provide, and polling keeps the container dependency-free.
- **Firebase is unaffected.** It uses snapshot listeners.

### D34. PocketBase `allowedUsers` is a relation to `users`
- **The problem.** PocketBase's `~` on a JSON field is a substring match.
- **The fix.** A multi-relation gives exact membership checks (`allowedUsers.id ?= @request.auth.id`).
- **Firebase is unaffected.** It keeps a uid array.

### D35. PocketBase e2e migrations are not mirrored
`tests/e2e/pb_migrations/` is not loaded by the PocketBase e2e harness, which builds its own permissive schema in `tests/e2e/global-setup.pocketbase.ts`. TAK schema and rules therefore live only in `scripts/setup-pocketbase.js`.
