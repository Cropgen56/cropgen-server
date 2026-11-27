#!/bin/sh
# Prepare the harness: fake packages + a fresh copy of the advisory code.
# Run from anywhere:  sh dev-harness/sync.sh && (cd dev-harness && npm test)
set -e
H="$(cd "$(dirname "$0")" && pwd)"
ADV="$(cd "$H/.." && pwd)"
rm -rf "$H/node_modules" && cp -r "$H/fake_modules" "$H/node_modules"
rm -rf "$H/src/features/advisory" && mkdir -p "$H/src/features/advisory"
for item in "$ADV"/* ; do
  name="$(basename "$item")"
  [ "$name" = "dev-harness" ] && continue
  cp -r "$item" "$H/src/features/advisory/"
done
echo "harness ready"
