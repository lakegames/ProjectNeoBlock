$ErrorActionPreference = "Stop"

if (!(Test-Path "apps/web/.env.local")) {
  Copy-Item "apps/web/.env.example" "apps/web/.env.local"
}
if (!(Test-Path "apps/server/.env.local")) {
  Copy-Item "apps/server/.env.example" "apps/server/.env.local"
}

if (!(Test-Path "node_modules")) {
  npm ci
}

npm run dev

