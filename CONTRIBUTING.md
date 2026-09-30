# Contributing to CrowdCAD

Thank you for helping improve CrowdCAD. Contributions of all kinds are welcome.

Please read this together with `CODE_OF_CONDUCT.md`, `LICENSE.md` and `SECURITY.md` before contributing.

## Ways to contribute

- Report bugs or unexpected behavior.
- Propose or implement features.
- Improve documentation, examples and tutorials.
- Fix bugs and add or extend tests.
- Improve accessibility, UX and performance.

## Local development

1. Fork the repository on GitHub, clone your fork and add the original repository as `upstream`:

   ```bash
   git clone https://github.com/YOUR_USERNAME/crowdcad.git
   cd crowdcad
   git remote add upstream https://github.com/evanqua/crowdcad.git
   ```

2. Configure a backend by following [`docs/SETUP_FIREBASE.md`](docs/SETUP_FIREBASE.md) or [`docs/SETUP_POCKETBASE.md`](docs/SETUP_POCKETBASE.md).

3. Install dependencies and start the dev server:

   ```bash
   npm install
   npm run dev
   ```

4. Before starting new work, sync with upstream:

   ```bash
   git fetch upstream
   git checkout main
   git merge upstream/main
   ```

## Branches and commits

- Name feature branches with one of these prefixes: `feature/`, `fix/`, `chore/`, `docs/` or `test/`. Example: `git checkout -b feature/add-venue-search`.
- Keep pull requests focused and small where possible.
- Write commit messages with a short imperative subject, a blank line and an optional body:

  ```
  feat(events): add venue search by radius

  Adds a simple radius-based venue search used by event organizers.
  ```

## Issues

- Search existing issues before opening a new one.
- Bug reports should include steps to reproduce, expected and actual behavior, environment details (CrowdCAD version or commit, OS and browser) and relevant logs or screenshots with secrets removed.
- Feature requests should describe the problem, the proposed solution and any UX considerations.
- Report security issues privately as described in `SECURITY.md`. Do not open a public issue for them.

## Pull requests

Include:

- A short title and a summary of the change
- Why the change is needed
- Related issues (for example `Fixes #123`)
- A checklist:

  ```
  - [ ] I have tested these changes locally
  - [ ] I added or updated tests where applicable
  - [ ] I updated documentation where applicable
  - [ ] This change follows the repository's coding style
  ```

Small PRs are easier to review. Open exploratory work as a draft PR and ask for feedback.

**If a PR changes the shape of a `venues` or `events` field** (adds, removes or renames a field, or changes what a JSON sub-shape such as `Post`, `Layer`, `Call` or `Clinic` carries), update `docs/ICD.md` to match: the field's row in the collection table and its sub-shape entry in §3.7. The ICD is where contributors and external integrations (such as a TAK bridge) look up the data model, so a stale ICD misleads the next reader. Also add the field to `scripts/setup-pocketbase.js`, since PocketBase silently drops fields its schema does not declare.

## Testing and quality

Run these before opening a PR:

```bash
npm run lint
npm run type-check
npm run test:e2e            # Firebase E2E (Playwright BDD)
npm run test:e2e:pocketbase # PocketBase E2E
```

- Add or update `.feature` files and step definitions under `tests/e2e/` for new features.
- Follow the conventions in `docs/COMPONENTS.md` ("Tips"): no components declared inside other components, shared `*parts.tsx` modules for variants and pure helpers in `src/lib/`.

## Documentation

- Documentation lives in the top-level `README.md` and in `docs/`. Link to [crowdcad.org/features](https://crowdcad.org/features) for screenshots and demos.
- The docs in this repository are written for readers with development experience. Beginner walkthroughs live on [crowdcad.org/docs](https://crowdcad.org/docs). When setup steps, environment variables or scripts change, update both.

### Docs style

- Write short, direct sentences and state facts plainly.
- Do not use em dashes. Use a period, colon, comma or parentheses.
- Do not use the Oxford comma: write "a, b and c".
- Avoid "X, not Y" contrasts. Say what is true.
- Put commands in fenced code blocks with a language tag, and use `YOUR_PROJECT_ID` style placeholders.

## Code of conduct and license

By contributing you agree that your contributions are licensed under the project license, the GNU Affero General Public License v3.0 (see `LICENSE.md`). If you cannot license your contribution under AGPL-3.0, discuss it with the maintainers before submitting.

Please follow `CODE_OF_CONDUCT.md` when interacting with the project, maintainers and community.

## Maintainers

- Evan Passalacqua (@evanqua)
- Ivan Zhang (@iv-zhang)

For help with a contribution, open an issue labeled `question` or contact the maintainers. For security reports, follow `SECURITY.md`.

Thank you for your time and help.
