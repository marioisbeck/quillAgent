# Quill backend

Express + SQLite service that persists approval cards, audit history, and
loopkind account state. Started by `quill-backend.service` on the production
host and consumed by the loopkind review surface plus the calendar/mail
executors.

## Scripts

| Path | Purpose |
|------|---------|
| [`scripts/reset-loopkind-accounts.py`](scripts/reset-loopkind-accounts.py) | Wipe all `loopkind_users` and `loopkind_push_subscriptions` rows. Use when a signup is stuck or you want to hand the bootstrap signup back to the next visitor. Defaults to dry-run; pass `--yes` to actually delete. |
| [`scripts/seed-loopkind-demo-cards.py`](scripts/seed-loopkind-demo-cards.py) | Push a small batch of demo approval cards into the queue so the loopkind reviewer has fresh content to test gestures, push notifications, and card layout. Cards live in the `loopkind.demo.*` action namespace and are no-op (approving them just marks them failed; nothing is sent). |

All scripts are intentionally SSH-gated — there is no remote admin endpoint
for destructive operations.

### Seeding demo cards

```bash
# From your laptop, against a local backend
QUILL_API_KEY="..." \
  python3 scripts/seed-loopkind-demo-cards.py

# Just a few mail cards
QUILL_API_KEY="..." \
  python3 scripts/seed-loopkind-demo-cards.py --connector mail --max 1

# Inspect the catalog without contacting the backend
python3 scripts/seed-loopkind-demo-cards.py --dry-run

# From the production host, where the backend listens on loopback
ssh root@<host> 'export QUILL_API_KEY="..."; \
  python3 /opt/quill/quillAgent/backend/scripts/seed-loopkind-demo-cards.py'
```

Each run sends fresh copies (the server assigns new ids), so re-running
just tops up the queue.

## Database

Default location: `quillAgent/backend/quill.db`. On the production host this
maps to `/opt/quill/quillAgent/backend/quill.db`. Migrations are inline in
`src/index.ts` (`CREATE TABLE IF NOT EXISTS …`), so the file appears on first
boot.
