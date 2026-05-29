> **Cursor:** Run [`prompts/05-implementation-starter.md`](../prompts/05-implementation-starter.md) in **Agent** mode. Spec body below.

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

Now generate a practical implementation starter for the whole v1 system.

The system consists of:

1. OpenClaw as the central runtime
2. Quill as the persistent agent in OpenClaw
3. a thin backend/control-plane service
4. a mobile-first Sentry app
5. a small set of custom OpenClaw wrapper tools (to intercept existing ClawHub skills) and a custom Notion "Ultimate Brain" skill

IMPORTANT:
Do not overengineer.
Keep this startup-practical and founder-buildable.

Please generate:

1. recommended repo structure
2. backend project structure
3. mobile app project structure
4. shared type definitions
5. approval request model
6. approval decision model
7. example OpenClaw tool request contracts
8. backend route examples
9. mobile screen/component structure
10. mock data examples
11. implementation order

Then generate starter code for:
- backend types/models
- a few backend routes
- app navigation
- app icon dashboard screen
- approval inbox screen
- approval detail screen
- feedback modal
- a reusable ApprovalCard component
- mock approval data
- example OpenClaw payload examples

Keep the code coherent and realistic.
Use strong type definitions.
Prefer the smallest clean implementation that can become real.
