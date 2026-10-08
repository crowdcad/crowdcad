> This document reflects CrowdCAD 1.6.0 plus the unreleased map zones work (checked 2026-09-29). The PocketBase schema and API surface can change independently of the app, so verify against a live `/api/collections/{name}` response if anything looks stale.

# CrowdCAD Interface Control Document (ICD): PocketBase Backend

## 1. Overview

CrowdCAD is a dispatch and event-staffing web application (Next.js) used to plan events, staff venues and run live dispatch during an event (tracking calls, team status, equipment and post assignments).

CrowdCAD supports two interchangeable backends, selected at build/runtime via the `NEXT_PUBLIC_BACKEND` environment variable: **Firebase** (default) and **PocketBase** (self-hosted, e.g. for LAN/offline deployments). This document describes only the **PocketBase** backend (`NEXT_PUBLIC_BACKEND=pocketbase`), currently pinned to **PocketBase v0.37.1** (see `Dockerfile.pocketbase`).

This document is written to be integration-agnostic: it describes the raw PocketBase data interface (collections, fields, REST/SSE access) so that any external system (CrowdCAD's own frontend, a TAK integration or anything else) can read and write CrowdCAD data correctly.

## 2. Accessing the Data

### 2.1 Base URL

All access goes through a single PocketBase server, e.g. `http://<host>:8090`. The app reads this from `NEXT_PUBLIC_POCKETBASE_URL`.

### 2.2 REST endpoints

PocketBase exposes a standard REST API per collection at `/api/collections/{collectionName}/records`:

| Operation | Method & path |
|---|---|
| List/search | `GET /api/collections/{collection}/records?filter=...&sort=...&page=...&perPage=...` |
| View one | `GET /api/collections/{collection}/records/{id}` |
| Create | `POST /api/collections/{collection}/records` (JSON or multipart body) |
| Update | `PATCH /api/collections/{collection}/records/{id}` (partial: only sent fields change) |
| Delete | `DELETE /api/collections/{collection}/records/{id}` |
| Download a file field | `GET /api/files/{collection}/{recordId}/{filename}` |

`filter` uses PocketBase's own query-expression syntax (e.g. `filter=(userId='abc123' && status='active')`). Values interpolated into filters should be escaped (the app does this via the SDK's `pb.filter()` helper) to avoid filter-injection.

Only fields declared on a collection are accepted or returned. Unknown fields sent in a create or update body are silently dropped (see §4 notes on `events`).

### 2.3 Authentication

The built-in `users` collection is a PocketBase **auth collection**:

- `POST /api/collections/users/auth-with-password` with `{ identity, password }` → returns `{ token, record }`. The token is a JWT sent as `Authorization: Bearer {token}` on subsequent requests.
- `POST /api/collections/users/records` to sign up (`email`, `password`, `passwordConfirm`).
- `POST /api/collections/users/request-password-reset`, `/confirm-password-reset` for password recovery.
- `POST /api/collections/users/auth-refresh` to renew a token using the current one.

Access rules differ per collection and per operation (set by `scripts/setup-pocketbase.js`, which mirrors `firestore.rules` so both backends enforce the same guarantees):

- **`venues`**: list/view use the open rule `@request.auth.id != ""` (any authenticated user). Create requires `@request.body.userId = @request.auth.id` (a record can only be created with yourself as owner). Update/delete require `userId = @request.auth.id || @request.auth.isAdmin = true`, so only the owner or an admin may edit or delete a venue.
- **`events`**: list/view are open to any authenticated user. Create is self-owned, same as `venues`. Update allows the owner or an admin unrestricted writes; a user in `sharedWith` or on an org-designated event (`isOrgEvent = true`) may also update a record, but only if the request leaves `userId`, `sharedWith`, `isOrgEvent`, `ended` and `endedAt` untouched. These "protected fields" (who owns/can see/can end the event) can only be changed by the owner or an admin. Delete requires owner or admin.
- **`dispatchLogs`**: list/view/update/delete all require `userId = @request.auth.id || @request.auth.isAdmin = true`. **Unlike `venues`/`events`, reading another user's dispatch logs is also blocked.** Create is self-owned.
- **`_storage`**: no custom rules are applied. PocketBase's default `@request.auth.id != ""` applies to all five operations, so any authenticated user may list/view/create/update/delete any stored file record.
- **`settings`**: list/view use the open rule; create/update/delete additionally require `@request.auth.isAdmin = true`.
- **`users`**: see §3.1's note on the built-in auth collection's own rules, which are tighter than the open rule used above.

`userId`/`sharedWith` are still not relation fields and carry no database-level referential integrity (§5), but as of this schema they **are** enforced as access-control predicates by PocketBase itself on `venues`, `events` and `dispatchLogs`. Earlier versions of this document described access control as application-layer only. The `fix/venue-owner-only-edit`, `fix/org-event-dispatch-access` and `fix/org-event-dispatch-write-access` fixes moved it into PocketBase for `venues`, `events` and `dispatchLogs`. `_storage` has never had custom rules.

### 2.4 Realtime (SSE) subscriptions

PocketBase pushes live changes over a single Server-Sent-Events stream at `GET /api/realtime`:

1. Open an `EventSource` connection to `{baseURL}/api/realtime`. The server sends a `PB_CONNECT` event containing a `clientId`.
2. `POST /api/realtime` with `{ clientId, subscriptions: [...] }` (and the same `Authorization` bearer header used for REST) to (re)declare which topics that client wants. Topics are strings like:
   - `"{collection}/*"`: all records in a collection (create/update/delete)
   - `"{collection}/{recordId}"`: a single record
3. Subsequent matching changes arrive as SSE messages named after the collection, with a JSON payload `{ action: "create"|"update"|"delete", record: {...} }`.

The official PocketBase JS SDK (used by CrowdCAD) wraps this as `pb.collection(name).subscribe(topic, callback)` / `.unsubscribe(topic)` and manages the connect/reconnect handshake automatically.

## 3. Collections

CrowdCAD's PocketBase instance has **five custom collections** (`venues`, `events`, `dispatchLogs`, `_storage`, `settings`) plus PocketBase's **built-in `users` auth collection**. There are no separate "units", "calls" or "assignments" collections. Those concepts live as JSON-typed fields nested inside `events` (documented as sub-shapes in §3.7, since they're integral to the event data model).

### 3.1 `users` (built-in auth collection)

Only fields actually read/written by the app are listed; PocketBase auth collections also carry internal system columns (password hash, token key, verification state, etc.) not exposed here.

| Field | Type | Description | Nullable | Example |
|---|---|---|---|---|
| `id` | text (15-char, system) | Primary key, auto-generated. | No | `"a1b2c3d4e5f6g7h"` |
| `email` | email (system) | Login identity. | No | `"medic@example.org"` |
| `name` | text | Display name. | Yes | `"Jordan Lee"` |
| `phone` | text | Contact phone number. | Yes | `"+1-555-0100"` |
| `isAdmin` | bool | Grants access to CrowdCAD's Profile → Admin section (manage other admins, org settings). Added via `scripts/setAdminPocketbase.js`; not present by default until the setup script runs. | Yes (defaults false) | `true` |
| `dispatchVocabularyPresetId` | text | The dispatcher's chosen dispatch-language preset (see `src/hooks/useDispatchVocabulary.ts`). | Yes | `"ems-standard"` |

### 3.2 `venues`

Reusable venue templates: layout, posts and equipment, independent of any specific event.

| Field | Type | Description | Nullable | Example |
|---|---|---|---|---|
| `id` | text (15-char) | Primary key. | No | `"m3n4o5p6q7r8s9t"` |
| `name` | text | Venue name. | No (required) | `"Downtown Stadium"` |
| `userId` | text | `id` of the `users` record that owns/created the venue. A plain text copy of the id (no PocketBase relation field). | Yes | `"a1b2c3d4e5f6g7h"` |
| `equipment` | json (`Equipment[]`) | Venue's default equipment inventory. See §3.7. | Yes | `[{"id":"eq1","name":"AED #1","status":"Available"}]` |
| `layers` | json (`Layer[]`) | Named map layers, each with its own posts and zones. See §3.7. | Yes | `[{"id":"l1","name":"Main Map","posts":[...],"zones":[...]}]` |
| `posts` | json (`Post[]`) | Flat list of posts when the venue has no layers. See §3.7. | Yes | `[{"name":"Gate A","x":12.5,"y":40.0}]` |
| `mapUrl` | text | URL/path to the venue's base map image. | Yes | `"/files/maps/stadium.png"` |
| `sharedWith` | json (`string[]`) | Email addresses of other users granted access to this venue. | Yes | `["helper@example.org"]` |
| `isOrgVenue` | bool | If true, visible to every user on this instance (set by an admin) in addition to the owner and sharedWith list. | Yes (defaults false) | `false` |

### 3.3 `events`

The central planning/dispatch record for a single event: a snapshot of the venue plus staffing, calls and assignments as the event runs.

| Field | Type | Description | Nullable | Example |
|---|---|---|---|---|
| `id` | text (15-char) | Primary key. | No | `"e1f2g3h4i5j6k7l"` |
| `name` | text | Event name. | Yes | `"Summer Festival 2026"` |
| `date` | text | Event date, stored as an ISO 8601 string (see §5). Stored as plain text (no PocketBase `date` field type). | Yes | `"2026-08-15T00:00:00.000Z"` |
| `userId` | text | `id` of the owning `users` record (plain text with no relation). | Yes | `"a1b2c3d4e5f6g7h"` |
| `venue` | json (`Venue`) | Snapshot of the venue used for this event (copied from `venues` at event-create time, then edited independently). See §3.2/§3.7. | Yes | `{"id":"m3n4o5...","name":"Downtown Stadium",...}` |
| `sharedWith` | json (`string[]`) | Email addresses with access to this event. | Yes | `["helper@example.org"]` |
| `postingTimes` | json (`string[]`) | Labels for the shift/posting time slots used to build the schedule grid. | Yes | `["06:00","08:00","10:00"]` |
| `staff` | json (`Staff[]`) | Field teams ("units") working the event. See §3.7. | Yes | `[{"team":"Team 1","status":"Available",...}]` |
| `supervisor` | json (`Supervisor[]`) | Supervisory units. See §3.7. | Yes | `[{"team":"Supervisor 1","status":"Available",...}]` |
| `calls` | json (`Call[]`) | Incidents/calls logged during the event. See §3.7. | Yes | `[{"id":"c1","order":1,"status":"Active",...}]` |
| `dispatchZones` | json (`DispatchZone[]`) | Dispatch zones, one per dispatch-zone-flagged `venue.layers[].zones` entry. Each gets its own "{name} Calls" tab in the dispatch view. See §3.7. | Yes | `[{"id":"z1","name":"Zone 2"}]` |
| `status` | text | Event lifecycle state. Observed values: `"draft"`, `"active"`. | Yes | `"active"` |
| `eventPosts` | json (`Post[]`) | Posts as configured for this specific event (may diverge from the venue template). See §3.7. | Yes | `[{"name":"Gate A","x":12.5,"y":40.0}]` |
| `eventEquipment` | json (`EventEquipment[]`) | Equipment inventory for this event. See §3.7. | Yes | `[{"id":"eq1","name":"AED #1","status":"Available","locationId":"Gate A"}]` |
| `pendingAssignments` | json (`{ [team]: { post, time } }`) | Assignments queued but not yet committed to `postAssignments`, keyed by team name. | Yes | `{"Team 1":{"post":"Gate A","time":"08:00"}}` |
| `postAssignments` | json (`{ [time]: { [post]: team } }`) | Committed post assignment grid: for each posting time, which team covers which post. See §3.7. | Yes | `{"08:00":{"Gate A":"Team 1"}}` |
| `interactionSessions` | json (`InteractionSession[]`) | Client-side usage-tracking sessions (mouse/keystroke activity timestamps) for the dispatch UI. See §3.7. | Yes | `[{"sessionId":"s1","eventId":"e1f2...","startTime":1755000000000,"mouseClicks":[],"keyStrokes":[]}]` |
| `isOrgEvent` | bool | If true, visible to every user on this instance (set by an admin or the event owner) in addition to the owner and sharedWith list. Also one of the "protected fields" a shared/org-event member cannot change via a direct write. See §2.3. | Yes (defaults false) | `false` |
| `ended` | bool | Whether the event has been ended (manually or automatically after its designated End Time plus one hour with no further dispatch activity). Once true, the dispatch board rejects further writes. A protected field. See §2.3. | Yes (defaults false) | `true` |
| `endedAt` | number | Epoch ms when the event was ended; unset while active. A protected field. See §2.3. | Yes | `1757280000000` |

### 3.4 `dispatchLogs`

Append-style log of dispatch-page activity for an event.

| Field | Type | Description | Nullable | Example |
|---|---|---|---|---|
| `id` | text (15-char) | Primary key. | No | `"d1e2f3g4h5i6j7k"` |
| `eventId` | text | `id` of the related `events` record (plain text with no relation). | Yes | `"e1f2g3h4i5j6k7l"` |
| `userId` | text | `id` of the `users` record that created the log entry (plain text with no relation). Used by the app's own query for a user's dispatch logs (Profile → Security) and by the `dispatchLogs` access rule (§2.3). | Yes | `"a1b2c3d4e5f6g7h"` |
| `data` | json | Log payload; shape is caller-defined and not further constrained by the schema. | Yes | `{"type":"call-created","callId":"c1"}` |

### 3.5 `_storage`

Generic file store used by the app's storage adapter (e.g. venue map images), keyed by an application-defined logical path rather than by collection semantics.

| Field | Type | Description | Nullable | Example |
|---|---|---|---|---|
| `id` | text (15-char) | Primary key. | No | `"f1g2h3i4j5k6l7m"` |
| `path` | text | Logical path the app looks the file up by (app-level convention, e.g. `"maps/stadium.png"`). Intended to be unique per path, though uniqueness is enforced by the app's find-or-create logic rather than a documented DB constraint. | No (required) | `"maps/stadium.png"` |
| `file` | file | The uploaded binary. Served at `/api/files/_storage/{id}/{filename}`. | Yes | `"stadium_a1b2.png"` |

### 3.6 `settings`

Small key/value store for org-wide configuration (currently used for the certifications list offered when adding staff).

| Field | Type | Description | Nullable | Example |
|---|---|---|---|---|
| `id` | text (15-char) | Primary key. | No | `"s1t2u3v4w5x6y7z"` |
| `key` | text | Setting name. Observed value: `"certifications"`. | No (required) | `"certifications"` |
| `list` | json (`string[]`) | Value for the setting. For `"certifications"`, the list of certification labels offered in the UI. | Yes | `["CPR","EMT-B","EMT-P","RN","MD/DO"]` |

### 3.7 Embedded JSON sub-shapes (nested inside `venues` and `events`)

PocketBase stores these as opaque `json` fields with no server-side schema; the TypeScript contracts in `src/app/types.ts` are the only thing enforcing the shapes below.

**`Post`**: a location on a venue map. Either a bare string (a legacy/simple post name) or an object:
| Field | Type | Description |
|---|---|---|
| `name` | string | Post name. |
| `x`, `y` | number \| null | Position as a percentage of map width/height. On a geo layer, null when the post is outside the image. |
| `lat`, `lng` | number \| null (optional) | Real coordinates. On a geo layer (an aligned image or a drawn area) they are the post's position; on an image-only layer they are provenance from a GIS import, and rendering uses `x`/`y`. |
| `isClinic` | bool (optional) | Marks this post as a clinic. |
| `clinicId` | string (optional) | Stable id, generated once when `isClinic` first becomes true. Survives the post being renamed later; used to match this post against `events.clinics` entries. |

**`Layer`**: `id`, `name`, `mapUrl?`, `posts: Post[]`, `zones?: Zone[]`, `geoBounds?` (present when the layer's `mapUrl` was georeferenced via a GIS import), and the real-world map fields below. A layer is a **geo layer** when its image has a current alignment or it has a drawn area (`src/lib/geo/layers.ts`); geo layers show on a live map in venue setup and dispatch.
| Field | Type | Description |
|---|---|---|
| `alignment` | object (optional) | The image's real-world alignment: `mapUrl` (the image it was made for; it applies only while equal to the layer's), `naturalWidth`, `naturalHeight`, `controlPoints[]` (`x`, `y` in image percent, `lat`, `lon`), `origin` (`lat`, `lon`), `transform` (`a`..`f`: local meters east/north to image percent), `residualM` (estimated error in meters, null with 3 points), `ownerUid`, `updatedAt`. Set in venue setup's Map alignment step, or from `geoBounds` for a GIS import. |
| `takAlignment` | object (optional) | The same shape, written while alignment was a TAK-only step. Read when `alignment` is absent; not written any more. |
| `area` | `{ polygon: {lat,lng}[] }` (optional) | A drawn area of interest for a layer with no image: the layer is the live map centered on it. Three or more points. |

**`Clinic`**: `id` (matches a clinic-flagged `Post.clinicId`), `name` (kept in sync with that post's current name). `events.clinics: Clinic[]` is populated additively from the event's `venue.posts` (see `src/lib/clinics.ts`'s `syncClinicsFromVenue`).

**`Zone`**: a polygon area drawn on a venue map layer (e.g. "Zone 2"):
| Field | Type | Description |
|---|---|---|
| `id` | string | Stable id, generated once when the zone is drawn and kept through renames, recolors and edits. |
| `name` | string | Zone name. |
| `color` | string | Hex color used to render the polygon, e.g. `"#3b82f6"`. |
| `points` | `{x,y}[]` | Polygon vertices, in order, each a percentage of map width/height (same coordinate system as `Post.x`/`Post.y`). Empty for a zone drawn on a drawn-area layer. |
| `coords` | `{lat,lng}[]` (optional) | The same polygon in real coordinates, on a geo layer. Zone membership on a geo layer is tested in coordinates. |
| `isDispatchZone` | bool (optional) | Marks this zone as a dispatch zone with its own "{name} Calls" tab in the dispatch view. |

**`DispatchZone`**: `id` (matches a dispatch-zone-flagged `Zone.id`), `name` (kept in sync with that zone's current name). `events.dispatchZones: DispatchZone[]` is populated additively from the event's `venue.layers[].zones` (see `src/lib/zones.ts`'s `syncDispatchZonesFromVenue`). A call is routed into a dispatch zone's tab purely by geometry: whether `call.location` names a post whose coordinates fall inside that zone's polygon (`src/lib/zones.ts`'s `findZonesForPost`/`getCallZoneIds`). `Call` has no `zoneId` field.

**`Equipment`** (venue-level): `id`, `name`, `status` (free-text status string), `assignedTeam?`, `location?`.

**`EventEquipment`** = `Equipment` + `locationId?`, `defaultLocation?`, `notes?`.

**`Staff`** (a field team / "unit"):
| Field | Type | Description |
|---|---|---|
| `team` | string | Team name/identifier. |
| `location` | string | Current location/post. |
| `status` | string | Free-text status (e.g. availability). |
| `members` | string[] | Member names. |
| `log?` | `{timestamp:number, message:string}[]` | Activity log for this team. |
| `originalPost?` | string | Post the team was originally assigned before any reassignment. |
| `statusSince?` | number | Epoch ms when the team entered its current `status`/`location`; drives the team timer. Stamped by the dispatch page on every status or location change (absent on events that predate it, in which case the timer falls back to the logs). |

**`Supervisor`**: same shape as `Staff` but with a single `member: string` instead of `members: string[]`.

**`Call`** (an incident):
| Field | Type | Description |
|---|---|---|
| `id` | string | Call identifier (generated by the app, separate from PocketBase record ids). |
| `order` | number | Display/creation order. |
| `status` | string | Free-text call status. |
| `location` | string | Where the call is. |
| `assignedTeam` | string[] | Team(s) responding. |
| `chiefComplaint` | string | Reason for the call. |
| `source?`, `age?`, `gender?` | string | Optional patient/context details. |
| `priority?`, `duplicate?`, `clinic?`, `pin?` | bool | Flags. `pin?` pins the call to the top of its list (below `priority?` calls); cleared automatically once the call resolves and never logged. |
| `duplicateOf?`, `clinicId?` | string | Reference ids (plain strings with no relation). |
| `log?` | `{timestamp:number, message:string}[]` | Call activity log. |
| `notes?` | string | Free text. |
| `detachedTeams?` | `{team:string, reason:string}[]` | Teams detached from the call and why. |
| `equipmentTeams?`, `equipment?` | string[] | Related equipment/teams. |
| `outcome?` | `"Discharged" \| "AMA" \| "Rolled from Clinic" \| "Transported" \| "Pending Transport"` | Clinic disposition. |
| `transportUnit?` | string | Ambulance/transport unit number, captured when `outcome` is set to `"Transported"`. |

**`postAssignments`**: `{ [time: string]: { [post: string]: string /* team */ } }`. The committed schedule grid.

**`pendingAssignments`**: `{ [team: string]: { post: string; time: string } }`. Assignments staged but not yet placed into `postAssignments`.

**`InteractionSession`**: `sessionId`, `eventId`, `startTime` (epoch ms), `endTime?` (epoch ms), `mouseClicks: {timestamp:number}[]`, `keyStrokes: {timestamp:number}[]`.

## 4. Fields present in the app's TypeScript types but not in this PocketBase schema

`src/app/types.ts`'s `Event` interface also declares `createdAt`, `postingStart`/`postingEnd`, `scheduleStart`/`scheduleEnd`, `startTime`/`endTime` and `start`/`end`. None of these appear in the `events` collection's actual field list (`scripts/setup-pocketbase.js`, `tests/e2e/pb_migrations/…created_events.js`). CrowdCAD supports both a Firebase and a PocketBase backend behind a common interface, and these fields appear to be write-only leftovers for the Firebase path: since PocketBase silently drops unknown fields on create/update (§2.2), sending them to a PocketBase-backed deployment has no effect. They are neither persisted nor returned. Do not rely on them being present in PocketBase `events` records.

`isOrgEvent`, `ended` and `endedAt` **are** schema-backed `events` fields (§3.3). PocketBase persists them, unlike the Firebase-only fields listed above.

`clinics` **is** a schema-backed `json` field on `events` (added alongside multi-clinic support) and persists on PocketBase. Same for `dispatchZones` (added alongside map zones support).

## 5. Notes

- **Timestamp format**: There is no PocketBase `date`/`autodate` field type in use anywhere in this schema. `events.date` is a plain `text` field populated by the frontend with `new Date(...).toISOString()`, which is ISO 8601 in UTC, e.g. `"2026-08-15T00:00:00.000Z"`. Timestamps inside JSON sub-objects (`Call.log[].timestamp`, `Staff.log[].timestamp`, `InteractionSession.startTime/endTime`, `MouseClickLog.timestamp`, `KeyStrokeLog.timestamp`) are JS epoch milliseconds (numbers). The format depends on where the value originates.
- **No `created`/`updated` audit fields**: unlike PocketBase's usual default, none of the five custom collections define `created`/`updated` autodate fields, so there is no built-in record of when a `venues`/`events`/`dispatchLogs`/`_storage`/`settings` row was created or last modified.
- **ID conventions**: every collection's primary key (`id`) is a 15-character lowercase alphanumeric string (`^[a-z0-9]{15}$`), auto-generated by PocketBase. Cross-references between collections (`events.userId`, `venues.userId`, `dispatchLogs.eventId`, `Call.duplicateOf`, `Call.clinicId`) are stored as plain text copies of the referenced id. None of them are PocketBase `relation` fields, so referential integrity (e.g. cascading delete, existence checks) is not enforced by the database.
- **No soft deletes**: `deleteDocument` issues a real PocketBase `DELETE`; there is no `deleted`/`isDeleted` flag or tombstone record in any collection. Deletion is permanent.
- **Access control is enforced by PocketBase itself for most collections**: as detailed in §2.3, `venues`/`events`/`dispatchLogs` restrict create/update/delete (and, for `dispatchLogs`, list/view too) to the owning user or an admin, with `events` additionally allowing a `sharedWith`/`isOrgEvent` member to write non-protected fields. `_storage` is the one collection where any authenticated user can read/write any record via the raw API with no ownership check. An integration talking to the API directly should treat `_storage` records as open to every signed-in user, and should expect `venues`/`events`/`dispatchLogs` writes outside these rules to fail with `403`.
- **JSON fields are schemaless in PocketBase**: all `json`-typed fields (venue/staff/calls/equipment/etc.) are validated only by the frontend's TypeScript types in `src/app/types.ts`. A non-CrowdCAD client can write any JSON shape into them without the server rejecting it.
