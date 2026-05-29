#!/usr/bin/env python3
"""Send a batch of demo approval cards to the Quill backend so the
loopkind reviewer has fresh content to test against.

All cards use the loopkind.demo.* action namespace and ship without
a bridgeApprovalId / resumeToken, so approving any of them is safe:
the executor will mark the card failed with a friendly error and
walk away without touching the underlying calendar / mail / laptop.

The script is idempotent in spirit (a re-run sends a fresh copy of
each card with a new server-generated id), so you can re-run it
whenever you want to top up the queue.

Usage from your laptop, against the local backend:
    QUILL_API_KEY=... \\
      python3 scripts/seed-loopkind-demo-cards.py

Usage from the production server (where the backend listens on
loopback only), via SSH:
    ssh root@<host> 'export QUILL_API_KEY="..."; \\
      python3 /opt/quill/quillAgent/backend/scripts/seed-loopkind-demo-cards.py'

Filtering:
    --connector calendar       only send calendar cards
    --connector mail laptop    send mail and laptop cards
    --max 3                    cap to first N (after filtering)
    --backend http://...       point at a different backend URL
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request


def card_calendar_create_focus_block() -> dict:
    return {
        "action": "loopkind.demo.calendar.create_event",
        "payload": {
            "connector": "calendar",
            "summary": "Block off Wednesday morning for deep work",
            "preview": {
                "title": "Block off Wednesday morning for deep work",
                "body": (
                    "Creates a 2-hour event on your primary Google "
                    "calendar tomorrow from 10:00 to 12:00 in "
                    "Europe/Berlin. Marked busy, no attendees, no "
                    "reminder."
                ),
                "risks": (
                    "Writes to your Google calendar. Anyone you have "
                    "shared this calendar with will see the event "
                    "title and time. Easy to undo: delete the event "
                    "afterwards, or reject this card now and nothing "
                    "is written."
                ),
                "metadata": {
                    "calendar": "primary",
                    "duration": "2h",
                    "risk": "low",
                },
            },
            "details": {
                "kind": "calendar_event",
                "provider": "google",
                "source": "google",
                "account": "marioisbeck@gmail.com",
                "calendarId": "primary",
                "calendarName": "Mario Beck",
                "operation": "create_event",
                "start": "2026-04-30T10:00:00+02:00",
                "end": "2026-04-30T12:00:00+02:00",
                "description": "Deep work - no meetings, no Slack.",
                "location": "",
                "attendees": "",
                "allDay": False,
                "timezone": "Europe/Berlin",
            },
        },
    }


def card_calendar_decline_meeting() -> dict:
    return {
        "action": "loopkind.demo.calendar.delete_event",
        "payload": {
            "connector": "calendar",
            "summary": "Decline the optional 'AI roundtable' on Friday",
            "preview": {
                "title": "Decline the optional AI roundtable on Friday",
                "body": (
                    "Removes you from the 'AI roundtable' on Friday "
                    "15:00-16:00. The organiser (Sam) and 8 other "
                    "attendees see your status flip to 'declined'."
                ),
                "risks": (
                    "Sam gets a 'response: no' notification within "
                    "seconds. The original invite stays in your inbox "
                    "in case you change your mind. Reject this card "
                    "to keep the meeting on your calendar."
                ),
                "metadata": {
                    "calendar": "primary",
                    "attendees": "9",
                    "risk": "low",
                },
            },
            "details": {
                "kind": "calendar_event",
                "provider": "google",
                "source": "google",
                "account": "marioisbeck@gmail.com",
                "calendarId": "primary",
                "operation": "decline_event",
                "eventId": "demo-event-roundtable-091",
                "start": "2026-05-01T15:00:00+02:00",
                "end": "2026-05-01T16:00:00+02:00",
                "description": "Optional roundtable. Bring questions.",
                "location": "Google Meet",
                "attendees": (
                    "sam@example.com, riley@example.com, "
                    "alex@example.com, jordan@example.com, "
                    "morgan@example.com, taylor@example.com, "
                    "jamie@example.com, casey@example.com"
                ),
                "allDay": False,
                "timezone": "Europe/Berlin",
            },
        },
    }


def card_mail_reply_status_update() -> dict:
    return {
        "action": "loopkind.demo.mail.send_message",
        "payload": {
            "connector": "mail",
            "summary": "Reply to thread with weekly status update",
            "preview": {
                "title": "Reply to Jordan with this week's status update",
                "body": (
                    "Sends a short reply on the 'Project Loopkind "
                    "weekly' thread, summarising what shipped this "
                    "week and what's planned for next. About 180 "
                    "words."
                ),
                "risks": (
                    "Sending mail is irreversible. Jordan receives it "
                    "within seconds and may forward, archive, or "
                    "auto-reply. Because it's a reply, your previous "
                    "messages on the thread are quoted underneath."
                ),
                "metadata": {
                    "to": "jordan@example.com",
                    "thread": "Project Loopkind weekly",
                    "risk": "high",
                },
            },
            "details": {
                "kind": "mail_message",
                "provider": "google",
                "source": "google",
                "account": "marioisbeck@gmail.com",
                "operation": "send_message",
                "to": "jordan@example.com",
                "cc": "",
                "bcc": "",
                "subject": "Re: Project Loopkind weekly",
                "bodyPreview": (
                    "Quick status update: shipped account auth and "
                    "iPhone push notifications this week, plus the "
                    "new card construction guidelines. Next up: "
                    "the laptop bridge."
                ),
                "hasAttachments": False,
                "attachmentNames": [],
                "draftId": "demo-draft-status-001",
                "inReplyToMessageId": "demo-thread-msg-007",
                "threadId": "demo-thread-007",
            },
        },
    }


def card_mail_archive_old_thread() -> dict:
    return {
        "action": "loopkind.demo.mail.archive_thread",
        "payload": {
            "connector": "mail",
            "summary": "Archive a 3-month-old thread with Casey",
            "preview": {
                "title": "Archive 'Vacation handover' thread with Casey",
                "body": (
                    "Moves the 'Vacation handover' thread (last "
                    "message 2026-01-29) out of your inbox and into "
                    "All Mail. Nothing is deleted; the thread is "
                    "still searchable."
                ),
                "risks": (
                    "Reversible: you can drag the thread back into "
                    "the inbox at any time, or search for it. Casey "
                    "is not notified. If a reply lands later it will "
                    "still come back to your inbox automatically."
                ),
                "metadata": {
                    "thread": "Vacation handover",
                    "messages": "12",
                    "risk": "low",
                },
            },
            "details": {
                "kind": "mail_thread",
                "provider": "google",
                "source": "google",
                "account": "marioisbeck@gmail.com",
                "operation": "archive_thread",
                "threadId": "demo-thread-vacation-handover",
                "messageCount": 12,
            },
        },
    }


def card_laptop_clean_node_modules() -> dict:
    return {
        "action": "loopkind.demo.laptop.shell",
        "payload": {
            "connector": "laptop",
            "summary": "Delete cached node_modules folders to free disk",
            "preview": {
                "title": "Free up about 1.2 GB by clearing dependencies",
                "body": (
                    "Removes the node_modules folders inside loopkind, "
                    "quillAgent, and quillServer on your laptop. The "
                    "next time you run npm install in any of them, "
                    "the dependencies will be re-downloaded."
                ),
                "risks": (
                    "Runs as your laptop user with full filesystem "
                    "authority. Any uncommitted local node_modules "
                    "patches (npm link, manual edits) will be lost - "
                    "there is no undo. The first npm install "
                    "afterwards may take 1-3 minutes per repo."
                ),
                "metadata": {
                    "tool": "laptop.shell",
                    "scope": "3 repos",
                    "risk": "medium",
                },
            },
            "details": {
                "kind": "laptop_shell",
                "source": "laptop",
                "operation": "shell",
                "toolName": "laptop.shell",
                "riskLevel": "medium",
                "cmd": (
                    "rm -rf loopkind/node_modules "
                    "quillAgent/node_modules "
                    "quillServer/node_modules"
                ),
                "cwd": "/Users/mario/programming/projects/quill",
                "timeoutS": 60,
                "envKeys": [],
            },
        },
    }


def card_laptop_brew_upgrade() -> dict:
    return {
        "action": "loopkind.demo.laptop.shell",
        "payload": {
            "connector": "laptop",
            "summary": "Run `brew upgrade` to update Homebrew packages",
            "preview": {
                "title": "Upgrade all Homebrew packages",
                "body": (
                    "Runs `brew update && brew upgrade` on your "
                    "laptop. Updates the Homebrew formula list, then "
                    "upgrades every package that has a newer version "
                    "available. Likely takes 3-10 minutes."
                ),
                "risks": (
                    "Long-running command. New package versions can "
                    "occasionally introduce breaking changes - in "
                    "particular, language runtimes (node, python) "
                    "may bump to a new major. If that happens, "
                    "in-flight venvs / npm projects in this user's "
                    "shell may stop working until rebuilt."
                ),
                "metadata": {
                    "tool": "laptop.shell",
                    "estimated": "3-10 min",
                    "risk": "medium",
                },
            },
            "details": {
                "kind": "laptop_shell",
                "source": "laptop",
                "operation": "shell",
                "toolName": "laptop.shell",
                "riskLevel": "medium",
                "cmd": "brew update && brew upgrade",
                "cwd": "/Users/mario",
                "timeoutS": 900,
                "envKeys": [],
            },
        },
    }


CARDS = {
    "calendar": [
        card_calendar_create_focus_block,
        card_calendar_decline_meeting,
    ],
    "mail": [
        card_mail_reply_status_update,
        card_mail_archive_old_thread,
    ],
    "laptop": [
        card_laptop_clean_node_modules,
        card_laptop_brew_upgrade,
    ],
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Seed loopkind with demo approval cards.",
    )
    parser.add_argument(
        "--backend",
        default=os.environ.get("QUILL_BACKEND_URL", "http://127.0.0.1:3001"),
        help=(
            "Base URL of the quill-backend service. Defaults to "
            "$QUILL_BACKEND_URL or http://127.0.0.1:3001."
        ),
    )
    parser.add_argument(
        "--connector",
        nargs="+",
        choices=sorted(CARDS.keys()),
        help=(
            "Only send cards for the given connector(s). Defaults to "
            "all of: calendar, mail, laptop."
        ),
    )
    parser.add_argument(
        "--max",
        type=int,
        default=None,
        help="Cap the total number of cards sent (after filtering).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print what would be sent without contacting the backend.",
    )
    return parser.parse_args()


def select_cards(connectors: list[str] | None) -> list[dict]:
    chosen = connectors or sorted(CARDS.keys())
    selected: list[dict] = []
    for connector in chosen:
        for build in CARDS[connector]:
            selected.append(build())
    return selected


def main() -> int:
    args = parse_args()
    api_key = os.environ.get("QUILL_API_KEY")
    if not api_key and not args.dry_run:
        print(
            "QUILL_API_KEY is not set. Export it and re-run, or pass "
            "--dry-run to inspect the catalog without sending.",
            file=sys.stderr,
        )
        return 2

    cards = select_cards(args.connector)
    if args.max is not None:
        cards = cards[: args.max]

    if not cards:
        print("No cards selected. Check --connector / --max.", file=sys.stderr)
        return 1

    endpoint = args.backend.rstrip("/") + "/api/approvals"
    print(f"Sending {len(cards)} demo card(s) to {endpoint}")

    failures = 0
    for index, card in enumerate(cards, 1):
        title = card["payload"]["preview"]["title"]
        if args.dry_run:
            print(f"  [{index}/{len(cards)}] (dry-run) {card['action']} - {title}")
            continue
        request = urllib.request.Request(
            endpoint,
            data=json.dumps(card).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "X-Quill-Api-Key": api_key,
            },
            method="POST",
        )
        # `endpoint` is built from the operator-supplied `--backend` CLI arg
        # (default `http://127.0.0.1:3001`), not from user input. This is an
        # operator-run demo-seeding script invoked manually with SSH access
        # to the box already; if you pass `--backend file:///…` to your own
        # script, that's your prerogative, not a vulnerability. The semgrep
        # rule is overly broad for non-server-context scripts. Suppression must
        # sit on the line immediately above the trigger (semgrep ignores the
        # directive otherwise).
        try:
            # nosemgrep: python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected
            with urllib.request.urlopen(request, timeout=10) as response:
                body = json.loads(response.read().decode("utf-8"))
            print(
                f"  [{index}/{len(cards)}] ok id={body['id']} "
                f"action={body['action']} - {title}"
            )
        except urllib.error.HTTPError as err:
            failures += 1
            print(
                f"  [{index}/{len(cards)}] HTTP {err.code}: {err.reason} "
                f"({title})",
                file=sys.stderr,
            )
        except Exception as err:  # network errors, JSON errors, etc.
            failures += 1
            print(
                f"  [{index}/{len(cards)}] failed: {err} ({title})",
                file=sys.stderr,
            )
        # Light pacing so push fan-out has a chance to deliver each
        # notification distinctly instead of being batched by the
        # browser.
        time.sleep(0.5)

    if failures:
        print(f"Done with {failures} failure(s).", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
