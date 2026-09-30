# Architecture Overview

A concise map of CrowdCAD's architecture and where the key pieces live.

## High level

- **Frontend:** Next.js 15 (App Router), React 19 and TypeScript. Styling uses Tailwind CSS with HeroUI components.
- **Backend:** Firebase (Authentication, Firestore and Cloud Storage) or PocketBase, selected with `NEXT_PUBLIC_BACKEND`. App code talks to either one through `src/lib/services` (`authService`, `dbService` and `storageService`) and never imports a backend SDK directly.
- **Lite mode:** stores events in the browser (`src/lib/liteEventStore.ts`) and renders the same dispatch page with no backend.
- **Deployment:** Firebase Hosting, any Node host or the Docker Compose stack (`docker-compose.yml`). CI runs on GitHub Actions.

## Repository layout

- `src/app/`: App Router routes and layouts (server components by default).
  - `layout.tsx`: root layout and providers
  - `firebase.ts`: Firebase initialization, stubbed out when the backend is PocketBase
  - `types.ts`: domain types shared across the app
  - `(main)/venues/`: venue selection and the venue management wizard
  - `(main)/events/[eventId]/`: event creation (`create`), the dispatch board (`dispatch`) and the post-event report (`summary`)
  - `lite/`: Lite mode routes. `lite/events/[localEventId]/dispatch/page.tsx` re-exports the main dispatch page.
  - `profile/`, `reset-password/` and `api/`
- `src/components/`: UI grouped by role.
  - `dispatch/`: dispatch board widgets (team cards, tracking tables and cards, availability strip, map tab)
  - `event-create/`: event wizard step sections
  - `venue-management/`: venue wizard pieces (layers, markers, areas, equipment)
  - `wizard/`: the shared step shell used by both wizards
  - `modals/`: dialogs, named `*modal.tsx`
  - `profile/`: profile and admin sections
  - `layout/`: navbars (`appnavbar.tsx`, `litenavbar.tsx`, shared pieces in `navbarshared.tsx`) and the app shell
  - `ui/`: remaining shadcn/Radix primitives and shared chrome (loading screen, map pan and zoom controls, code snippet)
- `src/hooks/`: shared hooks (auth, admin and certifications, dispatch vocabulary, timers, zoom and pan, schedule generation)
- `src/lib/`: pure helpers (sorting, formatting, CSV, zones, clinics, posting times, status colors) and the `services/` backend layer
- `scripts/`: PocketBase provisioning, first-admin bootstrap for both backends and data backfills
- `tests/e2e/`: Playwright BDD suites for both backends
- `dataconnect/`: Firebase Data Connect schema and connector definitions
- `docs/`: this documentation

## Key decisions

- **Server components by default.** Files that use hooks, event handlers or browser APIs need `'use client'` at the top.
- **Swappable backend.** `src/lib/services/factory.ts` picks the Firebase or PocketBase implementation of `IAuthService`, `IDbService` and `IStorageService`. Edit `src/app/firebase.ts` with care since both backends import it.
- **Feature decomposition.** Split a page into focused section components once it collects unrelated responsibilities. Pure data helpers belong in `src/lib/`.
- **Shared dispatch primitives.** Call and clinic tracking compose `trackingtablebase.tsx`, `trackingtextentry.tsx` and `motioncell.tsx`. Variants (desktop and mobile, normal and condensed) share logic through `*parts.tsx` modules.
- **Centralized status theming.** Status colors come from `src/lib/statusColors.ts`, which reads its values from `src/lib/colorTokens.js`. Tailwind's config reads the same file.

## Data model

- Domain types live in `src/app/types.ts`.
- [`ICD.md`](ICD.md) documents every PocketBase collection and embedded JSON shape. Firestore documents use the same shapes.
- Access control lives in `firestore.rules` for Firebase and in the rule constants at the top of `scripts/setup-pocketbase.js` for PocketBase. Keep the two in step.

## Authentication and security

- `src/hooks/useauth.ts` exposes `authService` auth state to components for either backend.
- App-level admin is an `isAdmin` flag on the user record. The first admin is set with `scripts/setAdmin.js` (Firebase) or `scripts/setAdminPocketbase.js` (PocketBase).
- Service accounts, BAAs and other production configuration are per organization. See [`SETUP_FIREBASE.md`](SETUP_FIREBASE.md), [`SETUP_POCKETBASE.md`](SETUP_POCKETBASE.md) and [`DEPLOYMENT.md`](DEPLOYMENT.md).

## Development and testing

- `npm install`, then `npm run dev`.
- `npm run lint` and `npm run type-check`.
- `npm run test:e2e` runs the Firebase suite against the Emulator Suite. `npm run test:e2e:pocketbase` runs the PocketBase suite.

## Where to look for examples

- Modal: `src/components/modals/event/quickcallmodal.tsx`
- Dispatch layout: `src/components/dispatch/leftpanellists.tsx` and `dispatchcontrols.tsx`
- Dispatch widgets: `teamcard.tsx`, `calltrackingcard.tsx` and `clinictrackingcard.tsx` in `src/components/dispatch/`
- Wizard: `src/components/wizard/WizardShell.tsx`

## Maintainers

- Evan Passalacqua (`@evanqua`) and Ivan Zhang (`@iv-zhang`)
- Security reports go to support@crowdcad.org or GitHub Security Advisories.
