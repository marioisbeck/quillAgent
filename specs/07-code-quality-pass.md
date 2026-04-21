> **Cursor:** Run [`prompts/07-code-quality-pass.md`](../prompts/07-code-quality-pass.md) in **Agent** mode. Spec body below.

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

Now review all generated code and architecture for consistency.

Check:
- imports
- naming consistency
- route consistency
- data model consistency
- shared type consistency
- approval flow coherence
- OpenClaw contract coherence
- app/backend contract alignment
- whether the backend accidentally became a second brain
- whether sandboxing and OpenClaw native controls are still central
- whether the system stayed within realistic founder scope

Then fix all inconsistencies and regenerate any problematic files or definitions.
Keep everything small and coherent.
