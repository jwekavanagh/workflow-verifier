set -euo pipefail
git clone --depth 1 https://github.com/jwekavanagh/agentskeptic.git
cd agentskeptic
npm install
npm run build
npm start
npm run first-run-verify
