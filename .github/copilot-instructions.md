# AI Agent Instructions for CrowdCAD

CrowdCAD is a computer-aided dispatch board for event medical teams: Next.js 15 (App Router) + TypeScript + Tailwind + HeroUI, with Firebase or PocketBase behind a service layer, plus a browser-only Lite mode.

Read these first. They are maintained and this file only points to them:

- `docs/ARCHITECTURE.md`: layout, backend abstraction, key decisions
- `docs/COMPONENTS.md`: where components live and the conventions below in more detail
- `docs/ICD.md`: Firestore/PocketBase document shapes (update it whenever a `venues`/`events` field changes)
- `CONTRIBUTING.md`: dev setup, branching, PR and testing expectations

## Commands

- `npm run dev`, `npm run type-check`, `npm run lint`
- `npm run test:e2e` (Playwright + Firebase emulators; see `playwright.config.ts`)

## Rules that are easy to get wrong

- Talk to the backend only through `@/lib/services` (`authService`, `dbService` and `storageService`). PocketBase deployments depend on it, so never import the Firebase SDK directly.
- A new JSON field on `events`/`venues` must also be declared for PocketBase (`scripts/setup-pocketbase.js` and the e2e `pb_migrations`), or PocketBase silently drops it.
- Never declare a React component inside another component's body; hoist it to module scope (see `docs/COMPONENTS.md`).
- Share logic between variant components (desktop/mobile, cloud/Lite, normal/condensed) through a `*parts.tsx`/`*shared.tsx` module instead of copying it.
- Dispatch display text goes through the vocabulary `t()` (`useDispatchTerms`), but comparisons and stored values always use the raw English key.
- Client components need `'use client'`.
