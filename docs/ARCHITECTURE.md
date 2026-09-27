# Architecture Overview

This document gives a concise overview of CrowdCAD's architecture and where key pieces live in the repository.

High level
- Frontend: Next.js (App Router), TypeScript, React (server components by default). UI built using TailwindCSS and HeroUI components.
- Backend / persistence: Firebase (Authentication, Firestore, Cloud Storage) by default, or PocketBase for self-hosting (`NEXT_PUBLIC_BACKEND=pocketbase`). App code talks to either through `src/lib/services` (`authService`, `dbService`, `storageService`), never to the Firebase SDK directly. Lite mode stores events locally in the browser (`src/lib/liteEventStore.ts`). Dataconnect schema exists for connector integration.
- Hosting / CI: Firebase Hosting is used for deployment; CI commonly uses GitHub Actions.

Repository layout (important folders)

- `src/app/` — Next.js App Router source: top-level layouts and pages (server components by default). Key files:
  - `src/app/layout.tsx` — root layout and providers
  - `src/app/firebase.ts` — Firebase initialization (Auth, Firestore, Storage)
  - `src/app/types.ts` — core TypeScript domain types used across the app

- `src/components/` — UI components grouped by role:
  - `src/components/modals/` — modal components (modal files follow `*modal.tsx` naming)
  - `src/components/dispatch/` — dispatch-specific UI (cards, tracking widgets, shared tracking table primitives)
  - `src/components/event-create/` — event creation sections split by responsibility (metadata, staffing, schedule, posts/equipment)
  - `src/components/venue-management/` — venue management sections split by responsibility (layers, marker placement, uploads, equipment)
  - `src/components/layout/` — layout-level components (navbar, etc.)
  - `src/components/ui/` — the remaining shadcn/Radix primitives (dropdown menu, resizable panels) and shared controls (loading screen, map pan/zoom overlays)

- `src/hooks/` — shared React hooks (auth, admin/certifications, dispatch vocabulary, timers, zoom/pan, mobile breakpoint)
- `src/lib/` — pure utilities and domain helpers (`cn()`, status colors, call sorting, team sorting, age/sex parsing, posting times, CSV export, zones, clinics) and the `services/` backend abstraction
- `dataconnect/` — GraphQL schema and connector definitions used for backend connectors
- `docs/` — user and developer documentation (this folder)

Key architectural decisions

- App Router / Server Components: Pages under `src/app` are server components by default. Client interactivity (hooks, event handlers) requires the `'use client'` directive at the top of the file.
- Swappable backend: `src/lib/services/factory.ts` picks the Firebase or PocketBase implementation of `IAuthService` / `IDbService` / `IStorageService`. `src/app/firebase.ts` centralizes Firebase initialization (and stubs it out under PocketBase) and should not be edited lightly.
- Component-first UI: UI is organized around modular components and small primitives in `src/components/ui` so features compose cleanly.
- Feature decomposition: page-level screens should be split into focused section components when a page starts to accumulate unrelated responsibilities.
- Shared dispatch primitives: call and clinic tracking should compose from shared dispatch building blocks (`trackingtablebase.tsx`, `trackingtextentry.tsx`, `motioncell.tsx`) to keep behavior and styling consistent.
- Centralized status theming: dispatch and team views derive status colors from `src/lib/statusColors.ts` rather than page-local class maps.
- Tailwind + HeroUI: Tailwind utility classes are used for styling; HeroUI provides higher-level components.

Data model and types

- Core domain types are stored in `src/app/types.ts` and are used throughout pages and components.
- Firestore documents follow shapes referenced in the frontend and enforced by Firestore rules (deployed per-organization).
- For backend connector integrations, see `dataconnect/schema/schema.gql`.

Authentication & security

- `useauth.ts` in `src/hooks` wraps `authService` auth state for components (Firebase Authentication or PocketBase auth).
- Sensitive production configuration (service accounts, BAAs) must be handled per-organization — see `docs/SETUP_FIREBASE.md`, `docs/SETUP_POCKETBASE.md`, and `docs/DEPLOYMENT.md` for guidance.

Development & testing

- Local development: run `npm install` then `npm run dev` from the repository root.
- Emulator Suite: use the Firebase Emulator Suite for testing Firestore, Auth, and Storage rules locally.

Build & Deploy

- Build scripts are defined in `package.json` (`dev`, `build`, `start`).
- Deploy with the Firebase CLI (`firebase deploy`) or from CI using a `FIREBASE_TOKEN` or Workload Identity Federation.

Where to look for examples

- Client-side modal example: `src/components/modals/event/quickcallmodal.tsx`
- Dispatch page layout: `src/components/dispatch/leftpanellists.tsx`, `src/components/dispatch/dispatchcontrols.tsx`
- Dispatch widgets: `src/components/dispatch/teamcard.tsx`, `src/components/dispatch/calltrackingcard.tsx`, `src/components/dispatch/clinictrackingcard.tsx`
- Dispatch shared primitives: `src/components/dispatch/trackingtablebase.tsx`, `src/components/dispatch/trackingtextentry.tsx`

Maintainers & contact

- Maintainers: Evan Passalacqua (`@evanqua`) and Ivan Zhang (`@iv-zhang`).
- Security reports: `support@crowdcad.org` or GitHub Security Advisories.

Notes

- Keep changes small and scoped; add tests for backend rules when modifying data shapes.
- When adding client components, remember to add `'use client'` and import only client-safe modules.
- Prefer one-responsibility feature sections over large page-local JSX blocks, and reuse shared viewport controls and other primitives from `src/components/ui` before introducing page-specific copies.
