# Repo-local git hooks

These hooks live in the repo so they're versioned and reviewable, instead
of hiding in `.git/hooks/` where each clone diverges silently.

## Activation

Run once per clone:

```bash
git config core.hooksPath .githooks
```

Or run the helper:

```bash
bash scripts/setup-githooks.sh
```

Verify:

```bash
git config --get core.hooksPath
# .githooks
```

## Hooks

### `pre-push`

Mirrors procedural markdown (the `specs/` tree in this repo, plus
`setup/`, `SECURITY_AUDIT/`, etc. in the sibling `quillServer/` repo)
to the gateway runtime that is actually running, whenever `develop` or
`main` is pushed. The destination follows the `active-gateway` marker:
`~/.openclaw/workspace/memory/runbooks/` under OpenClaw (reindexed after
the copy), `~/.hermes/workspace/runbooks/` under Hermes, which has no
folder index — there the mirror is readable, not searchable.

- Calls `../quillServer/scripts/sync_runbooks_to_gateway.py --apply`
  via a relative path.
- Only fires on `develop`/`main`; feature branches are a no-op.
- Skips cleanly when it cannot know what to do — no sibling checkout, no
  readable marker, an unknown or uninstalled runtime. Only a sync that ran
  and *failed* aborts the push. A hook that cries wolf gets bypassed by
  reflex, and a bypassed hook protects nothing.
- Bypass with `QUILL_SKIP_RUNBOOK_SYNC=1 git push ...`.

Requires:

- The sibling `quillServer/` repo checked out next to `quillAgent/`
  (standard layout for the Quill workspace).
- SSH access to the gateway (`OPENCLAW_SERVER_IP` in
  `quillServer/.env`; the variable kept its name across the Hermes switch).
- `python3` on `PATH`.

The single source of truth for the sync logic lives in `quillServer/`;
this hook just wires `quillAgent` push events into the same script.
