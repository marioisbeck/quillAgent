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


## Implemented lifecycle retention contract (2026-10-23)

This is approval/receipt storage only; the gateway and Mac own execution and
Telegram transport. The backend does not launch, resume, schedule or reason.

Additive migration v1 (`quill_schema_migrations`) enrolls existing version-1
lifecycle cards in `lifecycle_retention` with their original context. New cards
enroll on creation. No legacy approval/audit data is dropped. Context/connector/
local approval identity cannot be changed through manual edits after enrollment.
Missing or invalid signed context stays retained for operator reconciliation.

Single and bulk history DELETE preserve the pending guard. Nonpending enrolled
cards become hidden immediately and disappear from ordinary GET /api/approvals.
They remain addressable by ID and execution PATCH; cleanup never re-exposes them
in UI history. Ordinary legacy cards without a version-1 lifecycle keep their
previous physical deletion behavior.

Authenticated consumer paths (same mandatory x-quill-api-key middleware):

- `GET /api/lifecycle/approvals?limit=200&after=<id>` returns
  `{approvals,nextCursor}` in ID order; maximum page size 500. Includes hidden
  retained cards and a server-derived `feedbackGeneration` for each snapshot.
- `GET /api/lifecycle/execution?connector=...&status=...&executionStatus=pending&limit=20`
  returns the same list contract as the ordinary approval list, including hidden
  required work. An explicit connector and limit 1..500 are mandatory.
- `POST /api/approvals/:id/feedback` accepts
  `{generation,contextSignature,phase,messageId}` only for a confirmed Telegram
  message. The generation is a canonical hash of current decision, immutable
  lifecycle context and execution report. It is never a caller-selected route.
  The backend verifies the original context HMAC and identity, current phase,
  generation and prior approved receipt before accepting terminal settlement.
  A repeated identical receipt succeeds, including after card purge; a different
  message, phase, signature or generation conflicts. Compact receipt identities
  remain for idempotent acknowledgement after a lost response.

Purge requires an authoritative terminal execution report plus approved/final
feedback receipts (or a consistent rejection and its receipt). A launcher exit,
job ID, dispatch-active result, administrative timeout sweep, unknown/incomplete
result or contradictory reversal cannot authorize purge. Pending expired cards
remain guarded; changes_requested/continuous_improvement and ambiguous old cards
are held. Telegram timeout/unknown sends have no confirmed receipt. No human
history cleanup may treat them as delivered. Full delivery semantics live in
`quillServer/setup/loopkind-lifecycle.md`; the observer retries receipt writes
without sending again, invoking approvals or replaying actions.
