> **Cursor:** Run [`prompts/06-simplification-pass.md`](../prompts/06-simplification-pass.md) in **Plan** mode. Spec body below.

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

Review the whole proposed system and aggressively simplify it without breaking the core goals.

Constraints:
- OpenClaw must remain the brain
- backend must remain thin
- app must remain useful
- sandboxing must remain first-class
- OpenClaw native policies/approvals should be reused wherever possible
- the whole system should be feasible for one technical founder

Please identify:
1. what is essential for v1
2. what can be delayed
3. what is overengineered
4. what can be removed
5. what the thinnest viable version is
6. what the no-regret architectural boundaries are

Then rewrite the v1 architecture in the simplest possible form.
