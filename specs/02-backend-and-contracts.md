> **Cursor:** Run [`prompts/02-backend-contracts.md`](../prompts/02-backend-contracts.md) in **Plan** mode. Spec body below.

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

Now design the thin backend/control-plane layer for the OpenClaw-centered architecture.

IMPORTANT:
This backend is NOT the brain.
OpenClaw remains the brain.
The backend only provides shared control-plane functions.

The backend should likely handle:
- approval request storage
- approval decisions
- audit history
- connector token/config storage
- shared structured state
- app notifications
- links back to originating chat/artifacts
- optional memory-pack sync metadata

Please design:

1. backend responsibilities
2. data model
3. API design
4. event/request contracts between OpenClaw wrapper tools (intercepting existing skills) and the backend
5. approval request schema (must support rich context for Tinder-style swipe UI)
6. approval decision schema (approve, reject, request_changes, continuous_improvement)
7. shared state schema
8. audit log schema
9. how the backend should communicate with a mobile Sentry app
10. how the backend should communicate back to OpenClaw tools/connectors

Please also define a minimal v1 API with endpoints such as:
- create approval request
- get approval status
- list pending approvals
- submit approval decision (approve/reject)
- request changes (swipe up: add description, send back to loop)
- enter continuous improvement loop (swipe down: lock into iterative refinement)
- fetch history
- shared state lookup/write

Keep the backend thin, practical, and startup-sized.
Prefer FastAPI or Node/TypeScript, and recommend the better option.
Do not overengineer.
