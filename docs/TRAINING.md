# CrowdCAD Training

CrowdCAD Training teaches dispatchers the dispatch interface by having them use it. Each module puts the trainee on the real dispatch page with a practice event and walks them through one job, step by step, with a pointer on each control. A Help button in the navbar finds the step for whatever the dispatcher is trying to do, then points at it on their own board or opens it as practice.

- `/training`: the catalog. Tracks in order, each module one row with its estimated time and a check whose ring fills with this browser's progress.
- `/training/<module id>`: a module. `?step=<step id>` (or a step number) opens the section that step is in.
- The Help button: in core's navbar, Lite's navbar and the training bar.

## Tracks and modules

The catalog (`TRACKS` and `MODULES` in `src/training/registry.ts`) is three sections, numbered in this order:

1. **Basic Dispatch Features**
   - Module 1: Dispatch layout basics (`orientation`)
   - Module 2: Add a call and assign a team (`call-assignment`)
   - Module 3: Add a helper team to deliver equipment (`equipment-delivery`)
   - Module 4: Add a clinic patient and record transport (`clinic-patients`)
   - Module 5: Posting schedules (not built yet, see To do)
   - Module 6: Surge and the log (`surge-and-log`)
   - Dispatch on a phone (`mobile-tour`, phone)

Module numbers in the catalog count the visible modules in order, so until Posting schedules exists, Surge and the log shows as Module 5. All three tracks are released (`release: 'stable'`).

### Phone modules

A module with `device: 'phone'` is made for a phone's screen. Opened on a computer, the player (`src/components/training/TrainingPlayer.tsx`) shows a phone-sized frame: a same-origin iframe of the same module with `?embed=phone`, so media queries, `useIsMobile` and `position: fixed` all behave exactly as on a phone, and the step card sits beside the frame. The page in the frame runs the session, posts its state to the card, and takes the card's presses by `postMessage` (`src/training/frameBridge.ts`); the coachmark is drawn inside the frame. Opened on a phone, the module runs full screen with the card above the screen, so it never covers a bottom bar. `laptop` and `desktop` modules run in the window.


## To do

- **Module 5: Posting schedules.** A Basic Dispatch Features module on posting schedules, between `clinic-patients` and `surge-and-log` in `MODULES`. Not designed or built yet.

## How it works

A module runs the dispatch page exactly as Lite mode does (`src/lib/LiteContext.tsx`), with three extras the training player supplies:

| Extra | File | What it does |
|---|---|---|
| In-memory store | `src/training/memoryStore.ts` | The event lives only in the tab. Nothing is written to IndexedDB, Firebase or anywhere else, and leaving the module discards it. |
| Write gate | `src/training/gate.ts` | While the module is guided, a write is dropped if it brings in text the script did not ask for. |
| Tracking feed | `src/training/trackingFeed.ts` | A scripted stand-in for TAK: positions computed from the board itself, in the same `UnitTracking` shape the TAK module reports. |

The dispatch page reads the store, gate and feed from `useLiteMode()`. Lite routes get the IndexedDB store and no gate or feed, so `/lite` behaves as before.


### What trainees can type

The point of the gate is that the hosted site never invites anyone to type real patient details. It is on only while a module is guided:

- During the guided steps, a write may only add text that the current or earlier steps list in `values` (shown in the step as chips), text already on the board, or the board's own words (`SYSTEM_TEXT`). Anything else is dropped and the step card says why.
- Once the module is complete, or after its `unlockAfter` step, the gate is off for good and the board is free practice.
- A step with `free: true` lifts the gate for that step only (ending an MCI writes the board's own text into the clinic tracker).

Ids, statuses, timestamps and logs are never checked (`SKIP_KEYS`). Logs only repeat text that already passed. In development the console shows what the gate turned away.

The sandbox stays in the browser either way.

## Modules are data

A module is a `TrainingModule` (`src/training/types.ts`). The player, the catalog, Help and both test suites read the same definitions:

```ts
const callAssignment: TrainingModule = {
  id: 'call-assignment',
  version: 1,
  track: 'dispatcher',
  title: 'Regular call assignment flow',
  release: 'stable',
  seed: () => trainingBoard('call-assignment'),
  practice: ['Log a second call of your own ...'],
  steps: [
    {
      id: 'open-add-call',
      section: 'Take the call',
      title: 'Open Add Call',
      body: 'Click **{{Add Call}}**.',
      anchor: 'add-call-button',
      estSec: 15,
      intents: ['add a call', 'new call'],
      doneWhenVisible: 'quick-call-modal',
      liveSafe: true,
    },
    {
      id: 'fill-call',
      section: 'Take the call',
      title: 'Fill in the call',
      body: 'Type {{Location}} `Sather Gate` ... then click **Submit**.',
      anchors: ['quick-call-modal', 'add-call-button'],
      estSec: 60,
      values: ['Sather Gate', 'Radio', '34M', 'Dizzy'],
      done: (e) => !!findCall(e, 'Sather Gate'),
      apply: (e) => addCall(e, { location: 'Sather Gate', ... }),
    },
  ],
};
```

There are three kinds of step:

| Kind | Has | Finishes when | "Do it for me" |
|---|---|---|---|
| Read | neither `done` nor `doneWhenVisible` | the trainee clicks Next | moves on |
| UI | `doneWhenVisible` | that anchor appears (a modal or menu opened) | presses the anchor, or each of `doClicks` in turn |
| Data | `done` and `apply` | `done(event)` is true | applies `apply` to the board |

Fields worth knowing:

- `body`: `{{Term}}` shows the org's word for a dispatch term (`src/lib/dispatchVocabulary`), and `{{term}}` (lowercase first letter) shows it lowercased for the middle of a sentence. `**bold**` is bold and `` `value` `` is a value to type. Write labels in sentence case: "the log", "the calls tab", "a {{team}}". Keep a control's exact label (`**{{Log}}**` as a menu option) only where it names that control.
- `anchor` / `anchors`: a `data-testid`, or `css:` and any selector. The first one on screen is used, so list the specific one first and a fallback after it (the open form, then the button that opens it).
- `figure`: a component shown under the instruction, for a screen the sandbox can't open (the event builder, say): usually that screen's own parts, read-only, with the control to use outlined.
- A control that stays mounted while closed (a collapsible panel marked `inert`) still counts as on screen: anchor its open state, e.g. `css:[data-testid="some-panel"]:not([inert])`.
- `section`: steps with the same section form one entry in the steps menu. Picking a section rebuilds the board by applying every earlier step's `apply` to the seed, so any section can be started directly.
- `estSec`: seconds for a first-timer. Module, track and catalog times are sums of these.
- `intents`: phrases a dispatcher might type into Help.
- `liveSafe`: the step only points at a control that exists on any board, so Help may show it on a live event.
- `version`: bump it when steps change meaning. Progress saved for an older version is dropped.

Shared pieces: `src/training/fixtures.ts` (the practice event, on the training map below), `src/training/actions.ts` (what clicks do to the event, for `apply`) and the helpers in `src/lib/`. Extension packs' modules (src/extensions, `training`) can use their own helpers.

## The training map

Every module runs on one map: `src/training/maps/practice-map.json`, a GeoJSON file read by `src/training/practiceMap.ts`. To change it, open the file in a GeoJSON editor ([geojson.io](https://geojson.io) works, no account), draw, then save over it as GeoJSON, keeping the `.json` name. Each feature says what it is with one property:

| Draw | Property | Becomes |
| --- | --- | --- |
| Point | `"Location": "Sather Gate"` | a post |
| Point | `"Clinic": "South Clinic"` | a clinic: a post with its own clinic tab |
| Polygon | `"Zone": "Glade"` (optional `"color"` or `"fill"`) | a zone; MCI zones come from these |
| Polygon | `"Area": "Campus"` (optional) | the event's map area; without one, the box around everything plus a margin |
| Line | `"TAKPath": "MRC2"` | the route that team's marker follows in TAK modules when it travels somewhere within 150 m of the line's end; draw it from the team's post toward the destination |

Teams are named `MRC1` to `MRC5` (`teamName` in `fixtures.ts`), which is also their practice TAK call sign and the name a `TAKPath` uses. Where each team is posted, and the places the scripts name, are in `fixtures.ts` (`POSTS`, `baseStaff`). The main clinic (`POSTS.clinic`) is listed first, so it is the MCI move dialog's default. Renaming a place on the map means renaming it in `POSTS` and in the step text that mentions it; `src/training/modules.test.ts` fails with the missing name until they match, and also flags features without one of the properties above and paths that name no team.

The street basemap under the map needs internet; everything else is in the file.

## Adding or changing a module

1. Write the module in `src/training/modules/` and add it to `MODULES` in `src/training/registry.ts`.
2. Point steps at `data-testid`s. Add any missing ones to the component, using the same ids e2e tests use. Never point at text or classes.
3. Give each data step an `apply` that leaves the board the way the real UI would, far enough for the next step's `done` to read it.
4. List every value the trainee types in `values` and as a chip in `body`.
5. Give the module at least one step with `intents`, so Help can find it.
6. Run `npx vitest run src/training` and walk the module in the browser.
7. Add the module to the examples in `tests/e2e/features/training.feature`.

Unreleased features go in a `release: 'preview'` module (and track). Preview modules show only when `NEXT_PUBLIC_TRAINING_PREVIEW` is `on` or in development. This is separate from any feature's own build flag. The e2e builds turn preview on.

## Keeping it working

Changing a dispatcher-facing flow means checking its training. Three checks catch most breakage:

- `src/training/modules.test.ts` (unit, runs with `npx vitest run`): every step is well formed, every anchor resolves to a `data-testid` in `src/`, every value is shown in its step, replaying `apply` from the seed makes each data step done and never done before it, and the gate accepts the script's own writes.
- `src/training/help.test.ts`: Help finds the steps dispatchers ask for.
- `tests/e2e/features/training.feature` (Playwright, `@public`): each module completed with its own "Do it for me", which presses the real controls. A control that moved, was renamed or no longer opens what it should leaves the walk stuck on that step.

A PR that changes the board's UI or data should keep all three passing. A new dispatcher-facing feature should come with a module or new steps in an existing one.

## Help

The navbar's **?** opens a dropdown: "What would you like to do?", a search box, common results and a link to all modules. `src/training/help.ts` searches every visible step's `intents`, title and text, one result per section, ranked toward what the board is doing (an active MCI, a TAK event). Step titles are what Help lists, so keep them short and action-first, using the control's own name ("Add a call", "Search the Log", "End the MCI"). Each result shows:

- **The title**: when the step is `liveSafe` and its control is on screen, clicking it shows a coachmark on the current page (Show me). It moves on to the module's next `liveSafe` step when the control opens, and never writes to the event.
- **Module N**: a link to the step's section in its module (a new tab when opened from a dispatch interface).

## Limits

- The summary page is a cloud feature with no Lite path. It is not practiced yet.
- Progress is per browser. Nothing records who completed what.
