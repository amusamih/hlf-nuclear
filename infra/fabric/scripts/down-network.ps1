[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..\..")).Path
$fabricRoot = Join-Path $repoRoot "infra\fabric"
$composeFile = Join-Path $fabricRoot "docker\docker-compose.fabric.yaml"

function Remove-DirectoryIfPresent([string]$DirectoryPath) {
  if (Test-Path $DirectoryPath) {
    Remove-Item -Recurse -Force $DirectoryPath
  }
}

Write-Host "Stopping Fabric containers..." -ForegroundColor Cyan
& docker compose -f $composeFile down -v --remove-orphans | Out-Null

Write-Host "Removing generated Fabric artifacts..." -ForegroundColor Cyan
Remove-DirectoryIfPresent (Join-Path $fabricRoot "organizations")
Remove-DirectoryIfPresent (Join-Path $fabricRoot "channel-artifacts")
Remove-DirectoryIfPresent (Join-Path $fabricRoot "connection-profiles")
Remove-DirectoryIfPresent (Join-Path $fabricRoot "state")

Write-Host "Fabric sandbox has been removed." -ForegroundColor Green
