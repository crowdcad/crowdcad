# TAK integration: data contract

**Contract version: 0.1.0 (draft).** TAK support is in development. Nothing here is released, and the contract may change until 1.0.0.

This document defines every record the TAK integration adds, who writes each one, and what the access rules enforce. It covers both backends: Firebase (the default) and PocketBase (opt-in with `NEXT_PUBLIC_BACKEND=pocketbase`). The bridge reaches both through one adapter interface, so behavior is the same on either.

Related: [plan.md](plan.md), [decisions.md](decisions.md).

## Principles

1. **The bridge never reads event documents.** It never sees calls, patient information, staff names or team names. It reads only its own TAK config and device links, and writes only positions, history and status.
2. **The bridge authenticates as a normal user account with a bridge record**, using the client SDK, so the security rules apply to it. The standard path does not use the Admin SDK.
3. **Scope comes from ownership plus explicit linking.** There is no organization model yet. A bridge belongs to the user who created it, and it can write only for events whose owner linked it.
4. **Accounts with a bridge record cannot escalate.** They cannot create or edit bridge records, event TAK config or device links.
5. **Coordinates are stored as WGS84 lat/lon** (decimal degrees). They are projected to image space only at render time, using the map's georeference.
6. **Correctness never depends on TTL.** The bridge deletes live docs itself (see [Cleanup](#cleanup)).

## Identifiers

| Name | Meaning |
|---|---|
| `bridgeUid` | Auth uid (Firebase) or user id (PocketBase) of the bridge account |
| `eventId` | Existing event id |
| `deviceUid` | TAK device UID (CoT `event@uid`), the stable key for a device |
| `teamId` | Opaque, stable id of a team in an event. Teams are identified by name today, so this contract adds `Staff.id` and `Supervisor.id` (see [Team ids](#team-ids)) |
| `segmentId` | `${deviceUid}~${teamId}~${startedAtMs}`. One history segment per continuous (device, team) pairing |

## History modes

`historyMode` is one of:

| Mode | Kept after the event closes |
|---|---|
| `off` | Nothing. Live positions only |
| `summary` (default) | Per-segment 5-minute windows and a sparse heat-map grid |
| `detailed` | `summary`, plus 15 s points while the team is assigned to a call |

The bridge's default mode is set on its bridge record, and each event can override it in its TAK config. The value the bridge acts on is the event's `historyMode`, which the browser resolves when it writes the config.

## Firestore

### Collections

| Path | Fields | Written by | Read by |
|---|---|---|---|
| `bridgeAccounts/{bridgeUid}` | `ownerUid`, `label`, `defaultHistoryMode`, `createdAt` | Owner (create, update, delete). Delete revokes the bridge | Owner, admins, the bridge itself |
| `bridgeAccounts/{bridgeUid}/deviceMappings/{deviceUid}` | `teamName`, `callsign`, `updatedAt` | Bridge owner (from the browser) | Bridge owner |
| `bridgeAccounts/{bridgeUid}/status/current` | `lastSeenAt`, `takConnected`, `version`, `linkedEventCount` | Bridge | Bridge owner |
| `events/{eventId}/takConfig/current` | `eventId`, `bridgeUid` (or null), `enabled`, `closed`, `historyMode`, `updatedAt` | Event owner. Only the owner can change `bridgeUid`. The end-event flow sets `closed: true` (owner or admin) | Anyone who can read the event; the linked bridge |
| `events/{eventId}/takDeviceLinks/{deviceUid}` | `teamId`, `linkedAt`, `method` (`auto` or `manual`), `linkedBy` | Anyone who can dispatch the event, except bridge accounts | Anyone who can read the event; the linked bridge |
| `events/{eventId}/takLive/{deviceUid}` | `lat`, `lon`, `hae`, `ce`, `course`, `speed`, `callsign`, `cotType`, `deviceTime`, `receivedAt`, `bridgeUid` | Linked bridge, while `enabled` and not `closed`. The bridge also deletes | Anyone who can read the event |
| `events/{eventId}/takHistory/{segmentId}` | `deviceUid`, `teamId`, `startedAt`, `endedAt`, `windows[]`, `grid`, `bridgeUid` | Linked bridge, while `historyMode != off` | Event owner only (v1) |
| `events/{eventId}/takHistory/{segmentId}/points/{chunkId}` | `points[]` (`t`, `lat`, `lon`, `ce`), at most 500 per chunk | Linked bridge, `detailed` mode only | Event owner only (v1) |
| `events/{eventId}/takStatus/current` | `lastSeenAt`, `takConnected`, `liveDeviceCount` | Linked bridge | Anyone who can read the event |

- Live positions are joined to teams in the browser, through `takDeviceLinks`. A team's position is the most recent fix among its linked devices.
- The bridge finds its events with a collection-group query on `takConfig` where `bridgeUid == <own uid>`. That's why `takConfig` carries `eventId`.

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
```

Budgets are confirmed in P5. Per segment: 96 windows for 8 hours, and the grid is capped so the doc stays well under Firestore's 1 MiB document limit.

### Rules summary

New helper functions, used by the rules below:

- `isBridge()`: `exists(/bridgeAccounts/$(request.auth.uid))`.
- `eventData(eventId)`: `get(/events/$(eventId)).data`, with the visibility and dispatch checks rewritten to take a data map.
- `linkedBridge(eventId)`: `get(/events/$(eventId)/takConfig/current).data.bridgeUid == request.auth.uid`. The bridge's record must also still exist.

The rules:

- **Escalation block.** `isBridge()` callers are denied all writes to `bridgeAccounts/**` (except their own `status`), `takConfig` and `takDeviceLinks`, and all writes to `events/{eventId}` itself.
- **No event reads for bridges.** The event read rule adds `!isBridge()`, so a bridge account is denied even if the event is org-wide or shared with its email.
- **Live writes.** Allowed when `linkedBridge(eventId)`, the config is `enabled && !closed`, and `request.resource.data.bridgeUid == request.auth.uid`.
- **History.** Reads require `eventData(eventId).userId == request.auth.uid`. Writes follow the live-write conditions, plus `historyMode != 'off'`.
- **Event field protection.** Event TAK config lives in its own doc, so it needs no new protected event fields.
- **`bridgeAccounts` create.** Requires `ownerUid == request.auth.uid`, `bridgeUid != request.auth.uid`, a creator who is neither a bridge nor a demo account, and `!exists(...)`.

All of the above is tested with `@firebase/rules-unit-testing` against the Firestore emulator (P2).

## PocketBase

PocketBase collections are flat, so each one carries `event` and/or `bridge` as text ids. That matches the existing `userId` convention: plain text, no relation fields.

| Collection | Fields | Rules (summary) |
|---|---|---|
| `users` (existing) | adds `role` (`'' \| 'bridge'`) and `bridgeOwner` | `role = 'bridge'` can be set only by an admin, or when `@request.body.bridgeOwner = @request.auth.id`. A bridge user cannot change `role` or `bridgeOwner` |
| `tak_bridges` | `bridgeUser`, `owner`, `label`, `defaultHistoryMode` | Owner create/update/delete; owner, admin or the bridge itself read |
| `tak_device_mappings` | `bridge`, `deviceUid`, `teamName`, `callsign` | Bridge owner only |
| `tak_bridge_status` | `bridge`, `lastSeenAt`, `takConnected`, `version`, `linkedEventCount` | Bridge writes, owner reads |
| `tak_event_config` | `event` (unique), `bridge`, `enabled`, `closed`, `historyMode` | Event owner writes; the end-event flow sets `closed`; readable by event readers and the linked bridge |
| `tak_device_links` | `event`, `deviceUid`, `teamId`, `linkedAt`, `method`, `linkedBy` | Event dispatchers write, never `role = 'bridge'`; readable by event readers and the linked bridge |
| `tak_live` | `event`, `bridge`, `deviceUid`, and the same position fields as Firestore | Linked bridge writes, through `@collection.tak_event_config` (`event = event && bridge = @request.auth.id && enabled && !closed`); event readers read |
| `tak_history` | `event`, `bridge`, `segmentId`, `deviceUid`, `teamId`, `startedAt`, `endedAt`, `windows` (json), `grid` (json) | Linked bridge writes; event owner reads |
| `tak_history_points` | `event`, `bridge`, `segmentId`, `chunk`, `points` (json) | Same as `tak_history` |
| `tak_event_status` | `event`, `bridge`, `lastSeenAt`, `takConnected`, `liveDeviceCount` | Linked bridge writes; event readers read |

- The `events` list and view rules add `@request.auth.role != 'bridge'`.
- Unique indexes: `tak_live(event, deviceUid)`, `tak_device_links(event, deviceUid)`, `tak_event_config(event)`, `tak_history(segmentId)`.
- Schema and rules are added to `scripts/setup-pocketbase.js` and mirrored in `tests/e2e/pb_migrations/`.
- `sharedWith` matching must be exact, not the current `~` substring match. See the PocketBase read-access work tracked in [plan.md](plan.md).

## Team ids

`Staff` and `Supervisor` gain an optional `id: string`. It's generated once with `crypto.randomUUID()` and never reissued on rename, the same as `Zone.id`.

- Existing teams without an `id` are backfilled by the dispatch page on first load after upgrade, in one write.
- Device links and history reference `teamId`, never team names.
- Remembered `deviceMappings` store `teamName`, because they carry over between events. The browser resolves them to the new event's `teamId` when pre-linking.

## Map georeference

Changes in P3. These live in the existing venue and event JSON (`Layer`), so they need no new collections:

```ts
interface Layer {
  // existing fields...
  naturalWidth?: number;          // saved when the image is uploaded or first loaded
  naturalHeight?: number;
  georeference?: {
    controlPoints: Array<{ x: number; y: number; lat: number; lon: number; label?: string }>; // x, y in percent
    transform: { a: number; b: number; c: number; d: number; e: number; f: number };          // affine fit from lat/lon (local meters) to image percent
    residualM: number;            // RMS residual of the fit, in meters
    updatedAt: number;
  };
}
```

At least 3 control points are required. Without a georeference, positions can be listed but not drawn on that layer.

## Who writes what

| Data | Browser (owner) | Browser (dispatcher) | Bridge |
|---|---|---|---|
| Bridge record, device mappings | write | none | read own record |
| Event TAK config | write (link, unlink, mode, enable) | read | read |
| `closed` flag | write, at end of event (admins too) | none (only the owner or an admin can end an event) | read |
| Device links | write | write | read |
| Live positions, status | read | read | write, delete |
| History | read | none | write |

## Cleanup

- **At close:** when the bridge sees `closed: true`, it flushes open history segments, sets `endedAt`, and deletes every `takLive` doc for that event.
- **On startup:** for each linked event, the bridge deletes `takLive` docs whose `receivedAt` is more than 10 minutes old, and runs the close procedure for any event that is already closed.
- **Unlinking:** when a bridge is unlinked, the browser deletes the event's `takLive` docs. The event owner may delete them.
- **Optional:** operators can enable a Firestore TTL policy on `takLive.receivedAt` as a backstop. PocketBase has no TTL; it relies on the bridge.

## Changelog

- 0.1.0 (2026-10-06): initial draft.
