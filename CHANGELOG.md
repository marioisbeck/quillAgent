# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

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

[Unreleased]: https://github.com/marioisbeck/quillAgent/compare/v0.0.0...HEAD
[0.0.0]: https://github.com/marioisbeck/quillAgent/releases/tag/v0.0.0
