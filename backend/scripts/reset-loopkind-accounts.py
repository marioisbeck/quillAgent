#!/usr/bin/env python3
"""Wipe all loopkind accounts and push subscriptions from the Quill backend DB.

Use this when a user is locked out of loopkind (forgotten password, broken
signup state, want to start over) and you have shell access to the box that
runs `quill-backend.service`. It clears `loopkind_push_subscriptions` first
(FK dependency), then `loopkind_users`. Approval cards, calendar/mail data,
and audit history are untouched.

The script refuses to do anything unless `--yes` is passed, so it is safe to
copy/paste from docs without surprising consequences.

Usage:
    python3 scripts/reset-loopkind-accounts.py --yes
    python3 scripts/reset-loopkind-accounts.py --yes --db /opt/quill/quillAgent/backend/quill.db

After running, restart `loopkind.service` is NOT required: the next page load
will see zero users and re-enable the bootstrap signup flow.
"""

from __future__ import annotations

import argparse
import sqlite3
import sys
from pathlib import Path


DEFAULT_DB = Path(__file__).resolve().parent.parent / "quill.db"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--db",
        type=Path,
        default=DEFAULT_DB,
        help=f"path to quill.db (default: {DEFAULT_DB})",
    )
    parser.add_argument(
        "--yes",
        action="store_true",
        help="actually perform the wipe; without it the script only previews counts",
    )
    args = parser.parse_args()

    if not args.db.exists():
        print(f"database not found: {args.db}", file=sys.stderr)
        return 2

    with sqlite3.connect(args.db) as conn:
        conn.execute("PRAGMA foreign_keys = ON")
        users_before = conn.execute("SELECT COUNT(*) FROM loopkind_users").fetchone()[0]
        subs_before = conn.execute(
            "SELECT COUNT(*) FROM loopkind_push_subscriptions"
        ).fetchone()[0]
        print(
            f"loopkind_users={users_before} "
            f"loopkind_push_subscriptions={subs_before} "
            f"db={args.db}"
        )

        if not args.yes:
            print("dry run; pass --yes to wipe", file=sys.stderr)
            return 1

        conn.execute("DELETE FROM loopkind_push_subscriptions")
        conn.execute("DELETE FROM loopkind_users")
        conn.commit()

        users_after = conn.execute("SELECT COUNT(*) FROM loopkind_users").fetchone()[0]
        subs_after = conn.execute(
            "SELECT COUNT(*) FROM loopkind_push_subscriptions"
        ).fetchone()[0]
        print(
            f"wiped: loopkind_users={users_after} "
            f"loopkind_push_subscriptions={subs_after}"
        )

    return 0


if __name__ == "__main__":
    sys.exit(main())
