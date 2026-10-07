# Component Library and Conventions

Where UI components live, how they are named and the patterns used across CrowdCAD's frontend.

## Overview

- Components live under `src/components/`, grouped by role (UI primitives, feature widgets, modals and layout).
- Files are TypeScript React (`.tsx`). Components that use hooks or browser APIs need `'use client'` at the top.

## Directory highlights

- `src/components/ui/`: the shadcn/Radix primitives still in use (`dropdown-menu.tsx`, `resizable.tsx`) plus shared chrome (`loading-screen.tsx`, `codesnippet.tsx`, `map-pan-surface.tsx` and `map-zoom-controls.tsx`). Most UI uses HeroUI directly. Only add a local wrapper around a HeroUI component when several call sites need the same customization.

- `src/components/modals/`: dialogs grouped by feature, named `*modal.tsx`.
  - `modals/auth/loginmodal.tsx`: login flow
  - `modals/event/`: dispatch and event dialogs (`quickcallmodal.tsx`, `addteammodal.tsx`, `bulkimportmodal.tsx`, `transportunitmodal.tsx`, `endeventmodal.tsx`, `exportlogmodal.tsx` and others)
  - `modals/venue/`: venue editing dialogs (`geojsonimport.tsx`, `locationedit.tsx`, `zoneedit.tsx` and `newlayer.tsx`)

- `src/components/dispatch/`: the dispatch board (`src/app/(main)/events/[eventId]/dispatch/page.tsx`, which Lite mode reuses as-is).
  - Left panel: `leftpanellists.tsx` (`TeamList`, `SupervisorList` and `EquipmentList`, rendered by both the desktop sidebar and the mobile tabs), `teamwidget.tsx` (picks the card variant), `teamcard.tsx` and `teamcard-condensed.tsx` (two layouts over the shared pieces in `teamcardparts.tsx`), `equipmentcard.tsx` and `availabilitysurgestrip.tsx`.
  - Toolbars: `dispatchcontrols.tsx` (`CallSortButton`, `CallZoneFilterButton` and `TeamActionButtonGroup`), `paneltab.tsx` (the folder-style Calls, Clinic and Map tabs) and `surgetogglebutton.tsx`.
  - Right panel: `calltracking.tsx` and `clinictracking.tsx` (desktop tables over `trackingtablebase.tsx`), `calltrackingdetails.tsx`, `trackinginsights.tsx` and `venuemaptab.tsx`.
  - Mobile cards: `calltrackingcard.tsx` and `clinictrackingcard.tsx`, sharing `trackingcardparts.tsx` (age and sex with complaint row, notes and log section, timer and `dropdownMotionProps`).
  - Small shared pieces: `statuslabel.tsx`, `callindicatoricons.tsx`, `pendingcallchip.tsx`, `equipmenttypeicon.tsx`, `trackingtextentry.tsx` (notes and log textarea) and `motioncell.tsx` (animated expand and collapse wrapper that stays mounted while collapsed, so child state survives).
  - `clinicwalkupmodal.tsx`: clinic walk-up intake.

- `src/components/event-create/`: event wizard steps (`MetadataSection`, `TeamStaffingSection`, `SupervisorStaffingSection`, `PostsEquipmentSection`, `PostingScheduleSection` and `SurgeCriteriaSection`).

- `src/components/venue-management/`: venue wizard pieces (`LayerControlBar`, marker and area mode toggles, `PendingMarkerDialog`, `PendingZoneDialog`, `VenueMapMarker`, `VenueMapZones` and `EquipmentManagementSection`).

- `src/components/wizard/`: the step shell shared by venue and event creation. See "Wizard step shell" below. `eventReview.ts` holds the review-step summaries and back and next navigation shared by the cloud and Lite event wizards.

- `src/components/profile/`: profile sections and the admin panels (certifications, users, venues).

- `src/components/layout/`: `appnavbar.tsx` (cloud) and `litenavbar.tsx` (Lite mode), both `h-14`. Shared pieces (live clock, theme toggle, mobile account menu, lazy login modal) live in `navbarshared.tsx`. `appshell.tsx` wraps authenticated pages.

- `src/components/devServiceWorkerCleanup.tsx`: clears stale service workers in development.

## Wizard step shell

`src/components/wizard/` (`WizardShell` and `StepProgress`) is the config-driven step flow used by venue creation (`src/app/(main)/venues/management/page.client.tsx`) and event creation (`src/app/(main)/events/[eventId]/create/page.tsx`). It renders a dot-line-dot progress indicator above the current step and handles non-linear navigation (clicking a completed step's dot jumps to it), focus management on step change and ARIA labeling.

The shell owns no form data. Its only navigation rule is that a step must be reachable before you can click into it. The calling page decides what each step contains, whether it is optional and what "Continue" does.

To add a step, add one entry to the page's `steps` array:

```tsx
import { WizardShell, type WizardStep } from '@/components/wizard';

const [currentStepId, setCurrentStepId] = useState('basics');

const steps: WizardStep[] = [
  { id: 'basics', label: 'Basics', component: basicsStepContent, isComplete: hasName },
  { id: 'newstep', label: 'New Step', component: newStepContent, isComplete: true },
  // ...
];

<WizardShell
  steps={steps}
  currentStepId={currentStepId}
  onStepChange={setCurrentStepId}
/>
```

- `component` is JSX the page already built from its own state. `WizardShell` inserts whichever step matches `currentStepId` and never inspects it.
- `isComplete` is a boolean the page computes (for example `!!eventData.name.trim()`). It controls whether that step's dot is clickable. Use `true` for a step with no requirements.
- `WizardShell` renders no Back, Continue or Save buttons. Each page renders its own footer below `<WizardShell />` and calls `onStepChange` to move between steps.
- When a wizard sits in a fixed-width column (such as event creation's left panel), check it in the browser at that width. `StepProgress` wraps labels onto two lines, and six or more steps still need room.
- Accessibility is handled by the shell. Each dot has an `aria-label` with its name and state (`"Basics: completed"`), the current dot has `aria-current="step"`, disabled dots are unreachable by keyboard and focus moves to the new step's content on every step change.

## Styling and design tokens

- Style with Tailwind. Use `cn()` from `src/lib/utils.ts` (built on `clsx` and `tailwind-merge`) for conditional classes.
- Follow existing token and utility patterns to keep the visuals consistent.
- Dispatch status colors come from `src/lib/statusColors.ts`, backed by `src/lib/colorTokens.js`.
- Give section components explicit local prop types. Avoid threading untyped page state through several layers.

## Text inputs: no inner focus ring

HeroUI's `Input`, `Textarea` and `Autocomplete` already show focus on their wrapper, and the browser adds a second ring on the inner `<input>`. That inner ring keeps coming back on new fields, so every free-text or search field removes it on the `input` slot:

```tsx
const inputClassNames = {
  input: 'outline-none focus:outline-none data-[focus=true]:outline-none focus:ring-0 focus-visible:ring-0',
};

<Input classNames={inputClassNames} />
<Autocomplete inputProps={{ classNames: inputClassNames }} />
```

- Merge it into the field's existing `classNames` (label, wrapper and so on) rather than replacing them. Examples: the Add Call modal (`quickcallmodal.tsx`), event creation's `inputClassNames`, `cardFieldClassNames` in `trackingcardparts.tsx`.
- TAK fields use `TAK_INPUT_CLASSNAMES` from `src/features/tak/lib/ui.ts`.
- Keep focus visible: this removes only the duplicate inner ring, not the wrapper's focus styling.

## Third-party UI libraries

- HeroUI for higher-level components
- `lucide-react` for icons

## Accessibility

- Use semantic HTML (buttons, labels, fieldsets) and add `aria-*` attributes where needed.
- Manage focus in dialogs and support keyboard interaction in interactive widgets.

## Adding a component

1. Create it in the matching folder under `src/components`.
2. Add `'use client'` if it uses state, effects or browser APIs.
3. Exercise it on a temporary page or in the running app.
4. Add E2E coverage under `tests/e2e/` where it affects a user workflow.
5. Export it as the default export.

## Example modal

```tsx
'use client';

import { Modal, ModalBody, ModalContent, ModalHeader } from '@heroui/react';

export default function ExampleModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  return (
    <Modal isOpen={isOpen} onOpenChange={(open) => !open && onClose()}>
      <ModalContent>
        <ModalHeader>Example</ModalHeader>
        <ModalBody>Example modal content</ModalBody>
      </ModalContent>
    </Modal>
  );
}
```

## Tips

- Keep components small and compose them.
- **Never declare a component inside another component's body** (`const Foo = () => <.../>` inside a page, then `<Foo />`). React sees a new component type on every render and remounts it. On the dispatch page that happens on every data snapshot, which closes open dropdowns and drops local state. Declare it at module scope and pass props, or call a plain render function as `{renderFoo()}`.
- When two variants (desktop and mobile, cloud and Lite, normal and condensed) need the same control or logic, move it into a shared `*parts.tsx` or `*shared.tsx` module next to them. Copies drift. See `teamcardparts.tsx`, `trackingcardparts.tsx` and `navbarshared.tsx`.
- Put pure data helpers (sorting, formatting, parsing, CSV) in `src/lib/` as plain functions.
- Reuse primitives, map controls and viewport wrappers from `src/components/ui` before writing page-specific versions.
- Reuse `trackingtablebase.tsx`, `trackingtextentry.tsx` and `motioncell.tsx` before adding table or entry logic inside call or clinic cards.
- Name new modals `*modal.tsx`.

## Where to find examples

- Wizard: `src/components/wizard/WizardShell.tsx` and `StepProgress.tsx`
- Modal: `src/components/modals/event/venuemapmodal.tsx`
- Dispatch cards: `teamcard.tsx`, `calltrackingcard.tsx` and `clinictrackingcard.tsx` in `src/components/dispatch/`
- Shared dispatch primitives: `trackingtablebase.tsx`, `trackingtextentry.tsx` and `teamcardparts.tsx`
- UI primitives: `src/components/ui/dropdown-menu.tsx` and `map-zoom-controls.tsx`
