# MCI mode: transport and the end-of-event summary

Status: plan for review. Nothing here is built yet.

Related: [plan.md](plan.md), [decisions.md](decisions.md).

## Part 1: Transport

### What it does
A treatment location can send patients off site. The dispatcher picks a treatment location, enters the ambulance number and how many patients of each color left in it. Those patients leave the treatment count and the record shows where they went.

The flow becomes: zone, then treatment location (Move), then off site (Transport).

### Data (counts only, D1)
One new log kind. The ambulance number is a unit label and is not patient data.

| Field | Meaning |
|---|---|
| `kind` | `'transported'` |
| `areaId` | The treatment location the patients left |
| `color` | Tag color, one entry per color like Move |
| `n` | Patients, positive |
| `unit` | Ambulance number as typed, trimmed (new optional field on `MciLogEntry`) |
| `destination` | Optional free text, for example a hospital (new optional field) |

The derived stats gain `transported` per color for each treatment location and in total. In treatment now becomes received minus transported. Nothing else about the log changes: it is still append only and still the one source of counts (D2).

Rules that follow D2:
- A transport is clamped to the patients now in that treatment location, with the same "Reduced to the patients still in..." toast as Move.
- Undo appends a compensating entry like every other kind. Undoing a transport always works. Undoing a Move is refused when the patients it put there have since been transported (the same rule as undoing a tag after a move).
- Several patients can leave in one ambulance. Reusing a number later is a second trip and gets its own entry.

### Screens
- **Treatment card.** A Transport button beside the counts. It opens a dialog with the ambulance number (required, with the numbers already used this MCI offered as suggestions), count steppers per color prefilled from the current counts and clamped, and an optional destination. Confirm writes one entry per color that has a count above zero, in one write.
- **Card body.** Each treatment card shows "Transported: R 2 Y 1 G 0 B 0" and the last few ambulance numbers as chips.
- **Totals strip.** Adds Transported next to In treatment now.
- **Log drawer.** Reads "Transported red 2 from Clinic, Ambulance 14 to General" and undoes like the others.
- **Chart.** The patient step chart gains a third line for patients transported so far.

### Decisions needed before building
1. **Transport straight from a zone?** Real incidents sometimes load a red patient from the field. Recommendation: no for the first drill. Everything passes through a treatment location, which keeps one path to count. It is a small addition later because the entry already names its source.
2. **Other ways out.** Treated and released, refused care and expectant are real resolutions. Recommendation: build transport only and name the kind so the next one can be added as a sibling (`released`) with no migration.
3. **Destination.** Recommendation: optional free text. A fixed hospital list is more to set up than the drill needs.
4. **Ambulance numbers.** Recommendation: free text with suggestions from this MCI. Ambulances are not CrowdCAD teams and should stay out of the roster and the availability strip.
5. **Per-patient times are not recorded.** Counts only means the record cannot say how long any one patient waited. The summary can show when each ambulance left and how many were in treatment over time, and it should say plainly that it gives no wait time per patient.

### Touchpoints
`src/app/types.ts` (log kind and two fields), `src/lib/mci.ts` (`transportPatch`, derivation, undo rule, series, CSV), `src/components/dispatch/mci/` (new transport dialog, card and strip changes), `docs/ICD.md`, `docs/mci/decisions.md` (D9), unit tests and one e2e scenario. PocketBase needs nothing new because `mci` is already one JSON field.

## Part 2: The end-of-event summary

### Goal
One page and one export that tell the whole MCI in order and add up. Every number comes from the log, so the page and the CSV cannot disagree.

### Page layout, top to bottom
1. **Header.** Declared and stood-down times for each period, total duration (the same "Duration" the tab shows) and whether a surge ran before it.
2. **Patient flow by color.** One table: Tagged, Moved to treatment, Transported, Still in zones and Still in treatment, each with a total row. A reconciliation line sits under it: tagged minus transported equals still on site. It shows a green "adds up" mark or a red mismatch with the difference, so a bad entry is visible.
3. **Zones.** The current table plus the time cleared and the time from first tag to clear.
4. **Treatment locations.** Received, transported and remaining per color, with the clinic's regular patients at declare time and at their peak.
5. **Transport.** One row per ambulance trip: time, ambulance number, from location, counts by color and destination. A summary line gives trips, distinct ambulances, and the first and last departure.
6. **Teams.** For each unit that worked the MCI: time in Triage, Treatment and Unavailable and the zones or locations it covered. Built from the team logs and status timestamps the app already keeps. If those prove too thin for exact durations, the fallback is an assignment entry in the MCI log, decided when we build it.
7. **Charts.** Patients over time (in zones, in treatment, transported so far) with markers for zone clears and stand down. A second chart shows teams by MCI status over time.
8. **Full timeline.** One chronological table, described below.

### The combined log
One table merges every source into a single ordered list with a Type column:

| Source | Example rows |
|---|---|
| MCI declare and stand down | "MCI declared", "MCI stood down (active for 42 min)" |
| MCI log | Tagged, Moved, Transported, Zone cleared, Zone reopened |
| Undo entries | Shown with the entry they reverse. The reversed entry is struck through and never dropped |
| Unit assignments | "Alpha 1 to Triage at Zone A" |
| Surge | The surge period that was closed when the MCI was declared |
| Normal calls during the MCI | Opened, assigned and resolved, as already logged |

Columns: Time, Type, Where, Detail, Color, Count, Unit and By. The table filters by type and by zone or location and never hides undone rows unless the filter says so.

### Export
- **Summary CSV.** The same rows as the timeline in the same order, so the CSV matches the page. The existing MCI rows move under the shared column set.
- **Dispatch page Export Logs.** Gets the MCI rows too. It has none today, which is a known gap.
- **Print.** A print stylesheet so the page saves to PDF for the case report.
- **Names.** `By` shows the person's name where the app has one and the uid otherwise.

### Accuracy rules
- The page never computes a count that the log cannot support. Anything that would be an estimate (per-patient wait) is left out and the page says so.
- The reconciliation line runs on every load and is part of the e2e check.
- Totals on the tab, the page and the CSV come from `deriveMci` and nothing else.

### Build order
1. Transport model, helpers and tests (Part 1).
2. Transport screens.
3. Timeline builder as a pure function with tests, then the page sections and charts.
4. CSV and dispatch-page export from the timeline builder.
5. E2e: a full drill ending in the summary with the reconciliation mark.
