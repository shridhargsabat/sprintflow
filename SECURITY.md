# Security Policy

## Supported Versions

| Version          | Supported          |
| ---------------- | ------------------ |
| `main` (latest)  | :white_check_mark: |
| Latest release   | :white_check_mark: |
| Older tags       | :x:                |

Only the latest state of `main` and the most recent GitHub release receive
security fixes. If you are on an older tag, please upgrade and confirm the
issue still reproduces before reporting.

## Reporting a Vulnerability

**Do not open a public issue for security vulnerabilities.** Use one of these
private channels:

1. **Preferred:** [Open a private security
   advisory](https://github.com/shridhargsabat/sprintflow/security/advisories/new)
2. **Fallback:** Email shridhargsabat@gmail.com with subject
   `[sprintflow security] <brief description>`

Please include:

- Affected component and version/commit (e.g. `backend/app.py @ a1b2c3d`)
- Steps to reproduce (curl commands or a minimal script beat prose)
- Impact: what an attacker gains (read/modify/delete whose data, which
  privilege boundary crossed)
- Suggested fix, if you have one (optional)

### What to expect

- **Acknowledgement** within 7 days
- **Status updates** at least every 7 days until resolved
- **Coordinated disclosure** — details stay private until a fix is released,
  then the advisory is published; you get credit in the release notes unless
  you prefer to stay anonymous

## Scope

In scope:

- `backend/` (FastAPI endpoints, JWT auth, password hashing, SQLite queries)
- `frontend/` (React SPA, auth flows, XSS/sensitive-data exposure)
- `docker-compose.yml`, `backend/Dockerfile`, `frontend/Dockerfile`,
  `frontend/nginx.conf` (supply chain, secrets handling)

Out of scope (will be closed as informative, still appreciated):

- The seeded sample data and `POST /api/reset` wiping local data — destructive
  by design for a demo dataset
- `localhost`/dev-stack instructions using throwaway passwords
- Dependency scanner findings without a reachable exploit path through
  SprintFlow itself

Thank you for reporting responsibly.
