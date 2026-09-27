# Contributing to CrowdCAD

Thank you for helping improve CrowdCAD. We welcome contributions of all kinds.

Please read this document together with `CODE_OF_CONDUCT.md`, `LICENSE.md`, and `SECURITY.md` before contributing.

## Table of contents

- Ways to contribute
- Getting started (local dev)
- Branching & commit guidelines
- Issues and pull request templates
- Testing & quality
- Documentation contributions
- Code of conduct and license
- Maintainers & contact

## Ways to contribute

- Report bugs or unexpected behaviour.
- Propose or implement features.
- Improve documentation, examples, and tutorials.
- Fix bugs and add or extend tests.
- Improve accessibility, UX, and performance.

## Getting started (local development)

1. Fork the repository on GitHub and clone your fork locally:

```bash
git clone https://github.com/<your-github-username>/crowdcad.git
cd crowdcad
```

2. Install dependencies and run the development server:

```bash
npm install
npm run dev
```

The app runs using Next.js (App Router). See the top-level `README.md` for more details about Firebase configuration.

## Branching & commit guidelines

- Create a feature branch named with one of these prefixes: `feature/`, `fix/`, `chore/`, `docs/`, `test/`.
- Example: `git checkout -b feature/add-venue-search`.
- Keep pull requests focused and small when possible.
- Write clear commit messages: a short subject in imperative mood, blank line, and an optional longer body. Example:

```
feat(events): add venue search by radius

Adds a simple radius-based venue search used by event organizers.
```

## Issues

- Search existing issues before opening a new one to avoid duplicates.
- For bug reports include: steps to reproduce, expected vs actual behavior, environment details (CrowdCAD version/commit, OS, browser), and relevant logs or screenshots (avoid secrets).
- For feature requests describe the problem, proposed solution, and any UX considerations.
- If you discover a security issue, do NOT open a public issue — see `SECURITY.md` for reporting instructions.

## Pull requests

When opening a PR, include:

- A short title and descriptive summary of the change.
- The motivation: why this change is needed.
- Any related issue references (e.g., `Fixes #123`).
- A checklist in the PR description (example):

```
- [ ] I have tested these changes locally
- [ ] I added/updated tests where applicable
- [ ] I updated documentation where applicable
- [ ] This change follows the repository's coding style
```

Small PRs are easier to review. If work is exploratory, prefer opening a draft PR and request feedback.

**If this PR changes the shape of a `venues` or `events` field** (adds/removes/renames a field, or changes what a JSON sub-shape like `Post`, `Layer`, `Call`, `Clinic`, etc. carries), update `docs/ICD.md` to match, including the field's row in the collection's table and its sub-shape entry in §3.7. The ICD is the one place both the app's own contributors and any external integration (e.g. a TAK bridge) go to find the actual data model — a stale ICD after a schema change is a silent trap for the next person who reads it.

## Testing & quality

- Run linters, type-checking, and the E2E suite before opening a PR:

```bash
npm run lint
npm run type-check
npm run test:e2e            # Firebase-backed E2E (Playwright BDD)
npm run test:e2e:pocketbase # PocketBase-backed E2E
```

- Add or update `.feature`/step-definition coverage under `tests/e2e/` for new features when possible.
- Follow the code-structure conventions in `docs/COMPONENTS.md` ("Tips"): no components declared inside other components, shared `*parts.tsx` modules instead of copy-pasted variants, and pure helpers in `src/lib/`.

## Documentation contributions

- Improve or expand the top-level `README.md` or documentation in `docs/`.
- Prefer linking to public feature pages (for screenshots and demos): https://crowdcad.org/features
- Keep documentation clear, concise, and accessible.

## Code of conduct and license

By contributing you agree that your contributions will be licensed under the project license (GNU Affero General Public License v3.0 — see `LICENSE.md`). If you cannot license your contribution under AGPL‑3.0, please discuss it with the maintainers before submitting.

Please follow `CODE_OF_CONDUCT.md` when interacting with the project, maintainers, and community.

## Maintainers & contact

- Evan Passalacqua — @evanqua
- Ivan Zhang — @iv-zhang

If you need help or have questions about contributions, open an issue labeled `question` or contact the maintainers directly. For security reports, follow `SECURITY.md`.

Thank you — we appreciate your time and help!