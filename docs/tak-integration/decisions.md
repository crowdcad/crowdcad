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
