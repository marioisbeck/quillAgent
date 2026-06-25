# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.1] - 2026-06-26

### Removed

- Retired the **myvoice** scrapbook project and every reference to it.
  Deleted the dedicated integration spec and prompt
  (`specs/08-myvoice-integration.md`, `prompts/08-myvoice-integration.md`)
  and stripped myvoice from the README related-projects list, the
  `specs/01-architecture.md` ecosystem context, the `00-generate-system`
  step sequence, the prompts index, and the `TODO.md` integrations
  section. The `myvoice` repo is removed locally; its GitHub remote is
  kept as a recoverable backup. Companion reference removals landed in
  `quillServer` and `ultimateBrain`.

## [0.2.0] - 2026-05-29

### Changed

- Upgraded TypeScript `5.9.3 → 6.0.3` across the `backend`, `quill-agent`,
  and `shared` workspaces (dependabot). Also took `actions/checkout@v6`
  and the npm minor-patch group (6 updates).

### Fixed

- `quill-agent/src/tools.ts` — `waitForApproval` read `approval.status`
  on a value typed `ApprovalRequest | null`, which TypeScript 6's
  stricter narrowing correctly flagged. Typed the `axios.get` response
  and guarded the status read so a null/transient poll response keeps
  the loop in `pending` instead of risking a runtime crash. All three
  workspaces pass `tsc --noEmit`.

## [0.1.0] - 2026-05-29

First versioned release. quillAgent is now a Quill-side backend that
serves the approval queue, persists audit logs, gates the loopkind
review surface, and fans new cards out as web-push notifications to
installed devices.

### Added

- `DELETE /api/approvals` collection endpoint that wipes every
  non-pending approval row and its audit-log entries in a single
  transaction. Pending cards are protected (the same guard as the
  per-id endpoint) so an accidental call cannot drop work the
  reviewer hasn't seen yet. Returns `{ success, removed }`.
- `backend/scripts/seed-loopkind-demo-cards.py` — top up the loopkind
  queue with a small catalog of safe demo cards (calendar, mail,
  laptop) so the reviewer has fresh content to test gestures, push
  notifications, and card layout. Supports `--connector`, `--max`,
  and `--dry-run`. Documented in `backend/README.md`.
- `DELETE /api/approvals/:id` endpoint that hard-deletes an approval
  and its audit-log entries in a single transaction. Pending approvals
  are protected (`409 Conflict`) so the endpoint cannot be used to
  drop un-reviewed work without first approving or rejecting it.
- `backend/scripts/reset-loopkind-accounts.py` — SSH-gated dry-run-by-default
  script that wipes `loopkind_users` and `loopkind_push_subscriptions` so a
  stuck signup can be handed back to the next visitor without touching
  approval data.
- `backend/README.md` documenting the backend service and its operator
  scripts.
- Loopkind account bootstrap, credential verification, and push-subscription
  APIs in the backend so the review surface can stay private and notify signed-
  in devices when new approval cards arrive.
- Initial `CHANGELOG.md` following Keep a Changelog 1.1.0 and SemVer 2.0.0,
  per the workspace Gitflow skill at
  [`../.cursor/skills/gitflow-commits/SKILL.md`](../.cursor/skills/gitflow-commits/SKILL.md).
- `.githooks/pre-push` — repo-tracked git hook that mirrors the
  consolidated runbook tree (this repo's `specs/` plus sibling
  `quillServer/` content) into the OpenClaw gateway memory whenever
  `develop`/`main` is pushed. Calls
  `../quillServer/scripts/sync_runbooks_to_openclaw.py --apply`. Aborts
  the push on failure; bypass with `QUILL_SKIP_RUNBOOK_SYNC=1`.
- `scripts/setup-githooks.sh` — idempotent activator
  (`git config core.hooksPath .githooks`).

### Changed

- New approvals now fan out web-push notifications to registered loopkind
  devices whenever VAPID keys are configured.

[Unreleased]: https://github.com/marioisbeck/quillAgent/compare/v0.2.1...HEAD
[0.2.1]: https://github.com/marioisbeck/quillAgent/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/marioisbeck/quillAgent/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/marioisbeck/quillAgent/compare/v0.0.0...v0.1.0
[0.0.0]: https://github.com/marioisbeck/quillAgent/releases/tag/v0.0.0
