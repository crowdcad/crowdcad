
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) and this project follows [Semantic Versioning](https://semver.org/).

> **Versioning convention:**
> - `MAJOR` — breaking changes or major platform shifts
> - `MINOR` — new features, backward-compatible
> - `PATCH` — bug fixes, copy/style tweaks, dependency bumps

---

## [Unreleased]

### Added

- **Map zones** — the venue builder's Map/Locations step gained an "Add Area" button (next to "Add Markers") for drawing a colored polygon area on the map: click to place vertices (each shown as a colored dot in the area's own color, with the first point ringed once there are enough to close), connect back to that first point (or double-click) to complete the loop, then name it and optionally check "Mark as Dispatch Zone". Areas render beneath post pins everywhere the map does (venue builder, dispatch Map tab, event creation). A dispatch zone gets its own "{name} Calls" tab in the dispatch view, positioned next to "All Calls" and before any clinic tabs (the existing "Calls" tab is renamed to "All Calls" once at least one dispatch zone exists) — a call is routed into a zone's tab automatically based on whether its location falls inside that zone's polygon, so redrawing a zone re-routes existing calls instead of orphaning them. The same zone/location association now feeds a "Zone Breakdown" on the post-event Summary page (and its exported CSV), showing calls/delivered-to-clinic/transports per dispatch zone. The GIS import dialog (Import GIS Map) now accepts an optional second GeoJSON file for polygon areas alongside its existing point-features file, matching how ArcGIS and most GIS tools export one geometry type per layer, with a worked example at `docs/examples/venue-map-import.geojson`.

### Fixed

- **Backing out of event setup no longer leaves an empty event.** "Start New Event" (and "Save & Start Event" in the venue builder) used to write a draft event as soon as the builder opened. The builder now opens at `/events/new/create?venueId=…` and the event is written only when "Create Event" is pressed.
- **Docker builds work from a fresh clone.** `Dockerfile` copied `next-env.d.ts`, which is gitignored, so `docker compose up --build` failed in the builder stage for anyone who had not run Next locally first.
- **PocketBase runs natively on Apple Silicon.** `Dockerfile.pocketbase` now downloads the release matching the host CPU (`amd64` or `arm64`) using BuildKit's `TARGETARCH`. Before this it always pulled `amd64` and ran under emulation on ARM Macs.
- **Venue and event creation work from other devices on the LAN.** `crypto.randomUUID()` only exists on HTTPS or `localhost`, so a teammate opening the app at `http://192.168.x.x:3000` hit an error when adding layers, markers, areas or equipment. A new `randomId()` helper in `src/lib/utils.ts` falls back to `crypto.getRandomValues`.

### Changed

- **Event Summary shows Staff Logs, Call Logs and Surge Log side by side** in three columns. Surge Log is always shown (with 0 activations when there were none); Data Collection Sessions moved to its own row.
- **Dispatch location dropdowns no longer animate on click.** The chevron on the team, equipment and call location fields, the map's location search and the Add Call location field only flips; the button press, ripple and hover background are gone.
- **Documentation overhaul.** Setup guides now include the `npm install` step the PocketBase scripts need, the Firebase console steps (Email/Password, Firestore, optional Storage on Blaze), deploying `firestore.rules`, LAN access, updating a fork from `upstream` and redeploying. The user guide and architecture docs match the current wizards and dispatch board. All markdown follows a new plain style (see "Docs style" in `CONTRIBUTING.md`).

---

## [1.6.0] - 2026-09-07

### Added

- **Reworked transport terminology and status handling on Calls and Clinic** — "Transporting" now reads "Transporting to" with a house-plus icon, and "Rolled from Scene" is now "Transferred to" with an ambulance icon and prompts for a transport unit number the same way the clinic's transport flow already does (logged as "Transferred to ambulance, unit #: X"). A new "Pending" (ambulance icon) status is available on both Calls and the clinic's outcome dropdown — it marks a patient as awaiting transport without resolving the call, and both sides count toward the same combined pending-transport surge threshold. The clinic's "Transported" outcome is now labeled "Transferred to" (ambulance icon) to match, and both it and a call resolved directly via "Transferred to" now count together in the event summary's "Transports" stat (renamed from "Transported"). Resolving a call by any one team (Delivered, Refusal, NMM, Unable to Locate, or Transferred to ambulance) now reliably returns every other team, supervisor, and piece of equipment still on that call back to post, instead of only the reporting team — this also fixes supervisors not being released when a call resolved via Unable to Locate or Rolled from Scene.
- **Configurable surge criteria in event creation's Advanced settings** — the number of patients pending transport (combining Calls and Clinic, default 3) and the number of minutes an unassigned call may sit before triggering surge (default 2:00) are now per-event settings with hover tooltips, alongside the existing Surge Limit percentage. Both were previously hardcoded.
- **Ending an event now actually stops data collection** — a new "End Event" nav item (after Event Summary, on the dispatch page, visible only to the event's creator or a site admin) opens a confirmation modal that requires typing "End Event" to submit, warning that data collection and logs will stop immediately and cannot be undone. Confirming locks the event (every write that goes through the dispatch board — calls, team/supervisor status, equipment — is rejected from that point on, whether ended manually or because its designated End Time passed and an hour went by with no dispatch activity logged since, a backup for events nobody remembers to end) and takes the dispatcher straight to the Event Summary. Anyone who opens an already-ended event's dispatch board directly now sees a flat grey overlay over the whole board explaining the event has ended, with a button to the summary. The venue selection page's event table (and mobile card list) gained a Status column showing "Active" (green) or a clickable "Event Summary" link for an ended event, and clicking an ended event now goes straight to its summary instead of the (now read-only) dispatch board.
- **Summary charts/stats now always represent an event's full real activity** — the reporting window's end is whichever comes later of the event's designated End Time and one hour past its last dispatch log entry, instead of stopping dead at a stale scheduled end (or, for a very old/forgotten event, potentially staying unbounded). Explicitly ending an event uses the actual moment it was ended instead.
- **Exported dispatch logs (CSV) now show a full date + time per entry** instead of a raw timestamp number, so an event that runs past midnight still reads in clear chronological order. The dispatch board's own on-screen logs are unchanged (still time-only).
- **Clarifying tooltips across event and venue setup** — Start Time, End Time, the posting repost interval, Posts, Locations, and Equipment (in both the event and venue creation flows), the team modal's Lead checkbox, and the supervisor modal's Call Sign field now show a hover tooltip explaining what the field does, most notably that an event's End Time doesn't end it automatically — it stays open until marked finished or an hour passes with no dispatch activity after that time. The Lite landing page's tagline was also removed.
- **Venue and event creation wizards: keyboard and screen-reader polish** — moving between steps (via a progress dot, or either flow's own Continue/Back) now moves focus to the new step's content instead of leaving it on a control that's no longer there, so keyboard and screen-reader users don't lose their place. The progress dots have a visible focus ring, and a short doc (`docs/COMPONENTS.md`, "Wizard step shell") explains the step-config pattern for adding a step to either wizard.
- **Venue creation is now a 5-step wizard** — Basics, Map & floors, Locations, Equipment, and Review & save, with a dot-line-dot progress indicator at the top. A completed step's dot can be clicked to jump straight there without losing anything entered elsewhere. Locations can still be placed directly on the uploaded map (in addition to typing a name) right from the Locations step, no separate step needed. The Review & save step's save action now offers starting a new event at the venue immediately, alongside the existing path back to venue selection.
- **Faster team entry modal** — the Add/Edit Team modal (event creation, and the dispatch board's Add Team / Edit Team) is now a row-based grid instead of one-member-at-a-time entry: press Enter in a member's name field to commit that row and open a new one below it, with focus and certification carried over automatically. The team name field auto-fills with the next name in sequence (`Medic 4` → `Medic 5`, or `Team 1` for the first team) and, when creating, two actions — **Save & add another** (keeps the modal open, resets for the next team) and **Save & close** — replace the old single submit button. A team now saves with zero members. A centered "+" control between the member rows and the footer now also lets a row be added explicitly, instead of relying on pressing Enter in the last row.
- **Event creation stepper restructure** — steps are now Event Configuration, Staff Assignments, Equipment, Post schedule, and Review & launch (folding the old standalone Basics/Surge criteria/Teams & supervisors steps into these). Event Configuration now also captures the event's Start Time and End Time alongside the date (an End Time at or before Start Time is treated as crossing into the next day), with Surge Limit moved behind a collapsible "Advanced settings" disclosure. The venue map panel now only appears during the Equipment and Post schedule steps, so every other step gets the full column width. Staff Assignments now splits Teams and Supervisors side-by-side with a vertical divider instead of stacking them in separate bordered cards; a team card can be edited in place via a new pencil icon, which reopens the team modal pre-filled as "Edit Team".
- The wizard's dot-line-dot progress indicator's connecting lines now run flush between adjacent dots instead of stopping short with a visible gap on either side.
- **Event-only equipment** — the Equipment step can now add an item that exists only for this event (an "Event only" chip marks it), instead of being limited to checking off items already defined on the venue. Equipment cards also got the same sharp corners as the Staff Assignments cards and now use nearly the full width of their column.
- **Event creation's map now reuses the dispatch page's own venue map rendering** (`VenueMapWithPosts`, shared with `VenueMapModal`) instead of a separate, simplified implementation — the same post/equipment icons and pan/zoom behavior apply in both places. Equipment given a default location shows the correct equipment icon (gurney, wheelchair, AED, etc.) next to that location's marker, same as it'll appear once the event is live. The map panel is now half the screen (was 2/3) on Equipment, Post schedule, and Review, and the map image now merges flush with the layer control bar beneath it — genuinely sharp corners only where they don't touch (`VenueMapWithPosts` gained an `imageRadiusClassName` override for this), square where they meet — instead of two separately-rounded, gapped boxes; the venue-name header above the map and the divider line between the wizard and map columns were also removed. The letterboxed area outside the map image itself now shows a subtle checkerboard instead of a flat, ambiguous fill.
- Team, Supervisor, and Equipment cards, the map's layer control bar, and the flow's other non-accent buttons (Add Team/Supervisor, "Save & add another", the team-modal row-add "+") now use the same `bg-default/40` flat background as the wizard's own Back button, instead of several different dark, hard-to-read greys. Checkboxes in this flow (Enable Posts, equipment selection, team member Lead) also render their checked state in the app's actual accent blue instead of a dark grey.
- Fixed the Team/Supervisor cards and the map's layer control bar still rendering their old near-black background despite the `bg-default/40` fix above: all three used HeroUI `<Card isBlurred>`, whose `isBlurred` variant adds a `dark:bg-background/20` class (`background` is pure black in this theme) with no non-`dark:` counterpart for a plain override class to conflict with — Tailwind's class-merging only drops a competing class in the same variant context, so the unprefixed `bg-default/40` coexisted with, and lost to, `dark:bg-background/20` in the browser's dark mode. None of the last several rounds of background-color changes on these three elements could ever have taken visible effect while `isBlurred` stayed on; removed it (it wasn't adding anything meaningful on a plain list card over an already-dark page anyway).
- **Venue creation now matches event creation's stepper aesthetics** — steps renamed to Venue Configuration, Map, Locations, Equipment, and Review (were Basics, Map & floors, and Review & save); Back and the primary action (Continue, or Create Venue/Save & Start Event on the last step) now sit in the same bottom-left/bottom-right corners as event creation, and Cancel now only appears (bottom-left) on the first step, replaced by Back everywhere else. The Map, Locations, Equipment, and Review steps now show the map alongside them (half the screen) whenever the current floor has one, same as event creation; Equipment and Review use the same read-only `VenueMapWithPosts` panel event creation uses (proper post/equipment icons), while Map and Locations keep their own interactive marker-placement/dragging map, now sharing the same checkerboard background, sharp corners, and solid flush-merged layer control bar treatment (extracted as `MAP_CHECKER_BG` in `src/lib/mapStyles.ts`, shared by both pages). Location and equipment list cards also switched to the same sharp-corner, `bg-default/40` card style as event creation's Staff Assignments/Equipment cards.
- **Configurable default equipment location in venue creation** — the Equipment step can now assign each item a default location (the same location Select used in event creation), instead of that being event-only. Adding that equipment to an event now starts from the venue's configured default instead of blank, still adjustable per event from there.
- The Map step in venue creation now shows its map at full width — "Venue Map" (label no longer says "(Optional)"), the floor name, and Add Markers stay in their header row above it, but the map no longer shares the row with a half-width column the way Locations/Equipment/Review do (there's nothing to put beside it on this step).
- Fixed venue creation's own interactive map (Map and Locations steps) barely panning at the default zoom level: it clamped drag position to the image's actual edges, which at the default 1x zoom (image already fits its container) left almost no room to drag at all. Dropped the clamp so it pans freely, matching `VenueMapWithPosts`'s (and event creation's) behavior.
- Fixed the Equipment and Review steps' read-only map showing nothing for a map that had just been uploaded but not yet saved: that panel read `mapUrl` straight from the venue's saved layer data, which doesn't have the new map until the venue is actually saved, while the Map step's own interactive view was already showing it via a local preview URL. The read-only panel now uses that same pending preview when there is one.
- Fixed venue creation's page being a few pixels taller than the actual viewport (forcing a vertical scrollbar): its height was computed as `100vh - 3rem`, 8px short of the navbar's real 3.5rem height — now `100dvh - 3.5rem`, the same calculation event creation already used.
- Venue and event actions gated by ownership (edit, delete, share, starting a new event at a venue you don't own) now disable themselves in the UI with an explanation, instead of failing after the fact.
- Admins can designate an event as an "org event" from its 3-dot menu, making it visible to and dispatchable by every org member, the same way org venues already work.
- **Pending-call surge alerts** — the "Pending" chip shown in place of a team before a call is assigned now ticks a live mm:ss timer, and starts blinking between grey and a new true-orange `status-alarm` color once a call has been pending 1+ minute. Crossing 1 minute also fires a one-time toast, and the call log now notes how long a call sat pending once it's finally assigned. Clinic calls have a new "Pending Transport" status (for patients awaiting transport); a second surge toast fires whenever 3 or more clinic calls are marked Pending Transport at once.
- **Calls/Clinic panel: sticky layout, granular insights, manual surge button** — the tab bar, stat row, and Add Call/Add Patient button now stay pinned to the top of the panel, as does the table's column-label row; only the rows scroll (with the app's thin scrollbar) once they exceed the available height. The old single "Total Calls"/"Total Patients" line is replaced with an inline stat row — Total Calls Logged / Active / Pending / On Scene / Transporting for Calls, Total Patients / In Clinic / Transported / Pending Transport for Clinic. A new Surge button next to the tabs lets a dispatcher manually declare a team-wide surge, ticking a live elapsed timer and pulsing with the same alarm animation as the Pending call chip while active; it also auto-activates the moment the existing percent-on-calls threshold (`surgeLimitPercent`) is crossed, without clobbering an already-running timer, and disabling it now asks for confirmation.
- **Event Name and Event Date are now required** before advancing past Event Configuration, matching venue creation's existing name requirement — the other steps' progress dots stay locked until both are filled, and Create Event itself checks the name too.
- Venue creation's Locations, Equipment, and Review steps now give the map 2/3 of the screen (was half), matching how much room venue creation gave it before this whole restructure — event creation's own map-showing steps are unchanged at half.
- Review step label/value pairs (both venue and event creation) use a slightly larger font, and both now have a "Review" heading matching the other section headers. Section headers in every step that shows the map alongside it (Equipment/Post schedule/Review in event creation; Locations/Equipment/Review in venue creation) are now a consistent, larger size.
- **Deleting a venue's only floor now clears its map instead of being blocked** — a venue always needs at least one layer, so this used to just show a "Cannot delete the last layer" alert; it now resets that floor back to "no map uploaded" (after confirming), the same as if you'd never uploaded one.
- Event creation now skips the Equipment step entirely for a venue with no equipment of its own defined, instead of showing an empty tab.
- Reduced the padding between the left column's content and the map column on every split-screen step (both venue and event creation), giving the left column more usable width.
- Venue creation's Locations step now shows the same simple, read-only floor indicator as Equipment/Review instead of the full layer control bar (replace map, add/delete layer) — adding, replacing, or deleting a layer is Map-step-only now.
- **Lite mode event creation now matches cloud event creation's wizard** — Event Configuration, Locations, Staff Assignments, Equipment, Post schedule, and Review, reusing the same step shell, progress indicator, and Team/Supervisor/Equipment/Posts/Schedule section components as the cloud flow, instead of its own bespoke tabbed layout. No map/floor logic is included, since Lite mode has never had one; a new Locations step lets Lite events define their own ad-hoc location and equipment catalog in place of picking a pre-existing venue.
- The dispatch page navbar's "Posting Schedule" button now only appears when the current event actually has a posting schedule configured, instead of always showing regardless of setup. (The "Venue Map" nav button this line used to also cover no longer exists — see the new Map tab, below.)
- **Venue maps can now be imported from GIS data** — the venue Map step gained an "Import GIS map" option (next to Add Layer) that takes a flattened background image plus a GeoJSON FeatureCollection of named Point features (each becomes a post, with `isClinic` optionally flagging it as a clinic) and a `bbox` giving the image's real-world extent; the importer projects each point onto the image using that extent and shows a live marker-over-image preview before committing, so a mismatched bbox is obvious before import instead of after. Works both as a venue's first floor and as an added one.
- **The dispatch board's venue map is now a Map tab beside Calls/Clinic** instead of a modal opened from the navbar — always one click away, filling the whole panel below the tab strip. Its own thin header bar shows the current floor's name with prev/next arrows (multi-floor venues only) and a location search that jumps to the right floor and calls out the matching post with a bouncing arrow. Clicking any post or team marker shows a small "Add Call" button just beneath it, prefilled with that location or team respectively (dismisses on an outside click); the Add Call form now focuses whichever field is first, in on-screen order, still empty, instead of always Location. Team cards (normal and condensed) gained a map-icon button, shown only when the venue has a map, that jumps to this tab and calls out that team the same way.
- **Every marker on the venue map (dispatch, event creation, venue management) redesigned** — a single filled pin/icon with a white outline and drop-shadow, sized independently of the map's zoom level, instead of a low-opacity colored circle behind a plain icon that grew or shrank with zoom. Post pins use CrowdCAD's brand blue; team and equipment markers keep their existing status/equipment colors but now carry them on the icon itself instead of a background ring (the wheelchair/gurney equipment icons are separate raster assets and can't take a fill color the same way, so they're unchanged aside from the shared drop-shadow). A team's stagger offset from its post now shrinks as you zoom in instead of growing.
- **Event posts now start with none selected** instead of every venue post pre-selected, with a new "Enable All" button beside the Posts select for picking them all in one click when that's what's wanted.
- **Venue map markers gained a supervisor pin and equipment status badges** — a new supervisor marker (shield icon) renders at a supervisor's post using the same status-color mapping as team markers, positioned so it doesn't stack with a team or equipment marker sharing that post; equipment markers now sit inside a colored status badge instead of a bare recolored icon. Team and equipment marker offsets from their post now scale correctly at every zoom level (equipment's previously grew when zooming in instead of shrinking), teams sharing the exact same post now stagger apart instead of rendering on top of each other, and a team's "Add Call" map popup disables itself when that team already has an active call.
- **Map markers now hover-enlarge and support "view on map" from every card type** — team, supervisor, and equipment pins all share the same hover/selected enlarge treatment (previously team-only), and equipment/supervisor cards gained their own "view on map" button, matching team cards. All three buttons disable themselves, with an explanation, when that entity's current location isn't an actual mapped post (e.g. Roaming, In Clinic).
- **Mobile dispatch UI overhaul** — a sticky top bar keeps the team availability strip visible while scrolling; the bottom tab bar was rebuilt with sharp corners, larger tap targets, and a new five-tab Teams/Equipment/Calls/Clinic/Map layout; Teams gained a Teams/Supervisors switcher dropdown and Clinic a dropdown in place of per-clinic tabs; Calls and Clinic gained header "Add Call"/"Add Patient" buttons and switched their mobile cards to the same divider-list pattern Teams already used, with slide open/close animations for cards and "hide resolved" sections. Also fixes a stray unthemed blue on light-mode "selected" nav states, which now derives from the app's accent token.
- **Surge now auto-activates on every configured threshold** — previously only the percent-on-calls threshold auto-activated the surge indicator; the pending-transport-count and unassigned-call-time thresholds now do too, without clobbering an already-running timer. The +Team/Supervisor/Equipment button on a call now disables once that call is resolved, re-enabling only if the team whose status change actually resolved it is reverted. Status icons were removed from dropdown menus (the pill display keeps its icon; menu options now spell out the status as text, e.g. "Transporting to Clinic") and the resolved-call status list is now defined in one place instead of three.
- **Venue map: pinch/scroll zoom and review-step redesign** — the dispatch Map tab and venue management's editing map gained ctrl/cmd+scroll zoom and touch pinch-to-zoom/one-finger-pan, alongside a fix for a team/supervisor/equipment highlight replaying incorrectly when navigating back to the Map tab. Event creation, venue creation, and Lite mode's Review steps now render as side-by-side columns (one per wizard step) instead of one long list. The Map tab's keyboard shortcut moved from Ctrl+M to Alt+M, the Add Call popup now opens above its pin instead of below, and new black wheelchair/gurney icon variants keep status-pill icons legible in light mode.
- **Add Team/Supervisor/Call modals switched to a flat, unbordered input style** (previously `variant="bordered"`), with a corrected primary color shade scale; condensed team cards gained spacing above the "Team Members"/"Activity Log" titles and their timer; and every small (`size="sm"`) Button/ButtonGroup now uses a fully-rounded radius consistently.
- **Event summary page charts rebuilt** — the calls-by-team pie chart was replaced with a per-team stacked bar (Available / On Break / In Clinic / On Calls) plus attached-calls on a secondary axis, and calls-per-hour was replaced with a Total Team Availability chart bucketed every 10 minutes. The page dropped its diagonal background streaks for the shared "boxy grid" look, and chart tooltips now use a themed dark background with per-series text color instead of Recharts' default white tooltip. An event's schedule From/To is now persisted as `scheduleStart`/`scheduleEnd` and used directly as the summary's reporting window.

### Changed

- Replaced the repo's abbreviated AGPL-3.0 license notice with the full GNU Affero General Public License v3.0 text.

### Fixed

- Firestore rules: a non-admin organization member could previously update, share, or delete any other member's venue just by being in the same org. Only the venue's creator or a site admin can do that now; other org members still have read access.
- Firestore rules: creating a venue or event required an `orgId` field the app never actually sets, which made creation impossible once these rules were deployed. Creating one now only requires being signed in and naming yourself as the owner.
- Profile page: an admin account was sometimes not recognized as admin on first load, only appearing after a manual reload. The admin check now uses a live subscription instead of a one-time fetch, so it self-corrects instead of getting stuck.
- Firestore rules: any query (as opposed to a single-document read) against venues or events — e.g. the admin "delete user and their data" flow — failed outright with a rules evaluation error. Caused by a rule that read its own document via `get()` instead of the already-bound `resource.data`, which Firestore doesn't support for list queries.
- Dispatch page: a non-admin org member opening a show designated as an "org event" was booted to the login screen instead of the dispatch view. The page's own authorization check only recognized the event owner, admins, and users explicitly listed in `sharedWith` — it never accounted for `isOrgEvent`, even though Firestore rules and the venue selection screen already treated org events as visible to every member.
- Firestore rules: even after fixing the dispatch page's client-side check above, a shared or org-event member who got into the dispatch view still couldn't do anything there — every dispatch write (assigning a team, changing a call's status, the page's own on-load clinic sync) failed with permission-denied. The `events` update rule only allowed the owner or a true `orgId` org member (which the app never sets); it never considered `sharedWith` or `isOrgEvent`. Update now also allows a user listed in `sharedWith` or any member when the event is flagged `isOrgEvent`; delete remains owner/admin-only.
- **Firestore rules: that broadened update rule went too far** — a shared or org-event member could write to *any* field on the event doc via a direct Firestore call, including `userId`, `sharedWith`, `isOrgEvent`, `ended`, and `endedAt`, none of which the app's own UI ever lets a non-owner touch (those buttons enforced it client-side only, which a direct write bypasses). That meant a shared or org-event member could invite outside people into a private event, flip `isOrgEvent` to expose someone else's private event to the whole org, or end an event out from under its owner. A non-owner, non-admin dispatcher can still write ordinary dispatch fields (calls, staff/supervisor status, equipment) as before, but those five fields are now owner/admin-only, matching the intent the client-side checks already had. Venues were unaffected — their update rule was already owner/admin-only for every field.
- **Firestore rules: any signed-in user could grant themselves admin** — the `/users/{userId}` rule let a user write any field on their own doc, including `isAdmin`, which `isRequestingUserAdmin()` treats as the source of truth everywhere else in this file (editing/deleting any venue or event, managing other admins, etc.). Self-writes can no longer touch `isAdmin` (on create or update); only an existing admin may grant or revoke it, for themselves or anyone else — matching what the Profile > Admin panel's own UI already implied but never actually enforced.
- **PocketBase: the self-hosted backend had no equivalent of any of the above** — `scripts/setup-pocketbase.js` (the one-time provisioning script every self-hoster forking this repo runs) created `venues` and `events` with PocketBase's default "any signed-in user" rule for every operation, i.e. not even scoped to owner or org member, and never touched the built-in `users` collection's rules at all (a manual admin-UI step the script only ever printed a reminder about). Both are now owner/admin-scoped to match `firestore.rules` exactly — including the field-level restriction on events' `userId`/`sharedWith`/`isOrgEvent`/`ended`/`endedAt` and the `isAdmin` self-escalation guard — and are applied automatically, re-asserted on every run (including against a collection that already existed under the old rules), so a fresh or already-running self-hosted deployment gets these guarantees without a manual step. Also fixes two related PocketBase-only bugs this surfaced: the `events` collection was missing the `isOrgEvent`/`ended`/`endedAt` fields entirely (PocketBase silently drops fields not in a collection's schema, so "Designate as org event" and "End Event" would appear to work but never actually persist), and `dispatchLogs` was missing `userId` (the field the app already queries it by).
- `useCertifications` queried the (auth-gated) `settings` collection on mount without waiting for Firebase Auth to finish restoring the session, so a hard refresh of the event-create, dispatch, or admin-certifications screens could throw "Missing or insufficient permissions" before the user's session was recognized. The hook now waits for auth to be ready, skips the query entirely when signed out (falling back to the built-in certification list, same as lite/local mode), and no longer lets a transient read failure surface as an unhandled error.
- Expanding a call's or clinic patient's Notes/Log panel could shave a pixel or two off the bottom border of the Log textarea, same sub-pixel grid-track-rounding issue already fixed for team cards. The expand animation now switches to `overflow: visible` once fully open here too (`overflowVisibleWhenOpen` on `DispatchMotionCell`), instead of only in `teamcard.tsx`/`teamcard-condensed.tsx`.
- Restored the app's actual accent blue on the loading spinner, the "Start Lite Mode" button, and the profile page's admin/preferences Switches, which had all silently gone grey when dark-mode `primary` was repurposed into a near-black grey ramp for a modal button surface (#39) — `color="primary"`/`color="default"` are both grey in this theme now, so these specific controls point at the real `accent` token instead. Also sharpened the remaining `rounded-2xl` corners #42 missed: profile page list-row cards, and the Lite event creator's Locations/Equipment (and Teams/Supervisors/Posts/Equipment) tabs, the location/equipment name input+Add button combo, and their added-item row cards.
- Calls/Clinic panel stat row (`TrackingInsightsRow`): the space between each label's colon and its count relied on a single literal space character in the label text, which read as too cramped next to the count. Adds a small flex gap on top of it for real visual breathing room.
- Team/Supervisor/Location card labels in the Staff Assignments and Lite Locations steps were rendering with the bottoms of descenders (lowercase `y`, `g`, etc.) clipped off — the page-level `leading-none` these steps sit under shrank the text's line box tighter than the font's actual glyph height, and the label's own `overflow-hidden` (from `truncate`) then cropped it. Labels now set their own normal line height, without changing the card's height (already governed by its taller edit/delete buttons). Delete buttons across these cards now render in red instead of the same grey as Edit, matching venue management's existing delete buttons. Lite mode event creation also no longer shows the diagonal-streaks background other Lite pages use — it clashed with the new wizard layout.
- Every rounded-square component in the app — inputs, buttons, cards, modals, dropdowns, chips — could render at a visibly different corner radius depending on which of HeroUI's small/medium/large tiers (or Tailwind's own xl/2xl/3xl) it happened to request, since nothing tied those tiers to the same value. All non-none/non-full tiers now collapse to the one Button already used by default, so corners match everywhere without having to special-case every call site (`rounded-none` and `rounded-full` are untouched — those are a different shape, not a scale mismatch).
- Venue selection: a venue's own card in the venue list rendered with no background at rest (only on hover), while the event rows/cards shown once a venue is selected already had one — the venue cards now share that same background.
- Cloud event creation's posting schedule was always generated regardless of whether "Enable Posts" was checked (lite mode already respected it), so the navbar's Posting Schedule button showed up for every event instead of only ones that actually enabled posts.
- The repost-from-schedule button above the Calls/Clinic tabs now disables when the event has no posting schedule configured, instead of being clickable with nothing to actually refresh from.
- Enabling surge now asks for confirmation, matching disabling it.
- Setting a team's status to Available no longer touches its location — teamcard.tsx/teamcard-condensed.tsx already compute the right destination (its original post, a pending assignment, or its last valid location) and apply it themselves right before the status change; a second, cruder fallback inside the status-change handler was overwriting that immediately after, which is why moving a team from On Break to Available incorrectly relocated it to "Roaming".
- Team cards briefly showed a page scrollbar when opening or closing — their expand animation's `overflow: visible` switch (needed once fully open, so a bordered box like the Log textarea doesn't get a pixel shaved off its bottom edge by height-rounding) was applied the instant the state flipped, before the height transition had actually finished growing the row, so the still-clipped content's real height poked out for the whole ~300ms animation. Now waits for the transition's own end event.
- Fixed a sitewide dark-mode contrast bug: several Input/Select/TimeInput/DatePicker/Chip/Spinner instances passed `color="primary"`, but this theme's dark palette repurposes `primary` into a near-black grey for button surfaces — so an unstyled text/icon slot using it (a Select's chevron, a Chip's label) rendered nearly invisible. Switched to `color="default"` for these, leaving actual Button/Chip surface uses of `primary` untouched.

---

## [1.5.0] - 2026-08-24

### Added

- **Availability tracking and surge notifications** — a new availability/surge strip in the dispatch sidebar (and mobile/tablet layout) buckets teams into Available / On Break-Clinic / On Calls and shows a percent-on-calls meter that shifts from green to red at the event's configurable surge limit (`Event.surgeLimitPercent`, default 70%). Crossing the limit fires a one-time warning toast (also fixes react-toastify's `ToastContainer` never having been mounted on the dispatch page, which had silently no-opped every existing `toast.*` call).
- **Multiple named clinics (complete)** — follow-up to the 1.4.0 foundation. `events.clinics` is now a real, schema-backed field (was silently dropped on PocketBase before) and is kept in sync with the venue's clinic-flagged posts via stable per-post `clinicId`s that survive a clinic being renamed. When a team is marked Transporting on a multi-clinic event, dispatch now prompts for which clinic the team is heading to instead of always routing to the first one; the chosen clinic is written onto the call immediately. Team-status pills, call chips, resolved/"Delivered" chips, activity logs, and the venue map's team tooltip all reflect the destination clinic; single-clinic events are visually unchanged. Map-builder clinic markers (canvas, location list, and the dispatch-side venue map) now consistently use a clinic icon driven by the real `isClinic` flag instead of a name-string heuristic in one of the three spots.
- **Reversible call resolution and transport unit capture** — resolving a call is no longer a one-way action, and a new transport-unit modal captures which unit a team transported with, threaded through the dispatch vocabulary and tracking table.
- **Centrally configurable status-card colors and opacities** — dispatch status-card colors and opacities now live in a single `src/lib/colorTokens.js` source of truth, consumed by `statusColors.ts` and `tailwind.config.js`, instead of being scattered across individual components.
- PocketBase data interface control document (`docs/ICD.md`) — a backend-agnostic description of the PocketBase collections/fields and REST/SSE access, written so external integrations (including the in-progress TAK/ATAK integration) can read and write CrowdCAD data without depending on CrowdCAD's own frontend.
- Dispatch vocabulary presets and terms from the profile refactor, including French translations for the new surge/availability strings.

### Changed

- Profile refactor: significant cleanup of the profile flow and its surrounding UI (see `#19` for full detail).

### Removed

- User avatar and profile photo upload/display logic, removed as part of the profile refactor.

### Fixed

- Equipment status select no longer flakes in E2E under rapid status changes.
- Clinic call rows now align with call-tracking table behavior/columns.
- PocketBase backend now persists the dispatch language preset on the users collection instead of losing it.
- Event/venue creation UI colors now adapt correctly to light mode.
- E2E suite no longer hangs on `networkidle` waits caused by a Firestore write firing on every page load.

### Maintenance

- Dependency updates within existing semver ranges; `@playwright/test` held back to fix a CI break it introduced.

---

## [1.4.0] - 2026-08-11

### Added

- **Multiple named clinics (foundation)** — venues can now designate specific locations as clinics (`Post.isClinic`), and an event can define multiple clinics (`Event.clinics`). Dispatch renders one named tab per clinic instead of a single hardcoded "Clinic" tab, and calls carry a `clinicId` field. Picking which specific clinic a call routes to is intentionally deferred to a follow-up — this release lays the data-model and UI foundation only.
- **CSV bulk upload for teams and supervisors** — download a template, fill it out, and import via a new split "Add Team"/"Add Supervisor" button (download template → upload → validated preview → import), instead of adding staff one at a time.
- **Loading feedback on "Start New Event"** — the button now shows a spinner and disables itself while the draft event is being created, instead of giving no feedback during the write.
- New Claude Code skill (`event-venue-creation-design`) documenting the design conventions for event- and venue-creation surfaces, scoped to keep them out of the dispatch page's own visual language.

### Fixed

- Teams/Supervisors/Posts/Equipment tabs on the event-create page no longer end their blurred panel at different heights — replaced a duplicated viewport-relative magic number with real flexbox fill, so every tab's content area shares an identical bottom edge.
- Lite mode's staffing panel blur now matches cloud mode's (it previously read "washed out" from a Tailwind opacity class colliding with HeroUI's `isBlurred` styling at equal specificity).
- Cloud mode's Add Team / Add Supervisor buttons now carry visible text labels instead of being icon-only.
- Cloud event-create page no longer scrolls vertically — it now uses the same `100dvh - 3.5rem` height calculation as lite mode (accounting for the app navbar's actual rendered height), and its tabs span the full width of the panel like lite's do.
- Unified list-item card, chip color, button color, and header spacing between lite and cloud event-create surfaces, and matched bottom panel padding so tab content no longer touches the edge of the screen.

---

## [1.3.0] - 2026-07-09

### Added

- **PocketBase self-hosted backend support** — opt-in via `NEXT_PUBLIC_BACKEND=pocketbase`, giving LAN/local deployments a no-cloud-account option alongside Firebase. Implemented as a backend-agnostic service layer (`src/lib/services` — `IAuthService`/`IDbService`/`IStorageService` interfaces with `firebase/` and `pocketbase/` adapters selected by `factory.ts`), plus `docker-compose.yml`, `Dockerfile.pocketbase`, and `scripts/setup-pocketbase.js` for collection setup.
- Docker production and development environment (`Dockerfile`, `Dockerfile.pocketbase`, `docker-compose.yml`).
- GitHub Actions CI/CD pipeline (build, lint, type-check, E2E against both backends) and automated release drafting (`.github/workflows/`).
- BDD end-to-end test suite bootstrap (Playwright + `playwright-bdd`, Firebase emulators) covering dispatch, event creation, venue management, auth, and profile flows, with a parallel PocketBase E2E configuration.
- Roles are now fetched from the persisted store instead of hardcoded values.
- Dispatch tracking composition utilities added under `src/components/dispatch/`:
  - `trackingtablebase.tsx` — shared table shell and row rendering structure used by call and clinic tracking.
  - `trackingtextentry.tsx` — shared inline text entry control used across team, call, and clinic flows.
  - `motioncell.tsx` — shared animation-aware table cell wrapper for smoother row transitions.
- Shared animation utilities now drive add/remove and collapse/expand transitions in dispatch cards and tracking rows with reduced-motion support.

- Foundation refactor: extracted core utilities to `src/lib/` for reuse across features:
  - `uploadUtils.ts` — file upload with exponential backoff retry logic (transient error detection, original error preservation).
  - `zoomPanUtils.ts` — viewport math utilities (`clampScale`, `clampPanPosition`) for consistent zoom/pan behavior.
  - `markerUtils.ts` — marker detection and placement helpers.
- Shared React hooks extracted to `src/hooks/` for reuse:
  - `useZoomPan` — manages zoom/pan state and mouse/wheel event handlers for map-based interfaces.
  - `useScheduleGeneration` — generates shift schedules from event duration and team coverage.
  - `useTeamForm` — team/supervisor form submission and validation.
- Shared UI primitives added to `src/components/ui/`:
  - `map-zoom-controls.tsx` — zoom in/out/reset button cluster with accessibility labels (reused across event create and venue management).
  - `map-pan-surface.tsx` — reusable pan/wheel interaction surface for canvas-based viewers.
- Event creation flow decomposed into focused section components under `src/components/event-create/`:
  - `MetadataSection.tsx` — event name, date, and venue selection.
  - `TeamStaffingSection.tsx` — team roster assignment.
  - `SupervisorStaffingSection.tsx` — supervisor roster assignment.
  - `PostingScheduleSection.tsx` — shift schedule generation and management.
  - `PostsEquipmentSection.tsx` — posts and equipment selection with multi-select state.
- Venue management flow decomposed into focused section components under `src/components/venue-management/`:
  - `EquipmentManagementSection.tsx` — add/edit/delete equipment with stable React keys.
  - `LayerControlBar.tsx` — layer navigation (previous/next/add/delete) with accessibility labels.
  - `MarkerModeToggleButton.tsx` — toggle marker placement mode.
  - `PendingMarkerDialog.tsx` — marker naming dialog.
  - `MarkerPlacementInstruction.tsx` — on-screen guidance during marker placement.
- Lite event drafts now persist a `postingScheduleEnabled` flag to keep posting schedule behavior consistent between setup and dispatch.

### Changed

- Navbar refresh: increased contrast in light mode, resized/recolored for greater contrast and more compact viewing, and realigned mobile navbar buttons for consistency.
- Color and opacity constants centralized in config instead of scattered literals.
- Dispatch right panel now uses browser-style secondary tabs with active counts and a compact header action bar (`Add Call` with keyboard shortcut hint).
- Call and clinic tracking now share aligned table and card visual language, including unified shells, spacing, and row structure.
- Team cards received a UI refresh: transparent shell, square corners, divider structure, chevron expand indicator, refined map pin sizing, and clearer member/cert formatting.
- Team card expand/collapse now uses smooth row height and opacity animation with reduced-motion fallbacks.
- Status color logic is centralized in `src/lib/statusColors.ts` and reused across team chips and dispatch status rendering.
- Tracking text fields for chief complaint and location were resized and standardized through shared `TrackingTextEntry` usage.
- Status box text area was expanded for better readability of longer status updates.

- Event creation page (`src/app/(main)/events/[eventId]/create/page.tsx`) now uses decomposed section components instead of a monolithic page layout, improving maintainability and testability.
- Venue management page (`src/app/(main)/venues/management/page.client.tsx`) now uses decomposed section components and shared map controls instead of page-local implementations.
- Dispatch call tracking page now threads styling through `rowClassName` prop to restore per-status visual differentiation.
- Pan math in `zoomPanUtils.clampPanPosition` corrected to properly clamp against scaled image overflow (fixes off-by-factor error at different zoom levels).
- Lite setup Locations/Equipment add row now uses an attached input + action button style with aligned corner radii and consistent spacing.
- Teams and Supervisors panel actions in Lite setup now use explicit `Add Team` and `Add Supervisor` buttons.
- Lite dispatch navbar now hides `Posting Schedule` when posting schedule is disabled in event setup.
- Lite navbar primary links were simplified to focus on Lite routes (`Lite Home`, `Create`).
- Landing page copy and CTA text were refined (`CrowdCAD Lite` footer label and Lite subtitle wording), and Lite CTA iconography was simplified.
- Updated `public/logo.svg` artwork/viewBox for refined logo rendering.

### Fixed

- Calls tab now visually matches the Clinic tab: shares the `TrackingTableBase` scaffold and header/button chrome, and `Add Call` (a pill button matching Clinic's `Add Patient`) replaces the old icon-only `+`. This also fixed a header/body column-count mismatch that had misaligned every column from Status onward.
- Resolved calls (Delivered, NMM, Unable to Locate, Refusal, etc.) no longer show a stale "Pending" team marker just because their team was detached.
- The call actions (3-dot) menu no longer force-closes on resolved calls when "Show Resolved Calls" is enabled.
- Team-status dropdown no longer closes spuriously from a stray upstream self-close race in the popover library.
- Fixed a dispatch dual-mount bug and E2E test-data collisions in seed data, and corrected a nested-dialog Playwright locator.
- Backend-agnostic bypass logic (`src/app/firebase.ts`) now checks `NEXT_PUBLIC_BACKEND === 'pocketbase'` explicitly rather than inferring it from other env vars, so the app never silently falls back to the wrong backend.
- Profile edit no longer passes `photoURL` to `updateProfile()` in PocketBase mode, where the adapter doesn't support it.
- E2E seed-db `bulkCreate()` document IDs no longer collide across chunks (ID now incorporates chunk index and item index).
- CI workflow `contents: write` permission scoped to the publish-report job instead of top-level.
- Repaired a broken PocketBase client initialization path and hardcoded CI E2E test credentials.
- Resolved-row action menus now close correctly when rows are resolved and hidden, preventing orphaned dropdown menus.
- Removed ghost/shadow rendering artifact in tracking text entry fields while scrolling.

- Upload retry logic now only retries on transient Firebase Storage errors (`storage/retry-limit-exceeded`, `storage/unknown`) to avoid masking real failures, and preserves original error for diagnostics.
- Removed initial navbar mount flicker/layout shift on page reload by rendering the main app navbar in the initial render path instead of client-only lazy loading.
- Equipment list now uses stable React keys (`item.id`) instead of array indices to prevent component state loss on edit/delete operations.

---

## [1.1.0] - 2026-03-19

### Added

- Lite mode local-only workflow for event setup and dispatch, including browser-local persistence without Firebase sync.
- Lite dispatch navbar controls for Posting Schedule, Clear Event, and Export Summary actions.

### Changed

- Unified Lite and Cloud dispatch onto a shared dispatch UI flow to reduce duplication and keep feature parity.
- Lite dispatch navbar behavior now mirrors main app navbar behavior (clock placement, auth controls, desktop/mobile parity).
- Lite dispatch route now uses a lightweight wrapper that delegates to the shared dispatch page.

### Fixed

- Resolved Next.js route export/type issues on dispatch pages that could fail production builds.
- Cleared lint/type build blockers across dispatch, venue management, profile, and modal components.
- Updated venue map icon rendering to satisfy Next.js image lint requirements.
- Suppressed non-actionable React hydration mismatch warnings in development when browser extensions inject attributes on root HTML/body before client hydration.

---

## [1.0.0] - 2026-02-28

Initial public release of **CrowdCAD** — an open-source, browser-based Computer-Aided Dispatch system for volunteer EMS and event medical teams.

### Core Platform

- **Next.js 15 App Router** frontend with TypeScript, TailwindCSS, and HeroUI component library.
- **Firebase** backend: Email/password authentication, Firestore real-time database, Firebase Hosting deployment pipeline.
- **Firebase Data Connect** schema (Cloud SQL / PostgreSQL) for structured event, unit, and incident data.
- **Dark-mode** design system with a custom token palette (`surface`, `accent`, `status.*`) applied globally via Tailwind.

### Event Management

- Create and configure events with name, date, venue, and posting schedule.
- Per-event posting schedules: define time slots, assign teams to posts, and edit times inline.
- Scheduled auto-post sync: at each posting-time boundary the system automatically prepares teams to be moved to their assigned posts.
- Event summary page with activity charts (`SummaryCharts`).
- Share modal to grant other authenticated users access to an event.
- End-event modal with summary navigation.

### Venue Management

- Create and edit venues with metadata (equipment capacity, medical post definitions).
- Image-based interactive venue maps with named layers; markers for teams and equipment are customizable.
- Equipment staging locations attached to posts.

### Dispatch Interface

- **Call tracking table** — live call log with columns for call number, chief complaint, age/sex, location, status, and assigned teams.
- **Clinic tracking** — separate table for walk-up patients with walkup-entry modal.
- Quick-call entry form for rapid incident creation.
- Priority call flagging (visual highlight and sort).
- Duplicate call detection and resolution workflow.
- Cell-level inline editing for call fields with click-to-edit UX.
- Per-call team assignment with status tracking and log entries.
- Resolved-call archive toggle (show/hide resolved rows).

### Team & Supervisor Management

- Add, edit, and delete field teams with named members and certification levels (FR, FA); lead designation per member.
- Add, edit, and delete supervisors with call sign and certification.
- Team status and location controls; per-team status timer derived from activity log.
- Sort teams by availability, name (A→Z / Z→A).
- Condensed team card view mode for high team-count events.

### Equipment Tracking

- Equipment cards with status (Available / Deployed / In Use / Maintenance), current location, and staging location.
- Add venue-defined equipment to the dispatch board.
- Inline location editing with commit-on-blur.
- Equipment reset-to-staging-location bulk action.
- Soft-delete equipment from active board.

### Infrastructure & Documentation

- `.env.example` with all required Firebase and SMTP environment variables documented.
- `firebase.json.template` for self-hosted Firebase Hosting setup.
- `firestore.rules` with baseline security rules.
- `scripts/backfillOrgIds.js` migration helper.
- Full documentation suite: `ARCHITECTURE.md`, `COMPONENTS.md`, `DEPLOYMENT.md`, `FIREBASE_SETUP.md`, `USER_GUIDE.md`.
- `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `LICENSE.md` (AGPL-3.0).

---

*For upgrade notes and migration steps, see the relevant release on GitHub. For security vulnerabilities, follow the process in [SECURITY.md](SECURITY.md).*

[Unreleased]: https://github.com/evanqua/crowdcad/compare/v1.4.0...HEAD
[1.4.0]: https://github.com/evanqua/crowdcad/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/evanqua/crowdcad/compare/v1.2.0...v1.3.0
[1.1.0]: https://github.com/evanqua/crowdcad/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/evanqua/crowdcad/releases/tag/v1.0.0

