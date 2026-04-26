#!/usr/bin/env bash
# Activate the repo's tracked hooks directory.
# Idempotent: safe to run multiple times.

set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

git config core.hooksPath .githooks

# Make every hook executable. Catches checkouts on filesystems that
# drop the executable bit (e.g. fresh clones on Windows / network mounts).
find .githooks -maxdepth 1 -type f ! -name '*.md' -print0 \
  | xargs -0 -I{} chmod +x {}

echo "core.hooksPath set to: $(git config --get core.hooksPath)"
echo "Active hooks:"
ls -la .githooks/ | grep -v '^total\|README\|\.md$' | tail -n +2
