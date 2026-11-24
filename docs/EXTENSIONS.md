# Extension packs

CrowdCAD's core never names an optional feature. An optional feature plugs in as an **extension pack**: one object that implements part of the contract in `src/extensions/types.ts` (`CrowdcadExtension`). With no packs installed, every slot is empty and the app behaves exactly as without the feature.

## How it fits together

| File | Role |
|---|---|
| `src/extensions/types.ts` | The contract. Every member is optional. |
| `src/extensions/index.ts` | The registry and helpers: `extensions`, `withMember`, `firstOf`, `emit`, and the hooks the pages call. It imports no pack. |
| `src/extensions/installed.ts` | Installs this build's packs, once at startup. |
| `src/extensions/boot.tsx` | Runs `installed.ts` in the browser. It sits in the root layout. The unit tests run it through `setupFiles`. |
| `src/extensions/dispatch.tsx` | Merges packs' dispatch contributions and shares them through context (`useDispatchExtras`). |
| `src/extensions/server.ts` | The server-side contract (`ServerExtension`) and its registry, kept apart so server routes never load a pack's UI. |
| `src/extensions/installed.server.ts` | Installs this build's server packs. The routes that ask packs import it. |

Packs install after modules load. **Read the registry inside a function, a hook or a render, never in module-level code.** A module-level read sees no packs. The registry imports no pack, so shared code that imports it never pulls pack code in.

## Slots

- **Data:** `eventData` keeps state in the pack's own documents beside the event, on cloud events on Firebase. The dispatch page reads it in its write transaction and merges it in. `planTx` reads and splits a write before any pack writes. `subscribe` handles live updates, and `load` does one-off reads. `eventFields` lists fields the pack owns on the event, which Lite drafts copy as they are. `freshen` keeps a local copy while the pack's own writes are still saving. `eventRecord` adds the pack's documents to an event's full record (the owner's JSON export), beside what `eventData` already merges in; never secrets.
- **Dispatch page** (`useDispatch(host)`, called on every render):
  - right-panel `tabs`, the header `strip`, `toolbar` buttons, `mounted` UI (modals);
  - `mapOverlay` and `background` work;
  - `logRows`, with undo;
  - unit `statusOptions`, `statusDetail` (a detail picked with a status, like the built-in clinic for Transporting) and `statusPatch`;
  - a `UnitChip` and extra `locations`.

  `host` gives a pack the event, the write path (`updateEvent`, `setLocalEvent`), `showTab`, `setUnitStatus` and live tracking.
- **Summary page** (`useSummary`): `sections`, step `charts` and `csvLines`.
- **Elsewhere:**
  - `eventCreate` (settings on the basics step, saved by `afterCreate` once the event exists);
  - `adminSections`;
  - `auth` (`signInEmail` maps a typed username to an account; `confinedTo` keeps an account on its own pages);
  - `postMarker` (a medical map pin);
  - `logKinds`;
  - `alertsMuted`;
  - `training` (tracks, modules, a `PracticeSurface` for `surface` modules, a `Provider`, a `TrackingPanel` and its `panelSteps`).
- **Server** (`ServerExtension`): `deleteEventData` removes what the pack keeps for an event outside the event's own documents (login accounts, records in a backend's own collections) when the event is deleted or purged. Everything under `events/{id}` goes with the event anyway.
- **Events:** shared code calls `emit(name, payload)` (see `AppEvents`). Packs react with `on`. Prefer this over adding a member when a pack only needs to react, for example to send a receipt or push to an integration.

## Adding a slot

Add a slot when a feature needs core to hand over control at a point that has none. Keep it generic: name it after what core does there ("a tab", "a status detail"), never after the feature. Then:

1. Add it to `CrowdcadExtension` (or `DispatchContribution`) with a short comment.
2. Read it lazily where core does that thing, and make sure it does nothing when no pack sets it.
3. Cover it in a unit test if it changes data.
