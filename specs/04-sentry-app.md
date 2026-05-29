> **Cursor:** Run [`prompts/04-sentry-app.md`](../prompts/04-sentry-app.md) in **Plan** mode. Spec body below.

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

Now design the mobile-first Sentry app for the OpenClaw-centered architecture.

IMPORTANT:
This app is not a generic notification app.
It is the human supervision layer for OpenClaw-centered AI actions.
OpenClaw remains the brain.
The app is the control and approval surface.

Product thesis:
Humans are increasingly becoming reviewers, governors, and editors of AI work.
However, AI should be **autonomous by default** for non-destructive tasks (e.g., drafting an email and saving it in the drafts folder). Human-in-the-loop is only strictly necessary for irreversible, high-stakes, or destructive actions (e.g., actually sending the email, making a payment, or deleting files).
For these actions, we need a much better, faster interface for approving, rejecting, adjusting, and supervising AI actions.

Key idea:
Connected systems should be represented as recognizable app icons, similar to an iPhone home screen.
Examples:
- Gmail
- Calendar
- Drive
- Slack
- Voice Calling
- Web Browsing
- Notion (Ultimate Brain)
- Shell
- Files
- GitHub
- Custom API
- Quill / OpenClaw

Users should be able to:
- see a unified inbox of pending AI action requests that require explicit approval (e.g., sending emails, making payments, deleting files)
- experience a fast, Tinder-style swipe interface for triaging actions:
  - **Swipe Right:** Approve (go ahead)
  - **Swipe Left:** Reject (do not do that)
  - **Swipe Up:** Needs changing (opens a popup to add a text description of what should be changed; the system processes this and adds it back to the loop). Includes a manual edit feature.
  - **Swipe Down:** Needs changing, but stays in a focused interface to continuously improve *this one specific action* iteratively. Includes a manual edit feature.
- filter by app/system
- tap an app icon to enter app-specific review mode
- open the originating chat or artifact
- open a draft directly where relevant

The app should feel:
- calm
- operational
- trustworthy
- fast
- mobile-first
- modern but restrained

Please design:
1. product thesis
2. wedge user / first market
3. why this matters
4. screen architecture
5. app icon dashboard concept
6. approval inbox design (Tinder-style swipe interface)
7. app-specific fast review mode
8. detail screen & manual edit feature
9. request-changes flow (swipe up vs swipe down continuous improvement loop)
10. history/audit view
11. v1 scope
12. future roadmap
13. business angle

Then recommend the best implementation stack for speed and quality:
- React Native + Expo + TypeScript
- or PWA if you have strong reasons

Be opinionated and practical.
