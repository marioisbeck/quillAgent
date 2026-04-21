> **Cursor:** Run [`prompts/03-quillServer-tools.md`](../prompts/03-quillServer-tools.md) in **Plan** mode. Spec body below.

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

Now design the OpenClaw integration layer.

IMPORTANT:
OpenClaw remains central.
I want to use OpenClaw’s native features as much as possible:
- sandboxing
- tool policies
- exec approvals
- skills
- plugins/custom tools

I want a strategy for integrating OpenClaw tools/connectors. To save time and avoid reinventing the wheel, we will use existing ClawHub skills for generic tasks, but we need a strategy to wrap them in our custom approval flow.

**Target Integrations:**
- **Google Workspace (Gmail, Calendar, Drive):** Use existing skills like `gog` or `google-workspace-mcp`.
- **Voice Calling:** Use existing skills like `outbound-call` (ElevenLabs + Twilio).
- **Slack:** Use existing `slack` skills.
- **Web Scraping/Browsing:** Use existing skills like `agent-browser`.
- **Notion / PARA (Custom):** I use the "Ultimate Brain" template in Notion. Generic Notion skills won't work well. We need to design a *custom* skill that deeply understands my specific PARA structure (referencing `@ultimateBrain/docs`).
- **Filesystem & Shell:** Native OpenClaw tools.

Please design:

1. Which actions should rely on OpenClaw native exec approvals
2. How to wrap/intercept existing ClawHub skills (like `gog` or `outbound-call`) so that destructive actions (sending emails, making calls) trigger a request to our custom backend/mobile app instead of just running autonomously.
3. How to design the custom Notion/PARA "Ultimate Brain" skill so Quill understands the specific data structure.
4. How approval classes should map to connector behavior (autonomous by default):
   - safe reads (autonomous)
   - draft writes (autonomous, e.g., create email draft)
   - commit/destructive writes (requires mobile app approval, e.g., send email, make call)
5. Which tools should return approval-required responses
6. How request-changes feedback (swipe up / swipe down) from the mobile app should flow back into OpenClaw for iterative refinement
7. How Quill should use backend shared-state tools without making the backend a second brain
8. How to structure tool names and contracts cleanly
9. What the first 5-8 tools/skills should be for v1

Please return:
1. tool architecture (including the wrapper/interceptor pattern for existing skills)
2. connector design principles
3. per-connector strategy (Google, Voice, Slack, Web, Custom Notion)
4. custom Notion "Ultimate Brain" skill design
5. approval mapping
6. recommended v1 tool list
7. sample tool request/response contracts
