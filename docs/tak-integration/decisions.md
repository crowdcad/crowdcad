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
- **Uses.** The P1 and P2 tests and the P5 budget tests. Real-device checks are listed under "Maintainer actions" in plan.md, and never block other work.

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

### D36. Core test infrastructure approved (touchpoint h)
- **What it adds.** Core gains vitest (`npm run test:unit`, `vitest.config.mts`) and a CI job (`tak-unit-footprint`). The job runs the unit tests and the bundle-footprint check (`scripts/check-tak-footprint.mjs`) on builds with TAK off and on.
- **Why it's needed.** The touchpoints list didn't cover it, but P3 to P5 can't meet their acceptance criteria without it.

### D37. vitest 3 with vite 6, to keep production dependencies unchanged
vitest 4's vite requires a newer postcss than core uses, which would move three production packages. vitest 3.2 with vite 6.4 accepts core's existing versions, and only a dev-only types package changes.

### D38. How the module boundary is enforced
- **TAK internals.** `import/no-restricted-paths` (error) blocks imports of TAK internals from outside `src/features/tak`.
- **Static value imports.** `@typescript-eslint/no-restricted-imports` with `allowTypeImports` (error) blocks static value imports of the module, so it can only be loaded dynamically.
- **Existing rule unchanged.** The Firebase-import warning stays as it was, because this uses separate rules.

### D39. Map alignment error is the residual standard error
- **The measure.** The reported accuracy is `sqrt(SSR / (n - 3))` in meters, the standard estimate of a single point's scatter for a 6-parameter fit. With exactly 3 points it is null ("add a 4th point").
- **The fit space.** The fit is done in pixels for isotropy, and stored in percent with a local-meters origin.

### D40. `next.config.js` always defines `NEXT_PUBLIC_TAK` (touchpoint i, approved)
- **Why it's needed.** Next.js inlines only the `NEXT_PUBLIC_*` variables that are set. With the flag unset, `process.env.NEXT_PUBLIC_TAK === 'on'` wasn't a build-time constant, and an unreachable TAK chunk stayed in the build.
- **The fix.** `env: { NEXT_PUBLIC_TAK: process.env.NEXT_PUBLIC_TAK === 'on' ? 'on' : 'off' }` makes the gate constant, so TAK is fully compiled out.
- **Deployments with their own config.** They need the same line when they adopt TAK.

### D41. Core's TAK entry points use `React.lazy`, not `next/dynamic`
- **Why.** `next/dynamic`'s import stayed in each page even with the TAK branch compiled out, adding about 1 kB to three routes. `React.lazy`, inside a `Suspense` boundary, adds nothing.
- **No server rendering is lost.** The TAK components never render on the server, because they need a signed-in user or admin status.

### D42. The map overlay slot has two parts
`MapOverlay.markers` renders inside the zoomed and panned map, with the layer, image rect and scale. `MapOverlay.chrome` renders above the map, unscaled. Without an overlay, the map renders as before.

### D43. The event TAK panel is map chrome, not a new dispatch tab
- **Where it lives.** The event's TAK status, settings, Align map and device linking sit in a collapsible panel on the Map tab, delivered through the overlay slot (touchpoint a).
- **Why.** The dispatch page's layout and tab set stay as they are.

### D44. The team-id audit is a source test (touchpoint h)
- **What it checks.** `src/lib/teamId.test.ts` parses core's source with the TypeScript compiler API. It fails if a new team or supervisor literal lacks `id`, or if a staff or supervisor `.map()` update doesn't spread the existing entry.
- **Why a source test.** Those updates live inside page components.
- **Exceptions.** Two view-only projections are allowlisted, each with its reason.

### D45. Detailed history learns about calls from opaque team ids only
- **What's published.** Dispatchers' browsers publish `takCallState` (`teamIdsOnCall`, `updatedAt`). The bridge reads it to keep 15 s points while a team is on a call.
- **What isn't.** No call details, locations or patient information leave the event, which keeps D6.
- **Shape is enforced.** The rules allow only those two fields.

### D46. A headless TakEventAgent runs TAK background work on the dispatch page (extends touchpoint a, approved)
- **What it is.** For TAK events, the dispatch page also renders one lazily loaded component with no UI. It publishes call state, auto-links devices and backfills team ids, whichever tab is open.
- **Gating.** It uses the same `NEXT_PUBLIC_TAK` and `mapMode` guard as the map overlay.

### D47. History may be written after an event closes
- **The contradiction.** The data contract has the bridge flush and end its open segments at close, but the rules had gated history writes on an open event.
- **The fix.** History writes now need a linked, enabled bridge and a history mode other than off. Live writes still stop at close.

### D48. History budgets (P5)
For an 8-hour, 20-device event, measured on the simulator:

| Measure | Budget | Measured |
|---|---|---|
| Segment writes | one per segment per 5 minutes, about 12 per device-hour | 12.1 |
| Segment doc | under 256 KiB | at most 21.9 KiB |
| Grid | 5,000 cells or fewer | at most 1,163 |
| Detailed points | 500 per chunk doc | 240 per call-hour |

### D49. End-of-event view lives in the TAK panel
- **Where.** The owner-only heat map and per-team stats sit in the TAK panel on the dispatch map (touchpoint a), not on the summary page, which needs no change.
- **How the stats work.**
  - Time on post uses posts on aligned layers, within 25 m.
  - Distance sums moves between consecutive 5-minute windows.
  - A coverage gap is a stretch of 10 minutes or more.

### D50. Bridge images are published only from version tags
- **How.** `crowdcad/tak-bridge`'s release workflow builds multi-arch images (amd64 and arm64) and pushes them to `ghcr.io/crowdcad/tak-bridge` only when a maintainer pushes a `vX.Y.Z` tag. Lint, typecheck and tests must pass first.
- **Compose.** It defaults to the published image and keeps building from source as an option.

### D51. One parity scenario for every backend
The same end-to-end scenario runs against the Firebase emulator and a local PocketBase, and must produce an identical result. A difference in backend behavior therefore fails CI.

### D52. The bridge enrolls for its own certificate
- **The finding.** TAK Portal offers no `.p12` download for a user, only an Enroll QR (what ATAK and iTAK scan).
- **The change.** With `TAK_USERNAME` and `TAK_PASSWORD` (or `TAK_ENROLL_URL`, the Enroll QR link), the bridge uses TAK Server's standard enrollment API on 8446: it generates its own RSA key, sends a CSR to `/Marti/api/tls/signClient/v2`, and gets back its certificate and the TAK CA chain. The key never leaves the bridge's machine.
- **Storage and renewal.** The result is saved in `BRIDGE_DATA_DIR` (a named Docker volume, or `./data`) and renewed when fewer than 30 days remain. Renewal needs the TAK password to still work, so the docs prefer the user's password over a one-time token.
- **Fallback.** `TAK_CLIENT_P12` still works, alone or as a fallback when enrollment fails.
- **Dependency.** `node-forge` builds the CSR and reads `.p12` bundles. It is dual-licensed BSD-3-Clause or GPL-2.0; the bridge uses it under BSD-3-Clause.

### D53. TAK Server certificates are trusted by CA, not by name
- **The finding.** TAK Server's 8089 certificate is usually issued to an internal name (for example `takserver`) rather than the address clients use, so a normal hostname check fails.
- **The rule.** When a TAK CA is known (from enrollment, `TAK_CA`, or bundled in the `.p12`), trust is limited to that CA and the server name is checked only if `TAK_SERVER_NAME` is set. Without a known CA, Node's normal checks against public roots apply. Enrollment on 8446 trusts public roots plus `TAK_CA`, since 8446 often has a public certificate.

### D54. The Add TAK server wizard produces a complete setup
- **Placement.** The admin chooses where the bridge runs: the TAK Server machine (Docker) or this computer (a test with Node). It defaults to this computer when CrowdCAD itself runs locally or on the Firebase emulators, and warns when the chosen placement cannot reach the backend.
- **Output.** One paste-ready script per placement (and per OS for local runs) that clones the bridge, writes a complete `.env` (TAK sign-in, backend settings including emulator hosts, bridge account) and starts it. The TAK password goes only into that one-time block; CrowdCAD never stores it.
- **Checklist.** The last step shows a live checklist from the bridge's status (signed in, connected to TAK, receiving positions), with the bridge's own plain-words error when TAK fails (data contract 0.4.0).

### D55. Basemaps and place search use open data and are configurable
- **Library.** MapLibre GL JS (BSD-3-Clause), loaded only with the TAK module. Its worker is bundled as an asset and passed with `setWorkerUrl`, since bundlers don't follow its own lookup.
- **Default styles.** OpenFreeMap (Positron and others): no key and no usage limits, with OpenStreetMap attribution. CARTO's hosted Positron tiles need a commercial license for commercial use, so they are not the default.
- **Satellite and other styles.** Not built in, since good imagery needs a provider key and license. A deployment adds them with `NEXT_PUBLIC_TAK_BASEMAPS` (a JSON list of style URLs or raster tiles with attribution).
- **Search.** Photon (OpenStreetMap data) by default, run only on submit. `NEXT_PUBLIC_TAK_GEOCODER_URL` points elsewhere or turns it off. Google is not used: its terms bar showing its results on another map and limit storing coordinates, and control points are stored.
- **Privacy and offline use.** `off` for either setting stops requests to outside map services. Without a basemap, alignment works as before, with typed coordinates.
- **Preferences.** Basemap choice and image opacity are per viewer, in browser storage. They change nothing in event data.

### D56. A basemap under the dispatch map (touchpoint j)
- **Approved** 2026-10-07 by the maintainer.
- **How it is drawn.** The image stays upright, so the basemap is rotated and scaled into the image's frame from the alignment. MapLibre takes the rotation as a bearing, so labels stay upright, and a CSS matrix applies the rest (scale and any shear). It is re-rendered at zoom steps so it stays sharp.
- **Off by default.** Each viewer picks a basemap and the image's opacity in the TAK panel. A layer without a current alignment shows no basemap.

### D57. Location history moves to the event summary page (touchpoint k)
- **Supersedes** the placement in D49. The dispatch page closes when an event ends, and history is most useful afterwards.
- **What it shows.** For the event owner only: the heat map on a basemap with the aligned event map (selectable, with opacity), and per-team tracked time, distance, coverage gaps and time on post. The map zooms with Ctrl or Cmd plus scroll, so the page still scrolls.
- **The dispatch map** no longer shows the heat map; the TAK panel points to the summary page.

### D58. A segment's last position is credited until the segment ends
- **The finding.** Each position was credited with the time until the next one, so a segment's last position earned nothing. A one-minute test with a phone reporting every 30 s, and a device reassigned once, produced two single-position segments and an empty heat map.
- **The change.** When a segment ends (event close, reassignment, history turned off), its last position is credited until then, capped at the same 60 s as other gaps. `endedAt` is the end of that credited time.

### D59. Basemap-only events are a separate core decision
- **Proposed** in plan.md P8, not started. Posts on a basemap layer would need real coordinates instead of image percent, which changes core's data model, venue management and both backends. That is outside the TAK touchpoints, so it waits for a maintainer decision.

### D60. Smooth basemap overlays: live where it is interactive, a picture on the dispatch map
- **The finding.** On the interactive maps, the image overlay, markers and heat map were moved by React after each map move, one frame behind the map, so they wobbled while zooming. On the dispatch map, the live underlay re-rendered and reloaded tiles at zoom steps.
- **Align and summary maps (interactive).** Still a live MapLibre map. The image and heat canvas are repositioned directly in the map's `move` handler, which runs in the frame the map draws, and markers are MapLibre markers. No React render happens per frame.
- **Dispatch map.** The basemap is rendered once, off-screen, in the image's frame, covering the image plus its longer side again on every side, at twice the screen resolution (capped at a 4096-pixel canvas). The pixels are kept as a picture and the map discarded. The picture sits in the same zoomed and panned container as the event map, so it moves with it exactly. It is rendered again only when the alignment, the basemap or the map's size changes, and the old picture stays until the new one is ready.
- **Not stored.** The picture lives only in the viewer's browser. Saving it with the event would need a data contract change, and some imagery providers prohibit storing rendered tiles.

### D61. Maps are aligned in venue setup
- **Requested** 2026-10-07 by the maintainer: alignment belongs to the venue, since a venue's map does not change between events.
- **Where.** Venue Configuration gets a "TAK live tracking" switch (touchpoint l). It is disabled, with a link to Settings, until the user has a TAK server: one they are allowed on, or for an admin any. When on, a "TAK alignment" step follows Map, full page rather than a modal.
- **Storage.** Each alignment is kept on its layer (`Layer.takAlignment`) and saved with the venue. Events copy the venue at creation, so they carry it, and everyone who can read the event can read it, with no new collection or rule. It applies only while the layer still shows the image it was made for. A new image aligned before the venue is saved is matched by its preview URL and moved to the uploaded URL on save.
- **Events.** The event builder's TAK choice and the dispatch panel no longer align maps; they show each map's status and point to venue setup. Events aligned earlier keep working through the event-level `takMapAlignment`, now read only.
- **Not covered yet.** Events created before a venue is aligned keep their snapshot without it; re-creating the event, or aligning in the venue before creating events, picks it up.

### D62. The owner can export location history
- **What.** On the event summary, the owner exports the 5-minute history (team, device, time, mean position, spread, reports, seconds) as CSV, and the heat map as CSV or GeoJSON (5 m squares with seconds, for GIS tools).
- **How.** Built in the browser from what the summary already loaded. Nothing is sent anywhere, and only the event owner can load history in the first place.

### D63. The dispatch basemap is on by default and follows the venue
- **The finding.** A real test showed no basemap around the event map. The venue's alignment was never saved, because the step only kept points after a separate "Keep this alignment" click. The event, created before any alignment, had none in its snapshot. The underlay was also off by default, and OpenFreeMap's "dark" style (#0c0c0c) is invisible on CrowdCAD's dark theme.
- **The changes.**
  - The venue step reports every change of points, so the alignment is kept as it is made and saved with the venue.
  - Events read their venue's current alignment as well as their own copy (D61), preferring the venue's. When the venue is newer, the event owner can share it into the event, so dispatchers who can't read the venue see positions too.
  - The underlay defaults to "System" for aligned maps; "No basemap" turns it off for that viewer.
  - "Dark" uses OpenFreeMap's Fiord style, a dark blue-gray that stays readable on the dark theme.
  - A render that can't finish because the browser tab is in the background waits for the tab to be shown instead of using up a retry; retries are 5 s apart.

### D64. Maps become real-world maps in core (P8)
- **Requested** 2026-10-08 by the maintainer, superseding the TAK-only alignment of D61 and the deferral in D59.
- **Why.** Alignment helps any venue, not only TAK ones: posts can sit on real coordinates outside the venue image, an area can be drawn with no image at all, and the live map stays sharp at street level without re-rendering a picture.
- **Why the image map existed.** Core's dispatch map positions everything as a percentage of the image, and it predates alignment. Warping works both ways (a basemap into the image's frame, or the image onto a live map); the image map stays for unaligned layers and offline use.
- **Decisions.** The live map is the dispatch view for geo layers (image on top). Work stays on `integration/tak`. Existing posts and zones get coordinates when an aligned venue is saved, keeping their percentages so nothing moves and older versions still read them.
- **Venue TAK switch removed.** Map alignment is a general venue step, so the TAK switch from D61 goes; TAK is still chosen per event.

### D65. Live location labels fill a team's Location
- **Requested** 2026-10-09 by the maintainer, who chose writing the Location field over a read-only hint beside it.
- **The label.** The nearest post with coordinates: its name within 25 m, "Near Gate A" within 100 m, else "250 m from Gate A" (rounded to 50 m, "1.2 km" past 1 km). Nothing is reverse geocoded; with no placed posts there is no label.
- **No flicker.** The current post is kept until another is 10 m closer; a distance band is left only 8 m past its edge; a far distance changes only when it moves by about 40 m; and a new label must hold for 20 s before it is written.
- **Who is changed.** Only teams and supervisors whose status is Available and who are not in the clinic, so a team on a call keeps the call's location. A write happens when the label changes (or a team becomes available again), never to re-assert it, so a dispatcher's own edit stays until the team moves. Each write is a transaction that applies only if the Location is still what the writer saw, logs "Post changed to … (TAK)", and keeps the team's timer unless the post changed.
- **Many dispatchers.** Every open dispatch page computes the same label from the same positions; the first write lands and the rest find nothing to change.
- **Elsewhere.** Map pins, "View on map" and the team marker place a label like "Near Gate A" at its post (`src/lib/locationLabel.ts`); a post really named "Near …" still matches itself first.
- **Map controls.** The basemap choice and image opacity moved from the TAK panel and the map's corner into the Map tab's top bar, styled like the location search, and opacity is a percentage field instead of a slider. "Match light/dark mode" is now "System".

