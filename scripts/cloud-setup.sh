#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
node -e 'if (Number(process.versions.node.split(".")[0]) !== 24) { console.error("Use Node.js 24 for the MDLM cloud setup."); process.exit(1); }'
npm ci --no-audit --no-fund
npm run build
node scripts/cloud-check.mjs
