#!/usr/bin/env bash
set -euo pipefail

test -f package.json
test -f docker-compose.yml
test -f apps/api/src/server.ts
test -f apps/worker/src/worker.ts
test -f apps/web/app/page.tsx
test -f packages/db/src/schema.ts
test -f packages/ax-adapter/src/index.ts

echo "AxPlane scaffold files are present."
