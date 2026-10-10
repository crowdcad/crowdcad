# TAK integration: plan

**Status: in development.** TAK support is not released. It is a fully optional add-on: events that don't use it behave exactly as before, and the changes to existing core code are kept small and listed below.

This plan covers a prototype that puts team positions from TAK devices (ATAK, iTAK, WinTAK) on the CrowdCAD map, and keeps a privacy-conscious location history.

Related: [data-contract.md](data-contract.md) (collections, fields, rules), [decisions.md](decisions.md) (dated decision log).

## Status

Updated at the end of each phase.

- **P0 Docs and scaffolding: done.** Plan, data contract and decision log are merged. The `tak-bridge` TypeScript scaffold, Docker image and CI are green.
- **P1 CoT inbound: done.**
  - This is in `crowdcad/tak-bridge` `integration/tak`: the TLS identity, from certificate enrollment on 8446 (D52) or a client `.p12`; `CotStreamSource` on 8089 (pings, idle detection, backoff reconnect); CoT framing and parsing (`a-*` only); log-only mode (`CROWDCAD_BACKEND=none`); and a CoT simulator with a throwaway dev-certificate helper.
  - TLS end-to-end tests against the simulator all pass.
  - **Acceptance:** met on 2026-10-07 with a real phone and a real TAK Server: the bridge enrolled on 8446, connected on 8089, and received positions from a phone in the bridge user's TAK group.
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

- **P4 CrowdCAD TAK UI: built. The real-device check mostly passed.**
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
  - **Real-device check (2026-10-07):** a phone's position appeared on the aligned dispatch map of a live TAK event, and the device auto-linked to the team named after its callsign. The test also showed that a segment's last position earned no time, so a short test left an empty heat map; the bridge now credits it (D58).
  - **Not yet done:**
    - Confirm live positions clear within a minute of ending the event, and the history view on the summary page (see [Maintainer actions](#maintainer-actions)).
    - Hosted bridge creation stays open (D24).

- **P5 History and end-of-event view: done.** Acceptance is met.
  - **Bridge:** a history recorder per (device, team) segment, with:
    - 5-minute windows (time-weighted mean, spread, count, seconds; each fix is credited up to 60 s);
    - a sparse 5 m heat-map grid, capped at 5,000 cells, with overflow counted;
    - Detailed-mode points every 15 s while the team is on a call;
    - segment writes every 5 minutes;
    - segments ended and flushed at close, before live docs are cleared.
  - **Core:**
    - `takCallState`, published by a headless `TakEventAgent` (D45, D46). The agent also runs auto-linking and the team-id backfill on any tab.
    - An owner-only history view: a heat map plus per-team time tracked, distance, time on post and coverage gaps. It was first in the TAK panel (D49) and is now on the event summary page (P7, D57).
  - **Budgets for a simulated 8-hour, 20-device event:**

    | Measure | Budget | Measured |
    |---|---|---|
    | Live writes per device-hour | 60 to 200 | within range |
    | Segment writes per device-hour | 12 or fewer | 12.1, one per 5-minute flush |
    | Largest segment doc | under 256 KiB | 21.9 KiB |
    | Largest grid | 5,000 cells or fewer | 1,163 cells |
    | Detailed points | at most 500 per chunk doc | 240 per hour of call time |

  - **Tests:**
    - Rules: 28 Firestore cases, plus 4 bridge end-to-end tests on the emulator, and 13 PocketBase tests. They now include history after close and call state.
    - Unit: 67 bridge tests and 51 core tests.
    - Browser smoke: 7 of 7 steps, now including the history view and heat map, with no console errors.

- **P6 Packaging: done.** The first release is under [Maintainer actions](#maintainer-actions).
  - **Image release workflow** in `crowdcad/tak-bridge`. A `vX.Y.Z` tag runs the checks, then builds `linux/amd64` and `linux/arm64` images and pushes `ghcr.io/crowdcad/tak-bridge:X.Y.Z` and `:X.Y`. No tag has been pushed yet, so nothing is published.
  - **`docker-compose.yml`** uses the published image, which can be pinned with `TAK_BRIDGE_VERSION`. It still builds from source with `--build`.
  - **The infra-TAK setup guide** (`docs/setup-infra-tak.md` in `tak-bridge`) covers setup, operations, troubleshooting, the optional TTL backstop, and what is stored.
  - **PocketBase parity check.** One scenario (sign in, link, two minutes of positions, close) runs unchanged on the Firebase emulator and a local PocketBase, and both produce the same expected result. It is green in CI.

- **P7 Basemaps and map setup: in progress (early implementation).** See [P7](#p7-basemaps-and-map-setup).
  - **Done:**
    - A basemap module: MapLibre GL JS (BSD-3-Clause) with OpenFreeMap styles (Light, Streets, Bright, Dark, Dark blue) and "No basemap", plus deployment-added styles or raster tiles such as satellite imagery (D55).
    - "Align map" shows the image and a basemap side by side. Each control point is a click on the image and a click on the basemap, in either order; typed coordinates and "Use my location" still work. Place search (Photon, OpenStreetMap data) moves the basemap. Once 3 points exist, the image is previewed on the basemap with an opacity slider. Points bunched in one part of the image get a warning.
    - The basemap choice is per viewer, remembered in the browser.
    - The dispatch map can show a basemap under the event map (touchpoint j, D56), off by default, with an image-opacity slider in the TAK panel. It is rendered once as a picture covering the image plus its longer side again on every side, then moves with the event map at no cost (D60).
    - Smooth overlays on the interactive maps (align and summary): the image and heat map are positioned in the map's own move handler, in the same frame as the map, and markers are MapLibre markers (D60).
    - Text and search fields in the TAK module drop the inner focus ring (`TAK_INPUT_CLASSNAMES`), per `docs/COMPONENTS.md`.
    - The history view moved to the event summary page (touchpoint k, D57): heat map on a basemap with the aligned event map, and per-team stats. The dispatch map no longer shows the heat map.
    - Bridge: a segment's last position is credited until the segment ends, capped at 60 s (D58).
  - **Tests:** 21 new core unit tests (basemap frame geometry, including rotation, shear, zoom and the dispatch picture's margin; basemap options; place search), 85 TAK unit tests in all. 94 bridge unit tests and 33 emulator tests pass.
  - **Checked in a browser** against the emulators: the summary heat map and image overlay, the dispatch underlay lining up with the summary view, and the align dialog with search.
  - **Alignment moved to venue setup (D61).** Venue Configuration has a "TAK live tracking" switch, disabled with a link to Settings until the user has a TAK server. When it is on, a "TAK alignment" step follows Map, full page. Events take the alignment from their venue; the dispatch panel and event setup only show each map's status.
  - **Aligner:** the image pane pans and zooms like CrowdCAD's other maps (core's `useZoomPan` and zoom controls) and can zoom out past fit; search runs on Enter.
  - **Basemaps:** Light, Dark, Streets and No basemap, with "System" (Light or Dark) as the default. MapLibre's controls follow the theme.
  - **History export (D62):** the summary exports the 5-minute history as CSV and the heat map as CSV or GeoJSON.
  - **Text fields:** a global rule in `globals.css` removes the focus ring inside every HeroUI text field (see `docs/COMPONENTS.md`).
  - **Underlay fixes (D63):** the basemap under the dispatch map is on by default for aligned maps ("System"; "No basemap" turns it off), and Dark uses OpenFreeMap's Fiord style, since its "dark" style is as dark as CrowdCAD's own theme. Events read their venue's current alignment, and the owner can share it into the event for every dispatcher. The venue step keeps points as they are placed, with no separate save button.
  - **Help icons:** explanations that were subtitles are now hoverable question marks next to their titles, as in core's FieldLabel.
  - **Not yet done:** a sharper underlay re-render after zooming in past about 2x; touch gestures for the align basemap on phones; copying an older event-level alignment into the venue; P8.

**Overall:** P0 to P6 are built, and P1 is verified on real hardware. The open items are the rest of the P4 check and a first release (P6). See below.

## Maintainer actions

### P6: publish the first bridge image
When you're ready to publish, tag a release on `crowdcad/tak-bridge`. Tag a commit on `integration/tak` for a preview, or `main` after merging:

```bash
git tag v0.1.0 && git push origin v0.1.0
```

The release workflow then pushes `ghcr.io/crowdcad/tak-bridge:0.1.0`. The first publish creates the package under the `crowdcad` org. Check its visibility (public or private) in the org's package settings afterwards.

### Repository setup
- Install the DCO app on the `crowdcad` org, so sign-off checks run on PRs.
- **Hosted bridge creation** (D24). If the hosted Firebase project has email/password sign-up disabled, choose between a server-side creation function and manual creation for hosted users.


### P1 and P4: a real phone, end to end

Run these yourself. The TAK password and the bridge's certificate stay on your machine.

1. **Start CrowdCAD with TAK on.** Either a dev Firebase project, or the emulators from a `crowdcad/crowdcad` checkout on `integration/tak` (`npx firebase emulators:start --only auth,firestore --project demo-crowdcad`) with the app started against them and `NEXT_PUBLIC_TAK=on`.
2. **Make yourself an admin.** Sign up, then set `isAdmin: true` on your `users/{uid}` doc.
3. **Create the bridge's TAK user** in TAK Portal with a password, in the same TAK group as your phone's user.
4. **Add the TAK server** in Profile > Admin > TAK. Choose **This computer (test)** (preselected on the emulators), enter the TAK Server address (the `host=` in the Enroll QR link, not the TAK Portal address), the username and the password, and paste the script it shows into a terminal.
5. **P1 check.** The checklist should reach **Connected to the TAK Server**, then **Receiving positions** once the phone reports. For the log-only variant, set `CROWDCAD_BACKEND=none` in the bridge's `.env`: each phone report should appear within 5 s as a `"msg":"position"` line.
6. **P4 check.**
   1. Create an event with **Map: TAK live tracking** and the bridge preselected, add a team whose name matches the phone's callsign, and align the map with 4 or more points.
   2. On the dispatch Map tab, the device should auto-link to the team and appear on the aligned map. **Passed 2026-10-07.**
   3. Walk around for at least 5 minutes, then end the event. Within a minute, its live positions should be gone.
   4. On the event summary page, "Location history (TAK)" should show the heat map along the route and the team's tracked time.
7. **Report** pass or fail per step, plus any error text from the checklist or console. You don't need to share coordinates.

The full guide, including troubleshooting, is `docs/setup-infra-tak.md` in `crowdcad/tak-bridge`.

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
| j | Map underlay slot (approved 2026-10-07) | `src/components/modals/event/venuemapmodal.tsx`, `src/app/(main)/events/[eventId]/dispatch/page.tsx` | `MapOverlay` gains an optional `underlay` render prop, drawn beneath the image inside the transformed map container with `{ layer, rect, container, scale, setImageOpacity }`. Without it the image stays fully opaque and nothing renders differently. The dispatch page supplies it with the TAK overlay |
| l | Venue setup TAK step (approved 2026-10-07; superseded by P8, where map alignment and the live map are core) | `src/app/(main)/venues/management/page.client.tsx`, `src/app/types.ts` | A lazily loaded `TakVenueSetting` switch in Venue Configuration, and, when it is on, a "TAK alignment" step after Map rendering `TakVenueAlignStep` full width. The page saves `takEnabled` with the venue and moves a layer's `takAlignment` to the uploaded image URL when it uploads that layer's new image. `Layer.takAlignment?` and `Venue.takEnabled?` are optional; core never reads `takAlignment` |
| k | Event summary history (approved 2026-10-07) | `src/app/(main)/events/[eventId]/summary/page.tsx` | One lazily loaded `TakEventSummary` for events with `mapMode === 'tak'`, gated inline on `NEXT_PUBLIC_TAK === 'on'`. It renders nothing for anyone but the event owner |
| m | Live location and map top bar (approved 2026-10-09, D65, D66) | `src/lib/unitTracking.ts`, `src/lib/teamLocationGuard.ts`, `src/lib/teamStatusSince.ts`, `src/components/modals/event/venuemapmodal.tsx`, `src/components/dispatch/{GeoVenueMap,venuemaptab,teamwidget,leftpanellists,teamcard,teamcard-condensed,teamcardparts}.tsx`, `src/app/(main)/events/[eventId]/dispatch/page.tsx` | `TakEventAgent` writes connected units' `location` from their position and reports positions through `onTracking` (`UnitTracking`). On a TAK event core keeps Location out of call, status and schedule writes (`keepTrackedLocations`), shows a connected unit's Location read-only, lists a team's posts in its card when there is a posting schedule, and draws team and supervisor markers at `MapOverlay.unitTracking` positions only. `MapOverlay` also gains `toolbar`, where `TakBasemapToolbar` puts the underlay basemap and image opacity |

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
- **Add TAK server wizard** (D54):
  1. Name the server and choose where the bridge runs: the TAK Server machine (Docker) or this computer (a test).
  2. TAK Portal steps (create the bridge user, add it to the responders' groups, open its Enroll QR), then the TAK Server address, username and password, or the pasted Enroll QR link.
  3. Generate the bridge account, then show once a paste-ready script that writes the complete `.env` and starts the bridge.
  4. A live checklist: signed in, connected to TAK, receiving positions, with the bridge's own error text.
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

1. **TAK Portal (infra-TAK).** Create a `crowdcad-bridge` user with a password and add it to the responders' groups. The bridge enrolls for its own certificate with these credentials (D52); no `.p12` is needed.
2. **CrowdCAD: Admin > TAK > Add TAK server.**
   - **Firebase:** a secondary Firebase app with in-memory auth persistence calls `createUserWithEmailAndPassword` for `<id>@bridge.crowdcad.org`, with a password CrowdCAD generates. The secondary app is then signed out and deleted, and the admin writes `bridgeAccounts/{bridgeUid}`.
   - **PocketBase:** an admin creates a user record with `role = 'bridge'`, which doesn't change the admin's session.
   - CrowdCAD shows the `.env` block once and never stores the password.
3. **On the TAK host (or this computer, for a test):** paste the script CrowdCAD shows. It writes `.env` and starts the bridge, which enrolls on 8446 and connects on 8089.
4. **Checklist:** CrowdCAD shows signed in, connected to TAK, and receiving positions as the status arrives.

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

### P7: Basemaps and map setup
Make alignment quicker and easier to check, and give dispatchers real-world context under the event map.

- **Basemap module** (inside `src/features/tak/`): MapLibre GL JS, loaded only with the TAK module. Styles from OpenFreeMap by default; `NEXT_PUBLIC_TAK_BASEMAPS` adds or replaces styles (a style URL or raster tiles with attribution), or `off` removes outside basemaps entirely (D55).
- **Align map:** image and basemap side by side, point pairs by clicking both, place search (`NEXT_PUBLIC_TAK_GEOCODER_URL`, Photon by default, `off` to disable), and a live overlay preview with opacity. Typed coordinates and "Use my location" stay.
- **Dispatch underlay** (touchpoint j): an optional basemap under the event map, in the image's frame, per viewer, with image opacity. Rendered once as a picture with a wide margin (D60), so it costs nothing during the event and keeps working if the connection drops after it loads.
- **Smooth interactive maps** (D60): overlays on the align and summary maps move in the map's own frame, with no React render per frame.
- **History on the summary page** (touchpoint k): heat map, event map overlay and per-team stats for the owner, after the event ends.

**Accept:**
- The basemap drawn under a rotated or sheared alignment matches `latLonToPercent` to within a pixel (unit tests), including the margin area of the dispatch picture.
- The dispatch picture covers the image plus at least its longer side on every side, within a 4096-pixel canvas.
- With TAK off, nothing changes: the footprint check passes and the summary and dispatch pages render as before.
- With `NEXT_PUBLIC_TAK_BASEMAPS=off` and `NEXT_PUBLIC_TAK_GEOCODER_URL=off`, the app makes no requests to outside map services, and alignment works with typed coordinates.
- The shared criteria above hold.

**Next steps:**
- Optionally, a sharper dispatch picture rendered in the background after zooming in past about 2x, faded in over the current one.
- Optionally, the image as a MapLibre WebGL image source on the interactive maps, where the storage bucket allows CORS (Firebase Storage needs a one-time CORS setting; the emulator and PocketBase already allow it).
- A per-event default basemap chosen by the owner (would add a field to `takConfig`; a data contract change, so it needs approval).
- Tile caching or a self-hosted tile option documented for events with poor connectivity.

### P8: Geo maps (core, approved 2026-10-08)
Maps become real-world maps for every venue, not only for TAK (D64). Approved by the maintainer: the work stays on `integration/tak`; the dispatch map is a live map for aligned layers; existing posts and zones get coordinates when an aligned venue is saved.

**Data model (core types, additive):**
- `Layer.alignment?`: the image's real-world alignment (the shape `takAlignment` had). `takAlignment` is still read for venues aligned before this.
- `Layer.area?`: a drawn area of interest, `{ polygon: { lat, lng }[] }`, for a layer with no image. The live map centers on it.
- `Post.lat` / `Post.lng`: the post's position on a geo layer. They were provenance only (GIS import); on an aligned or drawn-area layer they are now authoritative, and `x`/`y` stay set when the post is inside the image (and null outside it).
- `Zone.coords?`: the polygon in `{ lat, lng }`, alongside `points` (image percent) when inside the image.
- A layer is a **geo layer** when it has an alignment that matches its image, or an area. Everything else is an **image layer** and behaves exactly as before.

**Venue setup:**
- **Map** offers three sources: upload an image, import GIS content (its bounds become an alignment automatically), or **draw an area** on the live map (click points around the area of interest).
- **Map alignment** follows Map for image layers: the aligner from P7, for any venue (no TAK switch). Optional; skipping it keeps an image layer.
- **Locations** follows alignment. On a geo layer, posts and zones are placed on the live map, anywhere, including outside the image.
- Saving an aligned venue fills `lat`/`lng` and zone `coords` for posts and zones that only had image percentages, from the alignment.

**Event and dispatch:**
- The dispatch Map tab shows a **live map** for geo layers: MapLibre with the venue image warped on top (opacity), posts, zones, team, supervisor and equipment markers, location search, and Add Call from a post or team, all by coordinates. Image layers, and a live map that can't load (offline), use today's image map.
- TAK reads the core alignment; on a live map its positions are drawn by coordinates directly, with no frame math.
- The summary's zone breakdown tests membership in coordinates on geo layers.

**Status (2026-10-08): G1 to G4 built; G5 docs done, repo e2e coverage pending.**
- **Built:** core map code in `src/lib/geo/` and `src/components/geo/`; `Layer.alignment`, `Layer.area`, `Zone.coords`; the Map step's drawn-area source; the general Map alignment step (GIS imports aligned from their bounds); Locations on the live map with draggable posts; coordinates filled on save; the dispatch live map with the image map's own markers, search and focus; event setup's live preview; coordinate-based zone membership; TAK positions pinned by coordinates on the live map.
- **Checked:** 105 unit tests (alignment, layers, positions, zones); a headless browser run on the emulators: draw an area, place a post on the live map, save, and see the post and its team on the dispatch live map, with no page errors.
- **Not yet done:** e2e scenarios in `tests/e2e` for a drawn-area venue and an aligned venue; zone editing (drag vertices) on the live map; the offline fallback to the image map is not exercised by a test.

**Phases:**
- **G1 Core alignment and map sources.** Move the map code (alignment math, basemaps, aligner, live map view) from `src/features/tak/` to core (`src/lib/geo/`, `src/components/geo/`); `Layer.alignment`; the venue Map step's three sources; the general Map alignment step; remove the venue TAK switch.
- **G2 Locations on the live map.** Post and zone placement on geo layers; conversion on save.
- **G3 Dispatch live map.** The live map view with every marker type, search, Add Call, floors, and the TAK overlay.
- **G4 Zones and summary.** Coordinate-based zone membership; the summary zone breakdown and heat map on geo layers.
- **G5 Contract and tests.** ICD and data contract, PocketBase setup script, e2e coverage for a drawn-area venue and an aligned venue, the footprint check.

**Accept:**
- A venue with only a drawn area can be dispatched on a live map, with posts placed anywhere.
- An aligned image venue shows the image warped on the live map; posts outside the image work everywhere a post works (Add Call, search, zones).
- Image-only venues and existing events look and behave exactly as before; existing e2e suites pass unchanged.
- Offline, a geo layer falls back to the image map without errors.

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
