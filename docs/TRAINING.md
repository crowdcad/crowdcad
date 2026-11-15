# CrowdCAD Training

CrowdCAD Training teaches dispatchers the board by having them use it. Each module puts the trainee on the real dispatch page with a practice event and walks them through one job, step by step, with a pointer on each control. A Help button in the navbar finds the step for whatever the dispatcher is trying to do, then points at it on their own board or opens it as practice.

- `/training`: the catalog. Tracks in order, each module with its estimated time, its sections and this browser's progress.
- `/training/<module id>`: a module. `?step=<step id>` (or a step number) opens the section that step is in.
- The Help button: in core's navbar, Lite's navbar and the training bar.

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
- A step with `free: true` lifts the gate for that step only (standing down an MCI writes the board's own text into the clinic tracker).

Ids, statuses, timestamps and logs are never checked (`SKIP_KEYS`). Logs only repeat text that already passed. In development the console shows what the gate turned away.

The sandbox stays in the browser either way, and `/training` says so.

## Modules are data

A module is a `TrainingModule` (`src/training/types.ts`). The player, the catalog, Help and both test suites read the same definitions:

```ts
const callAssignment: TrainingModule = {
  id: 'call-assignment',
  version: 1,
  track: 'dispatcher',
  title: 'Regular call assignment flow',
  release: 'stable',
  seed: () => festivalBoard('call-assignment'),
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
      body: 'Type {{Location}} `Gate B` ... then click **Submit**.',
      anchors: ['quick-call-modal', 'add-call-button'],
      estSec: 60,
      values: ['Gate B', 'Radio', '34M', 'Dizzy'],
      done: (e) => !!findCall(e, 'Gate B'),
      apply: (e) => addCall(e, { location: 'Gate B', ... }),
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

- `body`: `{{Term}}` shows the org's word for a dispatch term (`src/lib/dispatchVocabulary`), `**bold**` is bold and `` `value` `` is a value to type.
- `anchor` / `anchors`: a `data-testid`, or `css:` and any selector. The first one on screen is used, so list the specific one first and a fallback after it (the open form, then the button that opens it).
- `section`: steps with the same section form one entry in the steps menu. Picking a section rebuilds the board by applying every earlier step's `apply` to the seed, so any section can be started directly.
- `estSec`: seconds for a first-timer. Module, track and catalog times are sums of these.
- `intents`: phrases a dispatcher might type into Help.
- `liveSafe`: the step only points at a control that exists on any board, so Help may show it on a live event.
- `version`: bump it when steps change meaning. Progress saved for an older version is dropped.

Shared pieces: `src/training/fixtures.ts` (the practice festival), `src/training/actions.ts` (what clicks do to the event, for `apply`) and the helpers in `src/lib/` (MCI steps use `src/lib/mci.ts`'s own patch functions).

## Adding or changing a module

1. Write the module in `src/training/modules/` and add it to `MODULES` in `src/training/registry.ts`.
2. Point steps at `data-testid`s. Add any missing ones to the component, using the same ids e2e tests use. Never point at text or classes.
3. Give each data step an `apply` that leaves the board the way the real UI would, far enough for the next step's `done` to read it.
4. List every value the trainee types in `values` and as a chip in `body`.
5. Give the module at least one step with `intents`, so Help can find it.
6. Run `npx vitest run src/training` and walk the module in the browser.
7. Add the module to the examples in `tests/e2e/features/training.feature`.

Unreleased features go in a `release: 'preview'` module (and track). Preview modules show only when `NEXT_PUBLIC_TRAINING_PREVIEW` is `on` or in development. This is separate from `NEXT_PUBLIC_TAK`, so a hosted site can run TAK before its training is public. The e2e builds turn preview on.

## Keeping it working

Changing a dispatcher-facing flow means checking its training. Three checks catch most breakage:

- `src/training/modules.test.ts` (unit, runs with `npx vitest run`): every step is well formed, every anchor resolves to a `data-testid` in `src/`, every value is shown in its step, replaying `apply` from the seed makes each data step done and never done before it, and the gate accepts the script's own writes.
- `src/training/help.test.ts`: Help finds the steps dispatchers ask for.
- `tests/e2e/features/training.feature` (Playwright, `@public`): each module completed with its own "Do it for me", which presses the real controls. A control that moved, was renamed or no longer opens what it should leaves the walk stuck on that step.

A PR that changes the board's UI or data should keep all three passing. A new dispatcher-facing feature should come with a module or new steps in an existing one.

## Help

`src/training/help.ts` searches every visible step's `intents`, title and text, one result per section, ranked toward what the board is doing (an active MCI, a TAK event). A result offers:

- **Show me**: a coachmark on the current page, for `liveSafe` steps whose control is on screen. It moves on to the module's next `liveSafe` step when the control opens. It never writes to the event.
- **Practise**: the step's section in its module, in a new tab.

## Limits

- TAK setup needs a real TAK server and admin accounts, so the TAK module explains setup and practises the board side only.
- The summary page and role logins are cloud features with no Lite path. They are not practised yet.
- Progress is per browser. Nothing records who completed what.
