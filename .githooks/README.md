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
into the OpenClaw gateway's `~/.openclaw/workspace/memory/runbooks/`
whenever `develop` or `main` is pushed, then triggers a memory reindex.

- Calls `../quillServer/scripts/sync_runbooks_to_openclaw.py --apply`
  via a relative path.
- Only fires on `develop`/`main`; feature branches are a no-op.
- Failure aborts the push (so we never publish unindexed runbooks).
- Bypass with `QUILL_SKIP_RUNBOOK_SYNC=1 git push ...`.

Requires:

- The sibling `quillServer/` repo checked out next to `quillAgent/`
  (standard layout for the Quill workspace).
- SSH access to the gateway (`OPENCLAW_SERVER_IP` in
  `quillServer/.env`).
- `python3` on `PATH`.

The single source of truth for the sync logic lives in `quillServer/`;
this hook just wires `quillAgent` push events into the same script.
