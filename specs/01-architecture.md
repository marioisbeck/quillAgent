> **Cursor:** Run [`prompts/01-architecture.md`](../prompts/01-architecture.md) in **Plan** mode (copy the **Paste** block from there). Spec body below.

Important architectural rule:
OpenClaw is the brain.
Quill is the persistent agent identity inside OpenClaw.
Do not redesign the system so that the backend becomes a second brain.

The backend is only a thin shared control plane for:
- approvals
- audit
- shared structured state
- connector metadata/tokens
- app notifications
- governance UX support

Reuse OpenClaw native capabilities wherever possible:
- workspace memory
- skills
- tool policies
- sandboxing
- exec approvals

Only build externally what OpenClaw does not already solve well:
- semantic non-exec approvals
- cross-app/mobile approval UX
- shared approval history
- change-request workflow
- unified human governance layer

---

You are a senior AI systems architect, backend engineer, and product-minded technical founder advisor.

Help design a practical sovereign AI system centered around OpenClaw.

### Ecosystem Context
Quill does not exist in a vacuum. It is part of a broader personal workspace:
- **`ultimateBrain`**: The data layer (Notion/Drive) that Quill reads from and writes to. Quill is the active agent for this passive knowledge base.
- **`quillServer`**: The underlying secure runtime, sandboxing, and governance layer that powers Quill.

IMPORTANT ARCHITECTURAL PRINCIPLE:
OpenClaw must remain the brain.
A persistent agent named Quill lives inside OpenClaw.
Do not redesign the system so that an external backend becomes a second brain.

I want to build a system with these goals:

1. One persistent AI agent identity named Quill
- consistent identity
- consistent long-term behavior
- accessible from multiple interfaces

2. AI sovereignty and control
- practical self-hosting
- modular open components
- minimal lock-in
- ability to swap providers and parts later

3. Human-in-the-loop governance
- autonomous by default for non-destructive tasks (e.g., drafting and saving)
- approvals only strictly required for irreversible/destructive actions (e.g., sending emails, paying, deleting files)
- Tinder-style swipe interface for fast triage (approve, reject, request changes)
- auditability
- fast human supervision

4. Safe execution
- sandboxing
- tool policies
- approvals
- least privilege
- controlled access to connected systems

5. Extensibility & Existing Skills
Instead of building generic connectors from scratch, we will leverage existing OpenClaw/ClawHub skills where possible, wrapping them in our approval layer:
- **Google Workspace (Gmail, Calendar, Drive):** Use existing skills (e.g., `gog` or `google-workspace-mcp`).
- **Voice Calling:** Use existing skills (e.g., `outbound-call` with ElevenLabs/Twilio).
- **Slack:** Use existing skills.
- **Web Browsing/Scraping:** Use existing skills (e.g., `agent-browser`).
- **Custom Notion/PARA:** Build a custom skill specifically tailored to my "Ultimate Brain" Notion setup (documented in `@ultimateBrain/docs`) so Quill deeply understands my personal data structure.
- **Filesystem & Shell:** Use native OpenClaw tools.

6. Practicality
- one technically capable founder can build it
- should not take months
- should reuse OpenClaw features and existing ClawHub skills rather than rebuilding them

7. Possible product angle
- a mobile Sentry app for human supervision of AI actions
- potentially a broader business later

Please design the architecture around this conclusion:

- OpenClaw = brain/runtime
- Quill = persistent agent identity inside OpenClaw
- backend = thin shared control plane only
- Sentry app = human supervision interface

The backend should NOT become a second memory or reasoning engine.

Please explicitly cover:

1. What should stay inside OpenClaw
2. What should live outside OpenClaw
3. How memory should be split between local OpenClaw memory, shared backend state, and optional synced memory packs
4. How skills should be split between shared Quill core skills, local environment skills, and backend-provided tool capabilities
5. How to use OpenClaw’s own sandboxing, policies, and exec approvals rather than duplicating them
6. How semantic approvals for non-exec actions should work
7. How custom OpenClaw tools/connectors should be structured
8. What the smallest useful v1 is
9. What the longer-term product/system could become

Return the answer in this order:

1. Core architecture
2. Inside OpenClaw vs outside OpenClaw
3. Memory model
4. Skill model
5. Approval model
6. Sandboxing model
7. Connector strategy
8. Practical v1
9. Long-term roadmap

Be concrete, opinionated, and practical.
Avoid overengineering.
