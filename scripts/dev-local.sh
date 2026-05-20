#!/usr/bin/env bash
set -euo pipefail

if [ ! -f "apps/web/.env.local" ]; then
  cp "apps/web/.env.example" "apps/web/.env.local"
fi

if [ ! -d "node_modules" ]; then
  npm ci
fi

npm run dev

