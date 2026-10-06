# TAK integration: plan

**Status: in development.** TAK support is not released. This plan covers a prototype that puts team positions from TAK devices (ATAK, iTAK, WinTAK) on the CrowdCAD map, and keeps a privacy-conscious location history.

Related: [data-contract.md](data-contract.md) (collections, fields, rules), [decisions.md](decisions.md) (dated decision log).

## Scope

**v1 (this plan):** inbound only. The bridge reads device positions from a TAK Server and writes them to CrowdCAD.

**Later:**
- v1.1: CrowdCAD posts published as static CoT markers, once maps are georeferenced.
- TAK-CAD status, through a `TakCadPollerSource`.
- Outbound team positions, map overlays and calls. Calls stay out because of patient information.
- MapLibre basemaps.
- Device-side claiming of teams.

**Constraints:**
- Firebase stays the default backend and PocketBase is opt-in. The bridge supports both through one adapter interface.
- CrowdCAD works without TAK and without TAK-CAD.
- The bridge never reads event documents (see [data-contract.md](data-contract.md#principles)).
- No prototype work touches a production Firebase project. Rules and data are developed against the Firebase Emulator Suite, `@firebase/rules-unit-testing` and a local PocketBase.

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
                                                CrowdCAD dispatch page
```

**`crowdcad/tak-bridge`:** TypeScript on Node, shipped as a Docker image.

- **TLS identity module.** Loads the client `.p12` and the TAK Server CA once. Every connection uses it.
- **`InboundSource` interface.**
  - v1 implements `CotStreamSource`: a TLS CoT stream on 8089, framed and parsed with `fast-xml-parser`.
  - A documented stub reserves `TakCadPollerSource`: REST on the TAK Server API port (8443), polled every 15 s, using the same TLS identity.
  - Handlers are registered by CoT type prefix. `a-*` is a device position. Map pins (`b-m-p-*`), chat (`b-t-*`) and tasking (`t-*`) are not positions and are ignored in v1.
- **Backend adapter.** One interface, with Firebase (client SDK in Node) and PocketBase implementations, covering:
  - sign-in
  - read own linked events (TAK config only)
  - read device links
  - write live, history and status
  - delete live
- **Aggregator.** Holds the full-rate stream in memory per (device, team) segment, and emits 5-minute windows, the heat-map grid and detailed points.
- **Outbound,** when it comes, goes over the 8089 stream only. TAK Server has no REST endpoint for injecting CoT.

**`crowdcad/crowdcad`:**
- The bridge record and the "create bridge connection" flow.
- The event TAK panel.
- Device linking.
- Map georeferencing.
- Live team positions on the map.
- History views.
- Rules for both backends.

### Bridge account flow

1. **TAK Portal (infra-TAK).** Create a `crowdcad-bridge` user, add it to the responders' TAK groups, and download its `.p12` and password.
2. **CrowdCAD: Create bridge connection.** This creates the bridge account without signing the user out:
   - **Firebase:** a secondary Firebase app with in-memory auth persistence calls `createUserWithEmailAndPassword`. The email is `<id>@bridge.crowdcad.org`, and CrowdCAD generates the password. The secondary app is then signed out and deleted, and the signed-in user writes `bridgeAccounts/{bridgeUid}`.
   - **PocketBase:** creating a user record does not change the signed-in session. The rules allow `role = 'bridge'` only for an admin or the bridge's owner.
   - CrowdCAD shows a one-time `.env` block, and never stores the password.
3. **On the TAK host:** place the `.p12` and the CA, paste the `.env` block, and run `docker compose up -d`.
4. **CrowdCAD shows bridge status** from the bridge's heartbeat.

- **Rotation:** create a new bridge connection, switch the events to it, then delete the old bridge record.
- **Revocation:** delete the bridge record. The rules check it on every write.
- **Requirement:** the Firebase project must allow client-side email/password sign-up. See [Open items](#open-items).

### Device linking

- Devices are keyed on TAK UID; the callsign is what's displayed.
- **Auto-link** runs in the dispatcher's browser: a callsign that matches a team name in the event, ignoring case and spaces, is linked to that team's `teamId`.
- Unmatched devices appear under **Unassigned TAK devices**, with a team dropdown.
- **Remembered mappings** (device to team name) are stored per bridge and pre-link devices at the next event.
- A team can have several devices; its position is the most recent fix among them.
- Devices can be reassigned mid-event. History is credited by time, because each (device, team) pairing is its own segment.

## Phases

Each phase ends with a PR into `integration/tak` that a maintainer approves. `integration/tak` merges into `main` only with maintainer approval.

### P0: Docs and scaffolding
- These three documents, in `docs/tak-integration/`.
- `crowdcad/tak-bridge`:
  - TypeScript on Node, with an AGPL-3.0 license and SPDX headers.
  - Config loading from the environment.
  - `InboundSource` and TLS identity interfaces.
  - Dockerfile, a `docker-compose.yml` example and `.env.example`.
  - Lint, typecheck and tests in CI.
  - A README for infra-TAK operators.

**Accept:** maintainer review of the docs, and CI green.

### P1: CoT inbound
- The TLS identity module loads the `.p12` and CA.
- `CotStreamSource` connects to 8089, reconnects with backoff, and frames the CoT stream.
- Events are parsed with `fast-xml-parser`, and the bridge logs `uid`, `callsign`, `lat`, `lon` and `time` for `a-*` events.
- Unit tests cover framing (split and concatenated events), parsing, and type filtering.

**Accept:** a real device's position on a test TAK Server appears in the bridge logs within 5 s.

### P2: Backend writes and rules
- Firebase and PocketBase adapters.
- Bridge sign-in, heartbeat and status docs.
- Live device docs, written on more than 10 m of movement or a 60 s heartbeat.
- Startup sweep and close handling (see [Cleanup](data-contract.md#cleanup)).
- **Rules:**
  - Firestore rules, with `@firebase/rules-unit-testing` tests.
  - PocketBase collections and rules in `scripts/setup-pocketbase.js` and the e2e migrations, with tests.
- **Tests for the rules:**
  - Writes to unlinked or closed events are rejected.
  - A bridge account cannot read event documents.
  - A bridge account cannot create or edit bridge records, TAK config or device links.
  - History is readable only by the event owner.

**Accept:** emulator and local PocketBase tests prove that writes to unlinked events and patient-data reads are rejected, and that live docs update.

### P3: Map georeferencing
- Save `naturalWidth` and `naturalHeight` for each layer image.
- A control-point editor: at least 3 points, an affine fit, and the residual error shown in meters.
- Projection helpers from lat/lon to image percent.
- Existing maps and the GeoJSON import keep working unchanged.

**Accept:** a georeferenced test map places known coordinates within the reported error.

### P4: CrowdCAD TAK UI
- **Create bridge connection:** the one-time `.env` block, and a list of bridges with their status.
- **Event TAK panel:**
  - Link or unlink a bridge (owner only).
  - Enable it and choose the history mode.
  - Show status.
  - Mark the end of the event: the end-event flow also sets `takConfig.closed = true`.
- **Unassigned TAK devices:** auto-match and a team dropdown, remembered mappings, and reassignment.
- **Map:** live team positions on georeferenced layers, and a visible indicator while history is recording.
- **`Staff.id` / `Supervisor.id`:** generated and backfilled.

**Accept:** works end to end with a real device against the emulator or a dev Firebase project.

### P5: History and end-of-event view
- The bridge aggregates per-segment 5-minute windows and a sparse heat-map grid (about 5 m cells).
- Detailed mode adds 15 s points while a team is assigned to a call.
- Cleanup at close.
- An owner-only end-of-event view: heat map, time on post, distance, coverage gaps.

**Accept:** a simulated 8-hour, 20-device event stays within the planned write and size budgets (to be set in this phase: writes per device per hour, maximum segment doc size, total docs per event).

### P6: Packaging
- A GHCR image (`ghcr.io/crowdcad/tak-bridge`) built on version tags.
- An infra-TAK setup guide.
- A PocketBase parity check: the same scenario passes on both backends.

### Later
- v1.1: posts as static CoT markers over 8089.
- `TakCadPollerSource`. The bridge's TAK user may need TAK-CAD permissions.

## Branches

- **Integration branches:** `integration/tak` in both `crowdcad/crowdcad` and `crowdcad/tak-bridge`, created from `main`. A draft tracking PR from `integration/tak` to `main` stays open per repo, and is never merged without maintainer approval.
- **Topic branches:** work happens on short branches off `integration/tak` (for example `tak/p0-docs`, `tak/p1-cot-stream`), each merged by an approved PR.
- **Keeping current:** `main` is merged into `integration/tak` periodically. `integration/tak` is never rebased.
- **Commits:** every commit is signed off (`git commit -s`) for DCO.

## Open items

- **Firebase sign-up setting.** Client-side bridge creation needs email/password sign-up enabled in Firebase Authentication. If a project disables sign-up, `createUserWithEmailAndPassword` fails with `auth/admin-restricted-operation`. The plan needs a fallback for such projects (an operator script, or enabling sign-up). To be confirmed per deployment.
- **Roles.** v1 history is owner-only. A read-only viewer role or a dispatcher role that can see history is future work.
- **Organizations.** Scope is ownership plus explicit linking. When CrowdCAD gains an organization model, bridge defaults and device mappings can move to it.
- **Remembered mappings** are writable by the bridge owner only. Links that other dispatchers make apply to the event, but are not remembered, in v1.
- **TAK-CAD API documentation:** pending.
- **One rules source.** Deployments that keep their own copy of the security rules must port the TAK rules when they adopt this feature. Long term, rules should be deployed from one source.
- **PocketBase read access.** The `venues` and `events` read rules and the exact `sharedWith` match need tightening (tracked separately). TAK rules that build on event visibility depend on it.
