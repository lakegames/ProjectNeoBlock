$ErrorActionPreference = "Stop"

if (!(Test-Path "apps/web/.env.local")) {
  Copy-Item "apps/web/.env.example" "apps/web/.env.local"
}

if (!(Test-Path "node_modules")) {
  npm ci
}

npm run dev

