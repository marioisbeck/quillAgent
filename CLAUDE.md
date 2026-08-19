# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

`quillAgent` is the Quill-side control plane for **Quill**, a sovereign personal AI agent that runs *inside* OpenClaw. It is an npm-workspaces monorepo with three packages: a thin Express/SQLite **backend** (the control plane), a **quill-agent** reference/mock that demonstrates the agent→approval→human loop, and a **shared** package of TypeScript contracts both consume.

**Core architectural principle (from `specs/01-architecture.md`):** OpenClaw is the brain; Quill is the persistent agent identity inside OpenClaw. This backend is *only* a thin shared control plane — approvals, audit, shared structured state, connector tokens, and push notifications. Do **not** grow it into a second brain (reasoning, memory, agent orchestration). Reasoning, workspace memory, skills, sandboxing, and exec-approvals all stay in OpenClaw.

The human-in-the-loop model: non-destructive actions (reads, draft writes) run autonomously; irreversible/destructive actions (send email, make call, delete file) create an `ApprovalRequest` that a human triages via a swipe UI (the "Sentry" / "loopkind" review surface, which lives **outside this repo**) before the agent proceeds.

## Workspace layout & dependency order

| Package | Role |
|---------|------|
| `shared/` (`@quill/shared`) | All cross-package TypeScript types/contracts. Compiles to **CommonJS** in `dist/`. |
| `backend/` | Express 5 + `better-sqlite3` control-plane API. Single-file app in `src/index.ts`. ESM (`NodeNext`). |
| `quill-agent/` | Reference agent (`QuillTools`) showing the approval loop against the backend. ESM. |

`backend` and `quill-agent` depend on `@quill/shared` via its built `dist/` (`main`/`types` point there). **`shared` must be built before the other two can typecheck or run.**

## Commands

```bash
# One-time: install all workspaces
npm install

# Build shared FIRST, then the consumers (shared's dist/ must exist for the
# others to resolve @quill/shared). See the build caveat below.
npm run build -w shared
npm run build -w backend       # tsc
npm run build -w quill-agent   # tsc

# Dev (watch) — run shared's watcher alongside a consumer
npm run dev -w shared          # tsc -w  (keeps dist/ fresh)
npm run dev -w backend         # tsx watch src/index.ts  (needs QUILL_API_KEY)
npm run dev -w quill-agent     # ts-node src/index.ts  (runs the mock loop once)

# All workspaces' dev scripts at once (rarely what you want — interleaves output)
npm run dev

# Typecheck (CI-style gate; all three pass). Run from inside each workspace so
# the workspace-local TypeScript 6.0.3 is used, NOT root npx tsc (see below).
(cd shared && npx tsc --noEmit) && (cd backend && npx tsc --noEmit) && (cd quill-agent && npx tsc --noEmit)

# Run the built backend
npm start -w backend           # node dist/index.js
```

There is **no test runner, no linter, and no root `build` script** configured. `npm test -w backend` deliberately fails (placeholder). Formatting/secret hygiene is enforced by pre-commit/CI, not by an in-repo lint command. Don't invent a `lint`/`test` command — if you need one, ask first.

**TypeScript version split (important):** each workspace's local TypeScript is **6.0.3**, but root `npx tsc` resolves to a hoisted **5.9.3**. Always typecheck/build *inside* the workspace (or via `npm run … -w <pkg>`) so you exercise the 6.0.3 narrowing the code is written against, not root's 5.9.3.

**`shared` builds cleanly.** This section previously described a `TS5011` failure from `declaration: true` + `outDir` without `rootDir`. That was fixed on `hotfix--shared-rootdir`; `shared/tsconfig.json` sets `"rootDir": "./src"` and a fresh emit succeeds (verified 2026-08-19). The warning outlived the bug.

## Backend specifics

- **`src/index.ts` is the whole service**: middleware, inline SQLite schema (`CREATE TABLE IF NOT EXISTS …`), legacy-table migrations, and every route. The DB file `backend/quill.db` is created on first boot; on prod it lives at `/opt/quill/quillAgent/backend/quill.db`.
- **Auth is mandatory.** The process `exit(1)`s at startup if `QUILL_API_KEY` is unset. All `/api/*` routes require the `x-quill-api-key` header (timing-safe compared). Only `/health` is unauthenticated.
- **Env loading:** dotenv reads the workspace-root `.env` first (resolved relative to the compiled file), then the CWD `.env` as override. The shared `QUILL_API_KEY` lives in the root `.env`.
- **Key env vars:** `QUILL_API_KEY` (required), `PORT` (3001), `QUILL_ALLOWED_ORIGINS` (CSV; browsers only — server-to-server callers send no Origin and pass on the API key), `LOOPKIND_ALLOW_SIGNUPS` (`1` to keep signups open beyond the first user), `QUILL_RATE_LIMIT_API_PER_MIN`/`QUILL_RATE_LIMIT_AUTH_PER_15M`/`QUILL_RATE_LIMIT_DISABLED`, and `LOOPKIND_VAPID_{PUBLIC_KEY,PRIVATE_KEY,SUBJECT}` (web-push; push is silently disabled if unset).
- **Domain model** (`shared/src/index.ts`): `ApprovalRequest` wraps an `ActionPayload { connector, summary, details, preview }`. Approval status flows `pending → approved | rejected | changes_requested | continuous_improvement`; execution status (`pending|running|completed|failed`) is tracked separately in `payload.details` via `PATCH /api/approvals/:id/execution`. Every status/execution change writes an `audit_log` row.
- **Delete guards:** `DELETE /api/approvals/:id` and the bulk `DELETE /api/approvals` refuse to remove `pending` cards (409) — they only tidy already-reviewed history. Preserve this; it's a deliberate safety invariant, not an oversight.
- Passwords (`src/passwords.ts`) use scrypt with a self-describing `scrypt$N$r$p$salt$hash` encoding; loopkind auth verifies timing-safely.

### HTTP API surface

`/health` is the only unauthenticated route. Everything under `/api` requires the `x-quill-api-key` header and is covered by the per-IP rate limiter; `/api/loopkind/auth/*` additionally gets a tight per-(IP, email) auth limiter.

| Method & path | Purpose |
|---|---|
| `GET /health` | Liveness probe (unauthenticated). |
| `GET /api/approvals` | List approvals; filter via `status` (CSV), `connector`, `action`, `executionStatus`, `limit`. |
| `GET /api/approvals/:id` | Fetch one approval. |
| `POST /api/approvals` | Create an approval (`{ action, payload }`); fans out web-push to loopkind devices. |
| `PUT /api/approvals/:id` | Reviewer decision: `{ status, feedback?, manualEdit? }` → audit row. |
| `PATCH /api/approvals/:id/execution` | Executor reports back `{ executionStatus, executedAt?, executionResult?, executionError? }`. |
| `DELETE /api/approvals/:id` | Delete one reviewed approval (409 on `pending`). |
| `DELETE /api/approvals` | Bulk-wipe all non-`pending` approvals + their audit rows. |
| `GET /api/approvals/:id/audit` | Audit-log history for an approval. |
| `GET /api/tokens/:service` | Connector access token by service name. |
| `GET /api/state/:key` · `POST /api/state` | Shared structured key/value state. |
| `GET /api/loopkind/auth/bootstrap` · `POST .../signup` · `POST .../login` | loopkind reviewer accounts (first signup always allowed; later signups gated by `LOOPKIND_ALLOW_SIGNUPS`). |
| `GET /api/loopkind/push/public-key` · `POST/DELETE .../push/subscriptions` | VAPID key + web-push subscription registration. |

## quill-agent specifics

`QuillTools` (`src/tools.ts`) is the reference pattern: read/draft methods return immediately; destructive methods (`sendEmail`, `deleteFile`) `POST /api/approvals` then poll `GET /api/approvals/:id` every 3s until the status leaves `pending`. `src/index.ts` is a scripted `simulateQuill()` walkthrough of that loop, not a long-running service.

## Code conventions & gotchas

- **`.ts` is the source of truth.** Compiled `*.js`/`*.d.ts`/`*.map` files sometimes appear inside `src/` trees but are gitignored — never edit or commit them; edit the `.ts`.
- **TypeScript 6, `strict: true` everywhere.** TS6's stricter null-narrowing is real here (see the `waitForApproval` fix in `CHANGELOG.md`); guard nullable values rather than asserting.
- **`.githooks/pre-push`** (activated via `scripts/setup-githooks.sh`) syncs `specs/` runbooks into OpenClaw memory through the sibling `../quillServer` repo when pushing `develop`/`main`. It aborts the push on failure and requires `../quillServer` checked out beside this repo; bypass with `QUILL_SKIP_RUNBOOK_SYNC=1 git push`.

## Git workflow, CI & security

The whole workspace follows one Gitflow + Conventional Commits convention. **Source of truth:** `../.cursor/skills/gitflow-commits/SKILL.md` (shared across `quillServer`, `quillAgent`, `loopkind`) — read it before committing or cutting a release. Key points:

- **Branches:** `main` = production (release/hotfix merges only, tagged); `develop` = integration (default working branch, CI on every push); `feature--<slug>` off `develop`; `release--vX.Y.Z` and `hotfix--<slug>` merge into `main` **and back into** `develop`. Separator is a double dash (`--`).
- **Never commit directly to `main`.** If you have work on `main`, branch `feature--<slug>` off `develop` first.
- **Conventional Commits:** `<type>(<scope>): <summary ≤72, imperative, no period>` with a real body explaining the *why*. Types: `feat|fix|docs|refactor|perf|test|build|ci|chore|revert`.
- **Commit hygiene:** one logical change per commit; run `gitleaks protect --staged --no-banner --redact` before every commit and abort on any finding; never stage `.env`/`*.pem`/`*.key`/`client_secret_*.json`/`credentials*.json`.
- **Git email privacy** (`.cursor/rules/git-email-privacy.mdc`): commits use `22878918+marioisbeck@users.noreply.github.com`. On a `GH007` push rejection, amend the author to that noreply address.
- **Changelog in the same PR as the change.** Keep a Changelog 1.1.0 + SemVer 2.0.0; user-visible (not commit-shaped) entries go under `## [Unreleased]` in `CHANGELOG.md`, grouped under Added/Changed/Deprecated/Removed/Fixed/Security. Cutting a release renames `Unreleased` to `## [X.Y.Z] - YYYY-MM-DD` and reopens a fresh `Unreleased`.
- **Layered security scanning:** `.pre-commit-config.yaml` runs gitleaks + hygiene hooks locally (`pre-commit install`); `.github/workflows/security.yml` runs gitleaks/osv-scanner/semgrep in CI (osv-scanner fails only on High/Critical). Pre-existing semgrep false positives are suppressed inline with `// nosemgrep:` markers on the line directly above the trigger — keep them.

## Workspace topology & where the design lives

This repo is one of several siblings checked out side by side; some tooling assumes that layout:

- `../quillServer` — OpenClaw runtime, sandboxing, secure host config, and the runbook-sync + security scripts the `pre-push` hook calls.
- `loopkind` — the human review surface (the "Sentry" app from the specs/README): the swipe UI that consumes this backend's approval API and receives its web-push notifications. Lives outside this repo.
- `ultimateBrain` (Notion/Drive knowledge base) — data/integration target.

Design docs: `specs/` holds the numbered architecture/contract notes (start with `01-architecture.md`, `02-backend-and-contracts.md`, `03-openclaw-tools.md`); `prompts/` pairs copy-paste Cursor prompts (Ask/Plan/Agent) to each spec. `TODO.md` tracks cross-system implementation status. `backend/README.md` documents the SSH-gated operator scripts (`reset-loopkind-accounts.py`, `seed-loopkind-demo-cards.py`).
