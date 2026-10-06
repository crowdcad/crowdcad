# TAK integration: data contract

**Contract version: 0.2.2 (draft).** TAK support is in development and is an optional add-on. Nothing here is released, and the contract may change until 1.0.0.

This document defines every record the TAK integration adds, who writes each one, and what the access rules enforce. It covers both backends: Firebase (the default) and PocketBase (opt-in with `NEXT_PUBLIC_BACKEND=pocketbase`). The bridge reaches both through one adapter interface, so behavior is the same on either.

Related: [plan.md](plan.md), [decisions.md](decisions.md).

## Principles

1. **Standard events are untouched.**
   - The TAK data lives in separate collections, plus one optional field (`mapMode`) and one optional team field (`id`).
   - A standard event has neither TAK records nor `mapMode`, and no TAK code reads or writes anything for it.
2. **The bridge never reads event documents.** It never sees calls, patient information, staff names or team names. It reads only its event TAK config and device links, and writes only positions, history and status.
3. **The bridge authenticates as a normal user account with a bridge record**, using the client SDK, so the security rules apply to it. The standard path does not use the Admin SDK.
4. **Admins manage bridges.**
   - Only admins (`users/{uid}.isAdmin`) create, edit, rotate or revoke bridges, or change `allowedUsers`.
   - An event owner can link a bridge to their event only if they are in its `allowedUsers`.
   - There is no organization model; `allowedUsers` stands in for one.
5. **Bridge accounts cannot escalate.** An account with a bridge record cannot create or edit bridge records, event TAK config, device links or device mappings.
6. **Coordinates are stored as WGS84 lat/lon** (decimal degrees). They are projected to image space only at render, using the map alignment.
7. **Correctness never depends on TTL** (see [Cleanup](#cleanup)).

## Identifiers

| Name | Meaning |
|---|---|
| `bridgeUid` | Auth uid (Firebase) or user id (PocketBase) of the bridge account |
| `eventId` | Existing event id |
| `layerId` | Existing `Layer.id` of a map layer in the event's venue snapshot |
| `deviceUid` | TAK device UID (CoT `event@uid`). Used as a document id in URL-encoded form (`encodeURIComponent`), since Firestore ids can't contain `/`; readers decode it |
| `teamId` | `Staff.id` / `Supervisor.id` (see [Team ids](#team-ids)) |
| `segmentId` | `${deviceUid}~${teamId}~${startedAtMs}`. One history segment per continuous (device, team) pairing |

## History modes

`historyMode` is one of:

| Mode | Kept after the event closes |
|---|---|
| `off` | Nothing. Live positions only |
| `summary` (default) | Per-segment 5-minute windows and a sparse heat-map grid |
| `detailed` | `summary`, plus 15 s points while the team is assigned to a call |

The bridge record holds the default. Each event's `takConfig.historyMode` is the value the bridge acts on; it is set when TAK is chosen for the event, and can be changed later.

## Changes to existing records

Both are optional fields. They are absent on standard events and on all existing data.

| Record | Field | Meaning | Written by |
|---|---|---|---|
| `events/{eventId}` | `mapMode?: 'standard' \| 'tak'` | Unset or `'standard'` means a standard event. `'tak'` tells event pages to load the TAK module | Event owner or admin (a protected field: shared and org-event users cannot change it) |
| `Staff`, `Supervisor` (inside `events`) | `id?: string` | Opaque team id | Generated when a team is created. Backfilled only for TAK events |

## Firestore

### Collections

| Path | Fields | Written by | Read by |
|---|---|---|---|
| `bridgeAccounts/{bridgeUid}` | `label`, `createdBy`, `allowedUsers` (uids), `defaultHistoryMode`, `createdAt`, `updatedAt` | Admins (create, update, delete). Delete revokes the bridge | Admins; users in `allowedUsers`; the bridge itself |
| `bridgeAccounts/{bridgeUid}/deviceMappings/{deviceUid}` | `teamName`, `callsign`, `updatedAt`, `updatedBy` | Admins; users in `allowedUsers` (create and update, when they link a device manually) | Admins; users in `allowedUsers` |
| `bridgeAccounts/{bridgeUid}/status/current` | `lastSeenAt`, `takConnected`, `version`, `linkedEventCount` | The bridge | Admins; users in `allowedUsers` |
| `events/{eventId}/takConfig/current` | `eventId`, `bridgeUid` (or null), `enabled`, `closed`, `historyMode`, `updatedAt` | Event owner. `bridgeUid` may be set only if the owner is in that bridge's `allowedUsers`. The end-event flow sets `closed: true` (owner or admin) | Anyone who can read the event; the linked bridge |
| `events/{eventId}/takMapAlignment/{layerId}` | `mapUrl`, `naturalWidth`, `naturalHeight`, `controlPoints[]`, `origin`, `transform`, `residualM`, `ownerUid`, `updatedAt` | Event owner | Anyone who can read the event. Not the bridge |
| `events/{eventId}/takDeviceLinks/{deviceUid}` | `teamId`, `linkedAt`, `method` (`auto` or `manual`), `linkedBy` | Anyone who can dispatch the event, except bridge accounts | Anyone who can read the event; the linked bridge |
| `events/{eventId}/takLive/{deviceUid}` | `lat`, `lon`, `hae`, `ce`, `course`, `speed`, `callsign`, `cotType`, `deviceTime`, `receivedAt`, `bridgeUid` | The linked bridge, while `enabled` and not `closed`. The bridge also deletes | Anyone who can read the event |
| `events/{eventId}/takHistory/{segmentId}` | `deviceUid`, `teamId`, `startedAt`, `endedAt`, `windows[]`, `grid`, `bridgeUid` | The linked bridge, while `historyMode != off` | Event owner only (v1) |
| `events/{eventId}/takHistory/{segmentId}/points/{chunkId}` | `points[]` (`t`, `lat`, `lon`, `ce`), at most 500 per chunk | The linked bridge, `detailed` mode only | Event owner only (v1) |
| `events/{eventId}/takStatus/current` | `lastSeenAt`, `takConnected`, `liveDeviceCount` | The linked bridge | Anyone who can read the event |

- **Team positions** are joined in the browser through `takDeviceLinks`. A team's position is the most recent fix among its linked devices.
- **The bridge finds its events** with a collection-group query on `takConfig` where `bridgeUid == <own uid>`. That's why `takConfig` carries `eventId`.
- **Event creation** lists usable bridges with `bridgeAccounts` where `allowedUsers array-contains <uid>`.

### Shapes

```ts
// Summary history, one doc per segment
interface TakHistorySegment {
  deviceUid: string;
  teamId: string;
  startedAt: number;          // epoch ms
  endedAt: number | null;     // null while the segment is open
  bridgeUid: string;
  windows: Array<{
    t0: number;               // window start, epoch ms, aligned to 5 minutes
    lat: number; lon: number; // time-weighted mean position
    spreadM: number;          // RMS distance from the mean, in meters
    n: number;                // fixes received in the window
    secs: number;             // seconds of coverage in the window
  }>;
  grid: {
    cellM: 5;                 // nominal cell size in meters
    originLat: number; originLon: number; // grid origin (first fix of the segment)
    cells: Record<string, number>;        // "ix,iy" -> seconds spent in the cell
  };
}

// Map alignment, one doc per event map layer. Read only by TAK and heat-map code.
interface TakMapAlignment {
  mapUrl: string;             // the image this alignment was made for; a different mapUrl invalidates it
  naturalWidth: number;       // captured during alignment
  naturalHeight: number;
  controlPoints: Array<{ x: number; y: number; lat: number; lon: number; label?: string }>; // x, y in percent; at least 3
  origin: { lat: number; lon: number };   // local-meters origin (control-point centroid)
  transform: { a: number; b: number; c: number; d: number; e: number; f: number };
  // affine from local meters (east, north of origin) to image percent: x% = a*E + b*N + c, y% = d*E + e*N + f
  residualM: number | null;   // estimated error in meters, sqrt(SSR / (n - 3)); null with exactly 3 points
  ownerUid: string;
  updatedAt: number;
}
```

Budgets are confirmed in P5. Per segment: 96 windows for 8 hours, and the grid is capped so the doc stays well under Firestore's 1 MiB document limit.

### Rules summary

All TAK rules sit in one commented block in `firestore.rules`. New helper functions:

- `isBridge()`: `exists(/bridgeAccounts/$(request.auth.uid))`.
- `isAllowedBridgeUser(bridgeUid)`: `request.auth.uid in get(/bridgeAccounts/$(bridgeUid)).data.allowedUsers`.
- `eventData(eventId)`: `get(/events/$(eventId)).data`, with the visibility and dispatch checks rewritten to take a data map.
- `linkedBridge(eventId)`: `get(/events/$(eventId)/takConfig/current).data.bridgeUid == request.auth.uid`. The bridge's record must also still exist.

The rules:

- **Admins only for `bridgeAccounts`.** Create, update and delete require `isRequestingUserAdmin() && !isBridge()`. Create also requires `!exists(...)` and `bridgeUid != request.auth.uid`.
- **Escalation block.**
  - `isBridge()` callers are denied every write to `bridgeAccounts/**` (except their own `status`), `takConfig`, `takMapAlignment`, `takDeviceLinks` and `deviceMappings`.
  - They are also denied every write to `events/{eventId}` itself.
- **No event reads for bridges.** The existing event read rule adds `!isBridge()`. This is the only change to an existing rule apart from `mapMode` below.
- **Linking.** Writes to `takConfig.bridgeUid` require `eventData(eventId).userId == request.auth.uid` and `isAllowedBridgeUser(newBridgeUid)`.
- **Live writes.** Allowed when `linkedBridge(eventId)`, the config is `enabled && !closed`, and `request.resource.data.bridgeUid == request.auth.uid`.
- **History.** Reads require `eventData(eventId).userId == request.auth.uid`. Writes follow the live-write conditions, plus `historyMode != 'off'`.
- **`mapMode`** joins the protected event fields in `isEventProtectedFieldsUnchanged`.

All of the above is tested with `@firebase/rules-unit-testing` against the Firestore emulator (P2). The existing rules tests must pass unchanged.

## PocketBase

PocketBase collections are flat, so each one carries `event` and/or `bridge` as text ids, matching the existing `userId` convention.

| Collection | Fields | Rules (summary) |
|---|---|---|
| `users` (existing) | adds `role` (`'' \| 'bridge'`) | Only an admin can set `role = 'bridge'`. A bridge user cannot change `role` |
| `events` (existing) | adds `mapMode` (text) | Added to `EVENT_PROTECTED_FIELDS_UNTOUCHED`; list and view add `@request.auth.role != 'bridge'` |
| `tak_bridges` | `bridgeUser`, `label`, `createdBy`, `allowedUsers` (multi-relation to `users`, so membership is an exact match), `defaultHistoryMode` | Admins write; admins, allowed users and the bridge read |
| `tak_device_mappings` | `bridge`, `deviceUid`, `teamName`, `callsign`, `updatedBy` | Admins and allowed users, never `role = 'bridge'` |
| `tak_bridge_status` | `bridge`, `lastSeenAt`, `takConnected`, `version`, `linkedEventCount` | Bridge writes; admins and allowed users read |
| `tak_event_config` | `event` (unique), `bridge`, `enabled`, `closed`, `historyMode` | Event owner writes, `bridge` only if the owner is in that bridge's `allowedUsers`; the end-event flow sets `closed`; event readers and the linked bridge read |
| `tak_map_alignment` | `event`, `layerId`, `mapUrl`, `naturalWidth`, `naturalHeight`, `controlPoints` (json), `origin` (json), `transform` (json), `residualM`, `ownerUid`, `updatedAt` | Event owner writes; event readers read |
| `tak_device_links` | `event`, `deviceUid`, `teamId`, `linkedAt`, `method`, `linkedBy` | Event dispatchers write, never `role = 'bridge'`; event readers and the linked bridge read |
| `tak_live` | `event`, `bridge`, `deviceUid`, and the same position fields as Firestore | Linked bridge writes, through `@collection.tak_event_config` (`event = event && bridge = @request.auth.id && enabled && !closed`); event readers read |
| `tak_history` | `event`, `bridge`, `segmentId`, `deviceUid`, `teamId`, `startedAt`, `endedAt`, `windows` (json), `grid` (json) | Linked bridge writes; event owner reads |
| `tak_history_points` | `event`, `bridge`, `segmentId`, `chunk`, `points` (json) | Same as `tak_history` |
| `tak_event_status` | `event`, `bridge`, `lastSeenAt`, `takConnected`, `liveDeviceCount` | Linked bridge writes; event readers read |

- **Unique indexes:** `tak_live(event, deviceUid)`, `tak_device_links(event, deviceUid)`, `tak_event_config(event)`, `tak_map_alignment(event, layerId)`, `tak_history(segmentId)`.
- Schema and rules live in `scripts/setup-pocketbase.js`. (`tests/e2e/pb_migrations/` is not used by the e2e harness, which creates its own permissive schema, so it is not mirrored.)
- TAK "event reader" rules mirror the current `events` view rule (any signed-in, non-bridge user) and must be tightened together with it.
- The `allowedUsers` and `sharedWith` checks must be exact matches, not the current `~` substring match (see [plan.md](plan.md#open-items)).

## Team ids

- **Shape.** `Staff` and `Supervisor` gain an optional `id: string`. It is generated with `crypto.randomUUID()` by `newTeamId()` in `src/lib/teamId.ts`, and never reissued on rename.
- **Generation.** At every team creation site from now on (see the audit in [plan.md](plan.md#team-id-audit-2026-10-06)).
- **Backfill.** Only for events with `mapMode === 'tak'`: the TAK module assigns ids to teams lacking one, in one event write.
- **Readers.** Core code outside the TAK module never reads `id`.
- **What references it.** Device links and history reference `teamId`. Remembered `deviceMappings` store `teamName`, because they carry over between events; the browser resolves them to the new event's `teamId` when pre-linking.

## Who writes what

| Data | Admin | Event owner | Other dispatcher | Bridge |
|---|---|---|---|---|
| Bridge record, `allowedUsers`, default history mode | write | read, if allowed | read, if allowed | read own record |
| Device mappings | write | write, if allowed | write, if allowed | none |
| `mapMode`, event TAK config, map alignment | write | write (link requires being allowed) | read | read config only |
| `closed` flag | write | write, at end of event | none | read |
| Device links | write | write | write | read |
| Live positions, status | read | read | read | write, delete |
| History | none in v1 | read | none | write |

## Cleanup

- **At close:** when the bridge sees `closed: true`, it flushes open history segments, sets `endedAt`, and deletes every `takLive` doc for that event.
- **On startup:** for each linked event, the bridge deletes `takLive` docs whose `receivedAt` is more than 10 minutes old, and runs the close procedure for any event that is already closed.
- **Unlinking:** when a bridge is unlinked, the browser deletes the event's `takLive` docs. The event owner may delete them.
- **Optional:** operators can enable a Firestore TTL policy on `takLive.receivedAt` as a backstop. PocketBase has no TTL; it relies on the bridge.

## Changelog

- 0.2.2 (2026-10-07): additive. Map alignment gains `origin`; `residualM` is the estimated error and is null with only 3 control points; PocketBase `tak_map_alignment` gains `origin`, `ownerUid` and `updatedAt`.
- 0.2.1 (2026-10-07): clarifications, not breaking. Device UIDs are URL-encoded as document ids. PocketBase `allowedUsers` is a relation to `users`. PocketBase e2e migrations are not mirrored.
- 0.2.0 (2026-10-06):
  - Bridges are admin-managed, with `allowedUsers`, and linking requires being allowed.
  - Added `Event.mapMode`.
  - Map georeference moved from `Layer` into a separate `takMapAlignment` record, with natural dimensions captured during alignment.
  - Team ids are generated at creation and backfilled only for TAK events.
  - PocketBase `users.bridgeOwner` removed; only admins set `role`.
- 0.1.0 (2026-10-06): initial draft.
