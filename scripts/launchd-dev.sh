#!/bin/bash
set -euo pipefail

AXPLANE_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$AXPLANE_ROOT"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm not found on PATH — install Node 22+ and enable corepack: corepack enable" >&2
  exit 1
fi

exec pnpm dev
