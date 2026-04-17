# After copying from https://agentskeptic.com/integrate: export AGENTSKEPTIC_FUNNEL_ANON_ID and AGENTSKEPTIC_VERIFICATION_HYPOTHESIS in this shell when you want attributed telemetry.
set -euo pipefail
git clone --depth 1 https://github.com/jwekavanagh/agentskeptic.git
cd agentskeptic
npm install
npm run build
npm start
npm run first-run-verify
OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT
node dist/cli.js bootstrap --input test/fixtures/bootstrap-pack/input.json --db examples/demo.db --out "$OUT"
node dist/cli.js --workflow-id wf_bootstrap_fixture --events "$OUT/events.ndjson" --registry "$OUT/tools.json" --db examples/demo.db
