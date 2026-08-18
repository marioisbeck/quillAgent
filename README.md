# quillAgent

Main repository for Quill, a personal, sovereign AI system powered by OpenClaw. Quill is the persistent agent identity inside OpenClaw. This repo is the **thin control plane**: approval queue, audit log, connector tokens, and web-push — not a second brain. Human review happens in the sibling **loopkind** swipe app.

**Notion Routing:** Project `quillAgent`, Tag `prometheon`.

## Repo layout

| Path | Purpose |
|------|---------|
| [`backend/`](backend/) | Express + SQLite control plane: approvals, audit, loopkind accounts, web-push. Started by `quill-backend.service` on the gateway. |
| [`shared/`](shared/) | `@quill/shared` TypeScript contracts (`ApprovalRequest`, statuses, payloads). Build this package first. |
| [`quill-agent/`](quill-agent/) | Reference/mock agent that demonstrates the approval loop against the backend. |
| [`specs/`](specs/) | Design notes and contracts. `specs/04-loopkind-app.md` is the original Sentry product thesis; the shipped app is [`loopkind`](../loopkind/README.md). |
| [`prompts/`](prompts/) | Copy-paste Cursor chat workflows (Ask / Plan / Agent). |

## Related projects in this workspace

- [loopkind](../loopkind/README.md): Human-in-the-loop swipe review surface (the original "Sentry" app). Separate repo on purpose.
- [quillServer](../quillServer/README.md): OpenClaw runtime, bridges, and gateway host. (Notion Project: `quillServer`, Tag: `prometheon`)
- [ultimateBrain](../ultimateBrain/README.md): Personal notes, PARA, and Notion ontology. (Notion Project: `ultimateBrain`, Tag: `toolsAndUtilities`)
