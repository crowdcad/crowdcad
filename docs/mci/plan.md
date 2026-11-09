# MCI mode: December drill MVP

Related: [decisions.md](decisions.md), [../ICD.md](../ICD.md), [../tak-integration/decisions.md](../tak-integration/decisions.md).

## Goal

Add an MCI mode to the dispatch page that a two-person logistics team can run at the December MCI drill. While an MCI is active the dispatcher:

- tracks, per zone, how many patients of each tag color were found, how many were moved to treatment and how many are still in the zone
- marks zones clear when everyone has been moved
- sees how many patients are at each treatment location, including the clinic's regular patients
- works with four team statuses: Available, Triage, Treatment and Unavailable

Nothing about a normal event changes unless MCI mode is declared. The drill feeds a descriptive case report, so the MCI log must be accurate and exportable. It holds counts only, never patient-identifying data.

## Scope

- **Declare and stand down.** A Declare MCI button beside the Surge toggle picks zones (venue zones or added by name) and treatment locations (event clinics or added by name). Stand down closes the period, clears assignments and returns MCI statuses to Available. The data stays and the MCI tab becomes read-only.
- **Counts.** Per zone and color: Tagged, Moved and In zone now. Plus and minus buttons, typed totals, moves to a treatment location, a zone clear button with a suggestion and undo from a log drawer.
- **Treatment locations.** A card per location with MCI patients by color, the regular clinic count and the assigned teams.
- **Teams.** Statuses Available, Triage, Treatment and Unavailable. Triage needs a zone and Treatment needs a treatment location. The assignment is stored on the unit.
- **Summary and export.** An MCI section on the summary page, a step chart of patients in zones and in treatment, and MCI rows in the CSV.
- **Out of scope.** Absorbing a call into the MCI, auto-moving a patient on clinic delivery, hospital transport or release, re-triage shortcuts, TAK suggestions of a unit's zone, per-patient rows, chief complaints and Peak Response. The log's `kind` is a union so these can be added later.

## Data model

Types are in `src/app/types.ts`: `MciState` on `Event.mci`, and `mciAssignment` on `Staff` and `Supervisor`. The sub-shapes are in [../ICD.md](../ICD.md).

- The log is the only source of counts. Pure functions in `src/lib/mci.ts` derive every number.
- Every write goes through `updateEvent` in its functional form, computed from the event the transaction read.
- Undo appends a compensating entry. Nothing is edited or removed.
- PocketBase has `mci` as a `json` field on `events` (`scripts/setup-pocketbase.js` and a migration under `tests/e2e/pb_migrations/`). Lite mode carries it through `liteEventAdapters.ts`. Firestore needs no rule change because `mci` is not a protected field.

## Touchpoints

- New: `src/lib/mci.ts` and tests, `src/components/dispatch/mci/`, this folder, `tests/e2e/features/mci.feature` and its steps, one PocketBase migration.
- Existing: `src/app/types.ts`, the dispatch page (tab, button, handlers and surge gating), `teamcardparts.tsx`, `teamcard.tsx`, `teamcard-condensed.tsx`, `leftpanellists.tsx`, `statusColors.ts`, `teamAvailability.ts`, the dispatch vocabulary terms, the summary page and `SummaryCharts.tsx`, `liteEventAdapters.ts`, `liteEventStore.ts`, `scripts/setup-pocketbase.js` and `docs/ICD.md`.
- Untouched: `src/features/tak/`, `firestore.rules`, `eslint.config.mjs` and `.env*` files.

## Phases

- **P0.** Branch, baseline checks and these docs.
- **P1.** Types, helpers with unit tests, the PocketBase field, the Lite adapters and the ICD.
- **P2.** Declare dialog, MCI tab and stand down.
- **P3.** Counts, moves, zone clear and undo.
- **P4.** Teams: statuses, assignments, availability strip and location behavior.
- **P5.** Summary page and CSV export.
- **P6.** End-to-end tests and build checks.
- **P7.** Preview on localhost for the maintainer, then stop for approval.
