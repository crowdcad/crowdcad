# Component Library and Conventions

This document describes where UI components live, naming conventions, and patterns used across CrowdCAD's frontend.

Overview
- Components live under `src/components/` and are organized by role (UI primitives, feature widgets, modals, layout).
- Files are TypeScript React (`.tsx`). Client components that use hooks or browser APIs must include the `'use client'` directive at the top.

Directory highlights

- `src/components/ui/` — the few shadcn/Radix primitives still in use (`dropdown-menu.tsx`, `resizable.tsx`) plus shared chrome (`loading-screen.tsx`, `codesnippet.tsx`, map pan/zoom controls — see below). Most UI uses HeroUI components directly; don't add a local wrapper for a HeroUI component unless several call sites need the same customization.

- `src/components/modals/` — modal dialogs grouped by feature:
  - `modals/auth/loginmodal.tsx` — login flow modal.
  - `modals/event/quickcallmodal.tsx` — quick new-call modal used in dispatch.
  - Naming pattern: `*modal.tsx`.

- `src/components/dispatch/` — feature-specific UI used on the dispatch dashboard (`src/app/(main)/events/[eventId]/dispatch/page.tsx`, which Lite mode reuses as-is):
  - Left panel: `leftpanellists.tsx` (`TeamList` / `SupervisorList` / `EquipmentList`, rendered by both the desktop sidebar and the mobile tabs), `teamwidget.tsx` (picks the card variant), `teamcard.tsx` / `teamcard-condensed.tsx` (two layouts over the shared pieces in `teamcardparts.tsx`), `equipmentcard.tsx`, `availabilitysurgestrip.tsx`.
  - Toolbars: `dispatchcontrols.tsx` (`CallSortButton`, `CallZoneFilterButton`, `TeamActionButtonGroup`), `paneltab.tsx` (the folder-style Calls/Clinic/Map tabs), `surgetogglebutton.tsx`.
  - Right panel: `calltracking.tsx` / `clinictracking.tsx` (desktop tables over `trackingtablebase.tsx`), `calltrackingdetails.tsx`, `trackinginsights.tsx`, `venuemaptab.tsx`.
  - Mobile cards: `calltrackingcard.tsx` / `clinictrackingcard.tsx`, sharing `trackingcardparts.tsx` (age/sex + complaint row, notes + log section, timer, `dropdownMotionProps`).
  - Small shared pieces: `statuslabel.tsx`, `callindicatoricons.tsx`, `pendingcallchip.tsx`, `equipmenttypeicon.tsx`, `trackingtextentry.tsx` (notes/log textarea), `motioncell.tsx` (animated expand/collapse wrapper — stays mounted while collapsed, so child state survives).
  - `clinicwalkupmodal.tsx` — clinic walk-up intake.

- `src/components/event-create/` — event creation sections used by the event create page:
  - metadata, staffing, posting schedule, and posts/equipment are split into focused components rather than a single page-local block.

- `src/components/venue-management/` — venue management sections used by the venue editor:
  - layer controls, marker placement UI, upload handling, and equipment management are separated into dedicated components.

- `src/components/wizard/` — the shared step/wizard shell used by both venue creation and event creation. See "Wizard step shell" below. `eventReview.ts` holds the review-step summaries and back/next navigation shared by the cloud and Lite event wizards.

- `src/components/layout/` — layout-level components (global navigation, header):
  - `appnavbar.tsx` (cloud) and `litenavbar.tsx` (Lite mode) — top navigation; both are `h-14`. Shared pieces (live clock, theme toggle, mobile account menu, lazy login modal) live in `navbarshared.tsx`.

- `src/components/ui/` also contains shared interaction chrome used by multiple pages:
  - `map-pan-surface.tsx` — reusable pan/wheel surface for map canvases.
  - `map-zoom-controls.tsx` — shared zoom/reset button cluster for map viewers.

- Root helpers
  - `src/components/devServiceWorkerCleanup.tsx` — helper for service worker cleanup in dev.

Wizard step shell

`src/components/wizard/` (`WizardShell` + `StepProgress`) is the config-driven step flow used by both venue creation (`src/app/(main)/venues/management/page.client.tsx`) and event creation (`src/app/(main)/events/[eventId]/create/page.tsx`). It renders a "dot-line-dot" progress indicator above the current step's content, and handles non-linear navigation (clicking a completed step's dot jumps there), focus management on step change, and ARIA labeling — none of that needs reimplementing per page.

The shell itself owns no form data and no navigation policy beyond "don't let you click into a step that isn't reachable yet." Everything else — what a step contains, whether it's optional, what "Continue" does — is the calling page's job.

Adding a step to an existing wizard: add one entry to that page's `steps` array. Nothing in `WizardShell` or `StepProgress` needs to change.

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

- `component` is JSX the page already constructed from its own state (a `const` computed each render, same as any other section) — `WizardShell` just inserts whichever step's `component` matches `currentStepId`. It never inspects step content itself.
- `isComplete` is a plain boolean the page computes from its own data (e.g. `!!eventData.name.trim()`), not something the shell derives. It controls whether that step's progress dot is clickable — a step that's always safe to jump to (nothing required to reach it) should just be `true`.
- `WizardShell` doesn't render Back/Continue/Save buttons — those are page-specific (a save action might live only on a final "Review" step, an optional step might skip straight past validation, etc.), so each page renders its own step-navigation footer below `<WizardShell />`, calling `onStepChange` directly to move forward/back.
- Keep step content itself reasonably narrow when a wizard lives in a fixed-width column rather than the full page (event creation's left panel, for example) — `StepProgress`'s labels wrap onto two lines rather than truncating, but a step with 6+ entries still needs real width to read cleanly; check it in the browser at the column width it'll actually render at, not just full-page.
- Accessibility (already handled, no per-page work needed): each progress dot has an `aria-label` announcing its name and state (`"Basics: completed"`) and `aria-current="step"` on the current one; disabled dots are unreachable via keyboard the same way they're unclickable with a mouse; focus moves to the new step's content automatically whenever `currentStepId` changes, so keyboard/screen-reader users don't lose their place when a control they just used (e.g. a dot in yesterday's step) disappears from the DOM.

Styling and design tokens

- TailwindCSS powers styling. Use the `cn()` helper in `src/lib/utils.ts` for conditional class merging.
- Use `tailwind-merge` (`tailwind-merge` is already a dependency) for combining utility classes safely.
- Follow existing token and utility patterns when adding new classes to preserve visual consistency.
- Dispatch status colors should come from `src/lib/statusColors.ts` so team cards and tracking rows remain visually consistent.
- Keep feature sections small and typed explicitly; prefer local prop types for section components and avoid passing untyped page state through multiple layers.

Third-party UI libraries

- HeroUI components are used for higher-level UI patterns.
- Icons come from `lucide-react`.

Accessibility

- Prefer semantic HTML (buttons, labels, fieldset) and add `aria-*` attributes when needed.
- Ensure focus management for dialogs and keyboard interaction for interactive widgets.

Adding a new component (recommended steps)

1. Create the component under the appropriate folder in `src/components`.
2. If it uses state or effects, add `'use client'` at top.
3. Write a small visual/test harness in a story or a temporary page (or the dev view) to exercise the component.
4. Add unit or integration tests where appropriate.
5. Export the component as default and import it where needed.

Example modal skeleton

```tsx
'use client'
import React from 'react'
import Modal from '@heroui/react/Modal'

export default function ExampleModal({ open, onClose }) {
  return (
    <Modal open={open} onOpenChange={onClose}>
      <div className="p-4">Example modal content</div>
    </Modal>
  )
}
```

Tips

- Keep components small and focused — prefer composition over large monolithic components.
- **Never declare a component inside another component's body** (`const Foo = () => <.../>` inside a page, then `<Foo />`). React sees a new component type every render and remounts it — on the dispatch page that means every Firestore snapshot, which closes open dropdowns and drops local state. Put it at module scope and pass props, or use a plain render function called as `{renderFoo()}`.
- When two variants of a component (desktop/mobile, cloud/Lite, normal/condensed) need the same control or logic, extract it to a shared `*parts.tsx` / `*shared.tsx` module next to them rather than copying it — copies drift (see `teamcardparts.tsx`, `trackingcardparts.tsx`, `navbarshared.tsx`).
- Pure data helpers (sorting, formatting, parsing, CSV) belong in `src/lib/` as plain functions, not as closures inside a page.
- Reuse primitives from `src/components/ui` rather than adding duplicated styles.
- Reuse shared map controls and viewport wrappers from `src/components/ui` before creating page-specific zoom/pan implementations.
- Reuse shared dispatch primitives (`trackingtablebase.tsx`, `trackingtextentry.tsx`, `motioncell.tsx`) before adding table/entry logic directly inside call or clinic cards.
- When creating new modals, follow the `*modal.tsx` naming convention so they are easy to locate.

Where to find examples

- Wizard step shell: `src/components/wizard/WizardShell.tsx`, `src/components/wizard/StepProgress.tsx` — consumed by `src/app/(main)/venues/management/page.client.tsx` and `src/app/(main)/events/[eventId]/create/page.tsx`.
- Modal example: `src/components/modals/event/venuemapmodal.tsx`
- Dispatch card examples: `src/components/dispatch/teamcard.tsx`, `src/components/dispatch/calltrackingcard.tsx`, `src/components/dispatch/clinictrackingcard.tsx`
- Shared dispatch primitive examples: `src/components/dispatch/trackingtablebase.tsx`, `src/components/dispatch/trackingtextentry.tsx`, `src/components/dispatch/teamcardparts.tsx`
- UI primitives: `src/components/ui/dropdown-menu.tsx`, `src/components/ui/map-zoom-controls.tsx`

If you need a component added to a shared export index, open a small PR and reference this doc.
