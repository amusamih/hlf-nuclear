$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$env:PORT = "3000"
$env:FABRIC_MODE = "real"
$env:FABRIC_CHANNEL_NAME = "regulatory-workflow-channel"
$env:FABRIC_CHAINCODE_NAME = "nuclear-assurance"
$env:FABRIC_CONNECTION_PROFILE_DOMESTIC = "infra/fabric/connection-profiles/domestic-gateway.json"
$env:FABRIC_CONNECTION_PROFILE_COORDINATION = "infra/fabric/connection-profiles/coordination-gateway.json"
$env:FABRIC_CONNECTION_PROFILE_FOREIGN = "infra/fabric/connection-profiles/foreign-gateway.json"

$env:PROJECTION_STORE_MODE = "postgres"
$env:POSTGRES_HOST = "127.0.0.1"
$env:POSTGRES_PORT = "5432"
$env:POSTGRES_DATABASE = "nuclear_assurance"
$env:POSTGRES_USER = "prototype"
$env:POSTGRES_PASSWORD = "prototype"
$env:POSTGRES_SSL = "false"

$env:OBJECT_STORAGE_MODE = "minio"
$env:MINIO_ENDPOINT = "127.0.0.1"
$env:MINIO_PORT = "9000"
$env:MINIO_USE_SSL = "false"
$env:MINIO_ACCESS_KEY = "prototype"
$env:MINIO_SECRET_KEY = "prototype123"

npm.cmd run start --workspace @prototype/backend
