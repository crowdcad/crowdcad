# MCI mode: decision log

Entries are dated and are not edited after the fact. A later entry supersedes an earlier one.

Related: [plan.md](plan.md), [../tak-integration/decisions.md](../tak-integration/decisions.md).

## 2026-10-17

### D1. Counts only, no patient rows, for the December drill
- **Requested** by the maintainer for the December drill.
- **What.** MCI mode stores counts by zone and tag color. It has no chief complaint, age, sex, location found or tag number anywhere.
- **Why.** The drill feeds a descriptive case report and needs no patient-identifying data. Per-patient rows can be added later because the log's `kind` is a union.

### D2. The log is the source of truth; totals are derived; undo appends
- **What.** `event.mci.log` is the only source of counts. `src/lib/mci.ts` derives Tagged, Moved, In zone now, treatment counts and the chart series from it. Undo appends `{ kind: 'undo', undoes }` and derivations skip both entries. Entries are never edited or removed.
- **Writes.** Every write uses `updateEvent` in its functional form, built from the event the transaction read, so two dispatchers pressing plus together both count.
- **Limits.** A move is clamped to In zone now. A removal of tagged patients is clamped the same way. An undo that would leave a zone with negative patients (for example undoing a tag whose patients were already moved) is refused.
- **Zone clear state.** `MciZone.clearedAt` is a copy of what the log says, rewritten by `appendMciEntries` on every append. The log wins.

### D3. MCI assignment is separate from Location; on TAK events MCI never writes Location
- **What.** A unit's zone or treatment location is `mciAssignment`. On a standard event, picking it also sets Location to the name and logs "Post changed to <name> (MCI)". On a TAK event (`mapMode === 'tak'`) MCI code never writes Location and the assignment shows as its own chip on the card.
- **Why.** Follows TAK D66: Location is where a unit is.

### D4. Statuses are Available, Triage, Treatment and Unavailable; an assignment sets status, a location never does
- **What.** While an MCI is active the status menu offers these four. Triage needs a zone and Treatment needs a treatment location. Available and Unavailable clear the assignment. Equipment-run statuses (TAK D67) are unchanged. Follows TAK D66 and D68: status is never set from a location.
- **Stand down.** Returns units in Triage, Treatment or Unavailable to Available and clears every assignment.

### D5. One treatment list: clinics are included by default alongside MCI-only areas; clinic cards show regular plus MCI
- **What.** The declare dialog lists every event clinic, ticked by default with its regular-patient count, and lets the dispatcher add MCI-only treatment areas by name. A clinic card shows "4 regular + 8 MCI". The regular count is the unresolved clinic calls at that clinic. Calls with no `clinicId` belong to the single or default clinic, as they do today.

### D6. Automatic surge alerts are muted while an MCI is active
- **What.** The three automatic surge effects start no surge while `event.mci.active`. The Surge toggle still works by hand.
- **Why.** An MCI puts most teams on one task by design, so the alerts would fire at once and carry no news.

### D7. A team on a normal call keeps its call statuses and counts as Unavailable
- **What.** A team on an active normal call keeps the call status menu, so the call workflow is unchanged, and counts as Unavailable in the availability strip. Its card shows the call status and call chip as it does today. When the call resolves the team returns to Available as it does today. Assigning normal calls during an MCI is not blocked.
- **Stale assignments.** A unit that goes on a call keeps its `mciAssignment` until it is changed or the MCI stands down. A zone or treatment card lists only units whose current status is Triage or Treatment.

## 2026-10-18

### D8. Declaring an MCI ends an open surge
- **Requested** by the maintainer after previewing.
- **What.** `declareMci` closes the open surge period (its `endedAt` is the declare time, so the surge log keeps it) and clears `manualSurgeActive`. The MCI timer and the surge timer never run together. The Surge toggle still works by hand during an MCI (D6).
- **Why.** An MCI is the larger event. Leaving the surge flashing beside it gave two alarms for one situation.

### D9. Transport takes patients off site from a treatment location
- **Requested** by the maintainer; designed in [transport-and-summary-plan.md](transport-and-summary-plan.md).
- **What.** A `transported` log entry names the treatment location the patients left, the color, the count, the ambulance number and an optional destination. In treatment now is received minus transported. One trip is one write with one entry per color. A transport is clamped to the patients in that location. Undoing a transport always works. Undoing a move is refused when its patients have since been transported.
- **Why.** The ambulance number is a unit label, so counts only (D1) still holds. Transport runs from treatment locations only for the first drill; the entry already names its source if zones are added later.

### D10. A zone or treatment location can be drawn on the venue map
- **Requested** by the maintainer, and only offered when the venue has a map.
- **What.** After a zone or treatment location is added, the dispatcher is asked to draw it on the map and can skip. The shape is stored as an ordinary zone on the event's copy of the venue layers (never the venue itself), with the same id as the MCI item or its `venueZoneId`. The map then shows it like any other zone. The shape is not a dispatch zone, so it adds no Calls tab. A card's map button redraws it, which replaces the first shape. Clinics already have a pin and are not drawn.
- **Skips.** A skipped prompt is remembered for the browser session and not asked again. The card's button still works.
- **Limits.** Image layers are drawn at the size of the dialog with no zoom. Live-map layers store coordinates.
