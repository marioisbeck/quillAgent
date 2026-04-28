# Quill backend

Express + SQLite service that persists approval cards, audit history, and
loopkind account state. Started by `quill-backend.service` on the production
host and consumed by the loopkind review surface plus the calendar/mail
executors.

## Scripts

| Path | Purpose |
|------|---------|
| [`scripts/reset-loopkind-accounts.py`](scripts/reset-loopkind-accounts.py) | Wipe all `loopkind_users` and `loopkind_push_subscriptions` rows. Use when a signup is stuck or you want to hand the bootstrap signup back to the next visitor. Defaults to dry-run; pass `--yes` to actually delete. |

All scripts are intentionally SSH-gated — there is no remote admin endpoint
for destructive operations.

## Database

Default location: `quillAgent/backend/quill.db`. On the production host this
maps to `/opt/quill/quillAgent/backend/quill.db`. Migrations are inline in
`src/index.ts` (`CREATE TABLE IF NOT EXISTS …`), so the file appears on first
boot.
