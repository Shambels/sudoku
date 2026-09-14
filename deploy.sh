#!/usr/bin/env bash
# Push the browser demo to https://pinchs.be/sudoku/. Five files and no build
# step — see "Deploying the demo" in README.md for the one-time server setup.
#
# This repository deploys itself. The portfolio that links here (pinchs.be) has
# its own deploy script and its own directory, and neither can touch the other's
# files: it owns /var/www/pinchs.be, this owns /var/www/demos/sudoku. Updating
# the demo is this script and nothing else — no site rebuild, no site deploy.
set -euo pipefail
cd "$(dirname "$0")"

HOST="${DEPLOY_HOST:-deploy@pinchs.be}"
DIR="${DEPLOY_DIR:-/var/www/demos/sudoku}"
BASE="${DEPLOY_URL:-https://pinchs.be}"

# Named one at a time rather than rsynced wholesale. The repository is 7 MB of
# fixtures, training tools, a labelling page and a Python solver; the demo is
# these five files, and `index.html` loads exactly the four beside it. A new
# file the page needs is a new line here — which is the point. An exclude list
# would ship whatever gets added next without anyone deciding to.
FILES=(index.html style.css sudoku.js vision.js digit-model.js)

# Staged into a directory of its own so the rsync can be a plain directory sync
# with --delete: a file dropped from FILES then disappears from the server too,
# and recent macOS ships openrsync, which has neither --delete-excluded nor -z
# to do it any other way. `a+rX` because nginx serves as its own user and a
# repo-mode file it cannot read is a 403, not a 404 — the same trap the
# portfolio's deploy documents.
stage="$(mktemp -d)"
trap 'rm -rf "$stage"' EXIT
cp "${FILES[@]}" "$stage/"
chmod -R a+rX "$stage"

rsync -a --delete "$stage/" "$HOST:$DIR/"

# The demo is served by a `location /sudoku/` block that lives in the *other*
# repository (portfolio: deploy/nginx.conf), so it is worth a probe from this
# side: this deploy is the one that can tell whether the two still agree.
for probe in "/sudoku 301" "/sudoku/ 200" "/sudoku/sudoku.js 200" "/sudoku/nope 404"; do
  set -- $probe
  code=$(curl -sS -o /dev/null -w '%{http_code}' "$BASE$1")
  [ "$code" = "$2" ] || { echo "smoke: $1 -> $code, wanted $2"; exit 1; }
done

echo "deployed to $HOST:$DIR — $BASE/sudoku/ ok"
