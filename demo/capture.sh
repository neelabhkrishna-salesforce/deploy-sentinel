#!/usr/bin/env bash
# Runs the real Deploy Sentinel commands and saves their output for the demo video.
set -euo pipefail
cd "$(dirname "$0")/.."
out=demo/build/capture
mkdir -p "$out"
export COLUMNS=104 FORCE_COLOR=0
quiet() { grep -v -e 'linked ESM module' -e 'auto-transpiled' || true; }

rm -rf out/demo
agentia plugins 2>&1 | quiet >"$out/plugins.txt"
agentia sentinel plan --simulate --out out/demo 2>&1 | quiet >"$out/plan.txt"
agentia sentinel report --simulate --out out/demo 2>&1 | quiet >"$out/report.txt"
npx vitest run 2>&1 | grep -v -e '^$' -e 'Start at' -e 'Duration' >"$out/tests.txt" || true
set +e
agentia sentinel report --simulate --out out/demo --gate >/dev/null 2>&1
echo "$?" >"$out/gate-exit.txt"
set -e
echo "captured to $out"
