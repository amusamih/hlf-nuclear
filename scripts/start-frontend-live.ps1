$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$env:VITE_API_BASE = "/api"

npm.cmd run dev --workspace @prototype/frontend -- --host 127.0.0.1 --port 5173
