# TODO

Project backlog and **session handoffs**. Agents and humans use this file to queue work and resume later without re-discovery.

This repo is the Quill **control plane** (`backend/`, `shared/`, `quill-agent/`). Gateway skills, Telegram, and host ops live in [`../quillServer/TODO.md`](../quillServer/TODO.md). The swipe review UI lives in [`../loopkind/TODO.md`](../loopkind/TODO.md). Notion/PARA lives in [`../ultimateBrain/TODO.md`](../ultimateBrain/TODO.md). Copy-paste Berman phases: [`../quillServer/BERMAN_ROADMAP.md`](../quillServer/BERMAN_ROADMAP.md).

## For agents

1. **Read** when starting non-trivial work or resuming a deferred task.
2. **Add** items with the template below. Write prompts the next session can run directly.
3. **Triage** into **Now**, **Next**, or **Later**.
4. **Close** when done: move to **Done** or delete. Mirror notable shipped work in `CHANGELOG.md` `[Unreleased]`.
5. **Do not duplicate** `CHANGELOG.md` (history) or sibling-repo TODOs.

## Queues

| Queue | Use when |
|-------|----------|
| **Now** | In progress or pick up in the current session |
| **Next** | Clear scope, ready, not started |
| **Later** | Backlog, research, blocked, nice-to-have |

## Entry template

```markdown
### N. Short title

**Area:** feature | bugfix | infra | docs | refactor | release | other
**Queue:** now | next | later
**Added:** YYYY-MM-DD

**Prompt for next session:** Paths, constraints, success criteria.

---
```

## Now

_None._

## Next

_None._ Pick from Later, or a new item.

## Later

### 1. Berman Phase 1 — n8n-mcp

**Area:** infra
**Queue:** later
**Added:** 2026-08-18 (carried from the old architecture checklist)

**Prompt for next session:** Do **not** invent a custom Notion/Todoist sync from this repo. Start from [`../quillServer/BERMAN_ROADMAP.md`](../quillServer/BERMAN_ROADMAP.md) Prompt 1. `quill-notion` already covers Ultimate Brain from the gateway; n8n is only worth it if Mario wants workflow authoring without Python bridges. Stop after the config plan and wait for confirmation.

---

### 2. Berman Phase 2 — GSD meta-prompting

**Area:** docs
**Queue:** later
**Added:** 2026-08-18

**Prompt for next session:** [`../quillServer/BERMAN_ROADMAP.md`](../quillServer/BERMAN_ROADMAP.md) Prompt 2 (`gsd-build/get-shit-done`). This repo already has `specs/` + `prompts/` as the spec-driven path. Adopt GSD only if it replaces that pair rather than stacking a third framework. Workspace Gitflow + `TODO.md` stay canonical.

---

### 3. Berman Phase 3 — Marker / PaddleOCR ingestion

**Area:** infra
**Queue:** later
**Added:** 2026-08-18

**Prompt for next session:** This is **quillServer** work, not a `backend/` feature. Use BERMAN_ROADMAP Prompt 3. Related live path: `quill-book` already converts DRM-free EPUB → Markdown on the gateway. Do not add OCR to this control-plane repo.

---

### 4. Multi-agent Telegram router ("Advisory Board")

**Area:** feature
**Queue:** later
**Added:** 2026-08-18

**Prompt for next session:** Topic isolation is already live (Telegram supergroup topics + per-topic `systemPrompt` / `agentId`). Remaining work is Berman Phase 1 in [`../quillServer/TODO.md`](../quillServer/TODO.md) §4: explicit sub-agents (`General_Assistant`, `Slack_Reader`, `Research_Agent`) dispatched by `message_thread_id`. Also see the open `lane=main` serialization item on the gateway — parallelism is a host/OpenClaw issue, not a `quillAgent` API change.

---

### 5. Two-tier memory + `mempalace` eval

**Area:** feature
**Queue:** later
**Added:** 2026-08-18

**Prompt for next session:** Daily notes already exist in `quillWorkspace` (`memory/YYYY-MM-DD.md`); runbooks sync from this repo + `quillServer` via `quillServer/scripts/sync_runbooks_to_openclaw.py`. Remaining: nightly `MEMORY.md` synthesizer (quillServer cron) and a **cheap eval** of `mempalace` vs that two-tier design. Define the smallest useful prototype (one Telegram topic → retrieve yesterday's note) before adopting anything. Do not add a second brain inside `backend/`.

---

### 6. Autoresearch agent (stretch)

**Area:** feature
**Queue:** later
**Added:** 2026-08-18

**Prompt for next session:** Karpathy-style deep-dive research agent. Read-only Reddit already exists (`quill-reddit` / `.cursor/skills/reddit-research`). Park until memory + topic routing are settled. Not a control-plane ticket.

---

## Done

### 2026-08-18 — Next items 1–3

- Merged Dependabot [#34](https://github.com/marioisbeck/quillAgent/pull/34) then [#33](https://github.com/marioisbeck/quillAgent/pull/33) into `develop` (retargeted off `main` first). `npm run build -w shared` and `npm run build -w backend` green locally. Rebuild `better-sqlite3` on the gateway at next deploy.
- Aligned workspace `package.json` versions to `0.2.2`. Published GitHub Releases for existing tags [`v0.2.1`](https://github.com/marioisbeck/quillAgent/releases/tag/v0.2.1) and [`v0.2.2`](https://github.com/marioisbeck/quillAgent/releases/tag/v0.2.2) (Latest).
- Renamed `specs/04-sentry-app.md` and `prompts/04-sentry-app.md` to `04-loopkind-app.md`; updated the prompts index and the generate-system / implementation-starter / quality-pass prompts to point at sibling `loopkind`.

### 2026-08-18 — Architecture checklist catch-up

Rewrote this file to the Gitflow Now/Next/Later/Done template. Closed items that had already shipped in other repos or in this control plane, instead of leaving them as open checkboxes. Refreshed `README.md` (loopkind, current layout).

Shipped (verified in-tree or via sibling runbooks; not re-tested live in that session):

- Hetzner + OpenClaw gateway, Nginx/SSL, Telegram bot, base API keys, ClawHub skills — [`../quillServer/TODO.md`](../quillServer/TODO.md) §8.
- Approval control plane in `backend/`: `GET/POST/PUT/PATCH/DELETE /api/approvals`, audit log, SQLite, `x-quill-api-key`, loopkind auth + web-push. OpenClaw tools `POST` here; there is no separate webhook receiver, and none is planned.
- Shared contracts in `@quill/shared` (`ApprovalRequest`, `ApprovalStatus`).
- Review surface is **loopkind** (sibling repo, hosted separately) — not a `sentry/` folder in this tree. README updated to match.
- Gmail + Calendar: `quillServer` mail/calendar bridges + `gog` (`marioisbeck@gmail.com` verified). Not missing from the agent.
- Ultimate Brain: `quill-notion` on the gateway; Notion DBs aligned to the prometheon / ultimateBrain ontology.
- Reference agent loop in `quill-agent/` (`QuillTools.requestApproval` → poll until status leaves `pending`).

Still open elsewhere (do not re-open here): ElevenLabs/Twilio phone import, laptop-executor Tailscale ACL, CrowdSec bake-in, Grocy inventory — all [`../quillServer/TODO.md`](../quillServer/TODO.md).
