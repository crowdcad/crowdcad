# Security Policy

CrowdCAD takes the security and privacy of our users and contributors seriously. This document explains how to report vulnerabilities, what to include and how we handle reports.

**Current project status**

- Project version: **1.0.0**.
- Support policy: we provide fixes for the latest tagged release and the default branch.

## How to report a vulnerability

Do not open a public issue for security vulnerabilities. Use one of these channels:

- Email: **support@crowdcad.org**
- GitHub: the repository's **Security Advisories** (recommended for structured tracking).

When reporting, include as much detail as possible to help us reproduce and assess the issue. Avoid sending secrets (API keys, passwords, private certificates).

Suggested report contents:

- **Summary**: Short description of the issue.
- **Component / Area**: e.g., web client, auth, Firestore rules, hosting.
- **Impact**: What could an attacker do if exploited?
- **Severity (self‑assessment)**: Low / Medium / High / Critical.
- **Steps to reproduce**: Minimal steps or a short script to reproduce.
- **Environment**: CrowdCAD version/commit, OS, browser, Firebase config notes (no secrets).
- **Logs / Evidence**: Stack traces, HTTP requests/responses, screenshots (sanitize any sensitive data).
- **Workarounds**: Any temporary mitigations.
- **Contact**: How we can follow up with you (email or GitHub handle).

## Response process & timeline

1. **Acknowledgement** We aim to acknowledge receipt within 3 business days.
2. **Assessment:** Maintainers will validate the report, determine impact and scope affected versions.
3. **Remediation:** For confirmed issues we will develop and test a fix, then release and document the remediation.
4. **Disclosure:** After a fix is available, we will publish a short advisory in the GitHub Security tab describing the impact, affected versions and remediation steps. We may coordinate disclosure timing if downstream users need notice.

Typical target times (may vary with severity and complexity):

- Acknowledgement: within 3 business days.
- Initial assessment: 1–2 weeks (shorter for critical issues).
- Fix and release: varies; critical issues prioritized.

If you are the reporter we will keep you informed of progress and coordinate disclosure where appropriate.

## Scope

This policy covers:

- The CrowdCAD application code and configuration in this repository.
- Default deployment guidance in the project documentation (including recommended Firebase configuration and rules).

Out of scope (generally):

- Third‑party services or infrastructure not managed by the project (e.g., upstream libraries), unless the interaction creates a specific security risk for CrowdCAD deployments.

Reports that show insecure interactions between third‑party components and CrowdCAD are still welcome.

## Non‑vulnerability issues

Use normal GitHub issues for:

- Feature requests
- Usability problems
- Performance concerns without clear security impact
- General questions

## Safe harbor for researchers

We welcome good‑faith security research. When reporting vulnerabilities, please:

- Avoid accessing or modifying data that does not belong to you.
- Do not attempt denial‑of‑service or destructive actions.
- Avoid social engineering or privacy violations.

If you follow this policy in good faith, we will not pursue legal action for the research described in your report.

## Contact & maintainers

- Security reports: **support@crowdcad.org**
- GitHub Security Advisories: use the repository Security tab
- Maintainers:
  - Evan Passalacqua (@evanqua)
  - Ivan Zhang (@iv-zhang)

Thank you for helping us keep CrowdCAD secure.
