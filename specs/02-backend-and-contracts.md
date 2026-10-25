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

## Optional conditional execution ownership (v1)

This remains approval-state validation and audit only. No backend action runner,
provider routing, polling controller or reasoning is added.

Authenticated `GET /api/approvals/:id` advertises `executionGuardVersion: 1`.
Gateway parity opts into `PATCH /api/approvals/:id/execution` with:

```json
{"executionStatus":"running","executionGuard":{"version":1,"owner":"gateway_parity","token":"<fresh 32 hex characters>","identity":{"connector":"gateway","action":"<current action>","kind":"<current kind or null>","bridgeApprovalId":"<local ID>","resumeToken":"<local token>"}}}
```

`BEGIN IMMEDIATE` encloses the read/compare/update/audit. A running claim requires
approved/pending, exact current identity, a non-server-route gateway owner and
no prior claim. Saved `payload.details.executionClaim` binds the identity/token.
Server actions (`server_route_codex`) and kinds (`server_codex`) always conflict.
Same-token running retries are idempotent while still approved/running; another
token, nonpending state, invalid identity or unauthorized owner returns 409 with
no execution/audit mutation. The token correlates a claim; mandatory shared API
authentication is still required and it grants no new cross-owner authority.

Completed/failed reports must include the same guard, match the current identity
and transition that claim from running. Identical terminal retries are
idempotent; changed or conflicting reports are refused. Successful guarded
responses include `success`, `executionGuardVersion: 1`, and the updated card.

Create/manualEdit cannot forge or remove a claim. Once claimed, execution fields
cannot be changed by manualEdit or unguarded execution PATCH. While running,
manualEdit also cannot change connector, kind, local approval ID or resume token;
the top-level action is already immutable through this API. Human decisions,
summary and harmless detail edits remain available. Ordinary unclaimed legacy
execution callers are compatible. Existing frozen lifecycle identity, retention,
feedback-generation and HMAC settlement checks continue independently.

Consumers recheck current ownership before any PATCH and decision/claim before
local resume. A missing capability or unconfirmed claim response never invokes
the action. Lost claims/reports do not authorize reset, stealing or action replay.
Deploy this backend contract before consumers; preserve DB/audit/receipt and local
outbox/attempt/approval state during rollout. Runtime dependency and exact origin
binding preflights remain in `quillServer/setup/loopkind-lifecycle.md`.
