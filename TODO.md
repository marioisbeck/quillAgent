# Quill System - Comprehensive TODO

This document tracks the implementation status of the entire Prometheon Core (Quill) architecture, spanning the core agent, backend, infrastructure, and integrations.

## 1. Infrastructure & Core Environment (`quillServer`)
- [x] Provision Hetzner server
- [x] Install OpenClaw runtime
- [x] Configure Nginx / SSL / nip.io routing
- [x] Set up base API keys (Anthropic, OpenAI, Gemini)
- [x] Install base ClawHub skills (`agent-browser`, `outbound-call`, `slack`, `clawdbot-filesystem`, `hetzner-cloud`, `ssh-essentials`)
- [x] **Verify:** Is the OpenClaw daemon running reliably and accessible via the gateway?
- [x] **Verify:** Are the Telegram bot webhooks correctly pointing to the `quillServer` gateway?

## 2. The Sentry Governance App (`sentry`)
- [x] Scaffold Next.js/React frontend
- [x] Implement UI for approval queue (swipe left/right)
- [x] Define shared TypeScript contracts (`@quill/shared`)
- [ ] **Verify:** Does Sentry successfully connect to the `quill` backend?
- [ ] **Verify:** Can Sentry receive a mock `ApprovalRequest` and send back an `ApprovalStatus`?
- [ ] **Deploy:** Host Sentry on Vercel/Netlify and link it to the backend.

## 3. The Quill Backend & Control Plane (`quill/backend`)
- [x] Scaffold Node.js/Express backend
- [x] Implement SQLite database for shared state and audit logs
- [ ] **Implement:** API endpoints for Sentry to fetch pending approvals.
- [ ] **Implement:** Webhook receivers for OpenClaw tools to request approvals.
- [ ] **Verify:** End-to-end flow: OpenClaw Tool -> Backend -> Sentry UI -> Backend -> OpenClaw Tool.

## 4. The Quill Agent (`quill/quillAgent/quill-agent`)
- [x] Scaffold basic agent structure
- [x] Define system prompts (e.g., ElevenLabs prompt)
- [ ] **Implement:** Google Workspace (`gog`) access. The agent currently lacks the ability to read Gmail/Calendar.
- [x] **Implement:** Ultimate Brain Notion bridge on the gateway — `quillServer/skills/quill-notion/` + `quillServer/scripts/quill_notion_bridge.py` (optional: `n8n-mcp` for cross-system automation remains separate).
- [ ] **Verify:** Can the agent successfully trigger an `outbound-call` via ElevenLabs/Twilio? (Note: ElevenLabs and Twilio are reported as working, but need full integration test).
- [ ] **Verify:** Can the agent read local files on the Hetzner server?

## 5. The "Berman Roadmap" Integrations (Next Steps)
- [ ] **n8n-mcp:** Install and configure `n8n-mcp` to handle Notion/Todoist syncing without custom API scripts.
- [ ] **GSD Meta-Prompting:** Integrate the `get-shit-done` framework into Cursor for spec-driven development.
- [ ] **Advanced Ingestion:** Install Marker/PaddleOCR on `quillServer` for PDF/image ingestion.
- [ ] **Multi-Agent Router:** Build the Telegram topic router (`#inbox`, `#calendar`, etc.).
- [ ] **Two-Tier Memory:** Implement the daily Notion logger and the midnight `MEMORY.md` synthesizer.
- [ ] **Evaluate `mempalace` for Quill memory**: Determine whether `mempalace` would help as a long-term memory and retrieval layer for Telegram topics, daily notes, and agent context recall. Compare it against the planned two-tier memory design and define the smallest useful prototype before committing to adoption.
- [ ] **Autoresearch (Stretch):** Build the Andrej Karpathy-style deep dive research agent.

## 6. Integrations (`ultimateBrain`)
- [x] Align Notion databases to the `prometheon` / `ultimateBrain` ontology.
