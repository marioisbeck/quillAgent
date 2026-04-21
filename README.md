# quillAgent

Main repository for Quill, a personal, sovereign AI system powered by OpenClaw. Quill provides a persistent agent identity across interfaces (web, mobile, Telegram) with strong human-in-the-loop governance. It features a thin control plane for secure tool orchestration, sandboxed execution, and fast human approvals via the **Sentry** app.

**Notion Routing:** Project `quillAgent`, Tag `prometheon`.

## Repo layout

| Path | Purpose |
|------|---------|
| [`specs/`](specs/) | Design notes and contracts (architecture, backend, OpenClaw tools, etc.). |
| [`prompts/`](prompts/) | Copy-paste Cursor chat workflows (Ask / Plan / Agent). |
| [`sentry/`](sentry/) | The Sentry governance app (human-in-the-loop approval queue). |
| [`quill-agent/`](quill-agent/) | The mock/reference agent implementation. |
| [`backend/`](backend/) | The shared state and database layer. |

## Related Projects in this Workspace

- [ultimateBrain](../ultimateBrain/README.md): Personal notes, outlines, and small tools for capturing how life and work fit together. (Notion Project: `ultimateBrain`, Tag: `toolsAndUtilities`)
- [quillServer](../quillServer/README.md): OpenClaw installation and configuration on Hetzner Cloud. (Notion Project: `quillServer`, Tag: `prometheon`)
- [myvoice](../myvoice/README.md): A digital scrapbook with AI-generated voiceover and auto-scroll. (Notion Project: `myvoice`, Tag: `felien`)
