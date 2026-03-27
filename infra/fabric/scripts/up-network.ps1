[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..\..")).Path
$fabricRoot = Join-Path $repoRoot "infra\fabric"
$composeFile = Join-Path $fabricRoot "docker\docker-compose.fabric.yaml"
$organizationsDir = Join-Path $fabricRoot "organizations"
$channelArtifactsDir = Join-Path $fabricRoot "channel-artifacts"
$connectionProfilesDir = Join-Path $fabricRoot "connection-profiles"
$stateDir = Join-Path $fabricRoot "state"
$chaincodeRoot = Join-Path $repoRoot "smart-contracts\chaincode"
$chaincodeDist = Join-Path $chaincodeRoot "dist\index.js"

$channelName = "regulatory-workflow-channel"
$chaincodeName = "nuclear-assurance"
$chaincodeLabel = "nuclear-assurance_1"
$chaincodeVersion = "0.1.0"
$chaincodeSequence = "1"
$signaturePolicy = "OutOf(2, 'DomesticNuclearRegulatorMSP.peer', 'CoordinatingAuthorityMSP.peer', 'ForeignNuclearRegulatorMSP.peer')"
$ordererCaPath = "/workspace/organizations/ordererOrganizations/orderer.example.com/orderers/orderer.orderer.example.com/tls/ca.crt"
$hostOrdererTlsCaPath = Join-Path $fabricRoot "organizations\ordererOrganizations\orderer.example.com\orderers\orderer.orderer.example.com\tls\ca.crt"
$ordererHostAlias = "orderer.orderer.example.com"
$ordererUrl = "grpcs://localhost:7050"

function Convert-ToDockerPath([string]$PathValue) {
  return ((Resolve-Path $PathValue).Path).Replace("\", "/")
}

function Reset-Directory([string]$DirectoryPath) {
  if (Test-Path $DirectoryPath) {
    Remove-Item -Recurse -Force $DirectoryPath
  }

  New-Item -ItemType Directory -Path $DirectoryPath | Out-Null
}

function Invoke-DockerCommand([string[]]$Arguments) {
  $stdoutPath = [System.IO.Path]::GetTempFileName()
  $stderrPath = [System.IO.Path]::GetTempFileName()

  try {
    $process = Start-Process `
      -FilePath "docker" `
      -ArgumentList $Arguments `
      -NoNewWindow `
      -Wait `
      -PassThru `
      -RedirectStandardOutput $stdoutPath `
      -RedirectStandardError $stderrPath

    [string]$stdout = if (Test-Path $stdoutPath) {
      Get-Content $stdoutPath -Raw
    } else {
      ""
    }
    [string]$stderr = if (Test-Path $stderrPath) {
      Get-Content $stderrPath -Raw
    } else {
      ""
    }

    if ($process.ExitCode -ne 0) {
      throw "Docker command failed: docker $($Arguments -join ' ')`n$stdout`n$stderr"
    }

    return ($stdout + $stderr).Trim()
  } finally {
    if (Test-Path $stdoutPath) {
      Remove-Item $stdoutPath -Force
    }
    if (Test-Path $stderrPath) {
      Remove-Item $stderrPath -Force
    }
  }
}

function Invoke-FabricTools([string[]]$CommandArguments) {
  $dockerFabricRoot = Convert-ToDockerPath $fabricRoot
  $arguments = @(
    "run",
    "--rm",
    "-v", "${dockerFabricRoot}:/workspace",
    "-e", "FABRIC_CFG_PATH=/workspace/config",
    "-w", "/workspace",
    "hyperledger/fabric-tools:2.5"
  ) + $CommandArguments

  return Invoke-DockerCommand $arguments
}

function Invoke-PeerCli(
  [hashtable]$PeerOrg,
  [string[]]$CommandArguments,
  [switch]$MountChaincode
) {
  $dockerFabricRoot = Convert-ToDockerPath $fabricRoot
  $arguments = @(
    "run",
    "--rm",
    "--network", "fabric_nuclear",
    "-v", "${dockerFabricRoot}:/workspace",
    "-e", "CORE_PEER_TLS_ENABLED=true",
    "-e", "CORE_PEER_LOCALMSPID=$($PeerOrg.MspId)",
    "-e", "CORE_PEER_ADDRESS=$($PeerOrg.PeerAddress)",
    "-e", "CORE_PEER_MSPCONFIGPATH=$($PeerOrg.AdminMspPath)",
    "-e", "CORE_PEER_TLS_ROOTCERT_FILE=$($PeerOrg.PeerTlsCaPath)",
    "-w", "/workspace",
    "hyperledger/fabric-tools:2.5"
  )

  if ($MountChaincode) {
    $dockerChaincodeRoot = Convert-ToDockerPath $chaincodeRoot
    $arguments = @(
      "run",
      "--rm",
      "--network", "fabric_nuclear",
      "-v", "${dockerFabricRoot}:/workspace",
      "-v", "${dockerChaincodeRoot}:/workspace-chaincode",
      "-e", "CORE_PEER_TLS_ENABLED=true",
      "-e", "CORE_PEER_LOCALMSPID=$($PeerOrg.MspId)",
      "-e", "CORE_PEER_ADDRESS=$($PeerOrg.PeerAddress)",
      "-e", "CORE_PEER_MSPCONFIGPATH=$($PeerOrg.AdminMspPath)",
      "-e", "CORE_PEER_TLS_ROOTCERT_FILE=$($PeerOrg.PeerTlsCaPath)",
      "-w", "/workspace",
      "hyperledger/fabric-tools:2.5"
    )
  }

  return Invoke-DockerCommand ($arguments + $CommandArguments)
}

function Normalize-AdminIdentity(
  [string]$MspRoot
) {
  $keyPath = Get-ChildItem (Join-Path $MspRoot "keystore") -File | Select-Object -First 1
  if (-not $keyPath) {
    throw "No private key found under $(Join-Path $MspRoot 'keystore')."
  }
  Copy-Item $keyPath.FullName (Join-Path $MspRoot "keystore\key.pem") -Force

  $certPath = Get-ChildItem (Join-Path $MspRoot "signcerts") -File | Select-Object -First 1
  if (-not $certPath) {
    throw "No signcert found under $(Join-Path $MspRoot 'signcerts')."
  }
  Copy-Item $certPath.FullName (Join-Path $MspRoot "signcerts\cert.pem") -Force
}

function Write-ConnectionProfile(
  [string]$ProfilePath,
  [string]$ProfileName,
  [string]$OrganizationName,
  [string]$MspId,
  [string]$PeerName,
  [string]$PeerUrl,
  [string]$PeerTlsCaPath,
  [string]$PeerHostAlias,
  [string]$IdentityCertPath,
  [string]$IdentityKeyPath
) {
  $profile = @{
    name = $ProfileName
    version = "1.0.0"
    client = @{
      organization = $OrganizationName
    }
    organizations = @{
      $OrganizationName = @{
        mspid = $MspId
        peers = @($PeerName)
      }
    }
    peers = @{
      $PeerName = @{
        url = $PeerUrl
        tlsCACerts = @{
          path = $PeerTlsCaPath
        }
        grpcOptions = @{
          "ssl-target-name-override" = $PeerHostAlias
          hostnameOverride = $PeerHostAlias
        }
      }
    }
    channels = @{
      $channelName = @{
        orderers = @($ordererHostAlias)
        peers = @{
          $PeerName = @{
            discover = $true
            endorsingPeer = $true
            chaincodeQuery = $true
            ledgerQuery = $true
            eventSource = $true
          }
        }
      }
    }
    orderers = @{
      $ordererHostAlias = @{
        url = $ordererUrl
        tlsCACerts = @{
          path = $hostOrdererTlsCaPath
        }
        grpcOptions = @{
          "ssl-target-name-override" = $ordererHostAlias
          hostnameOverride = $ordererHostAlias
        }
      }
    }
    "x-fabric-gateway" = @{
      peerEndpoint = $PeerUrl.Replace("grpcs://", "")
      peerHostAlias = $PeerHostAlias
      tlsCertPath = $PeerTlsCaPath
      identity = @{
        certPath = $IdentityCertPath
        keyPath = $IdentityKeyPath
      }
    }
  }

  $profile | ConvertTo-Json -Depth 10 | Set-Content -Path $ProfilePath
}

if (-not (Test-Path $chaincodeDist)) {
  throw "Chaincode build output was not found at '$chaincodeDist'. Build @prototype/shared and @prototype/chaincode before starting the Fabric network."
}

$orgs = @{
  domestic = @{
    Name = "DomesticNuclearRegulator"
    MspId = "DomesticNuclearRegulatorMSP"
    PeerAddress = "peer0.domestic.example.com:7051"
    PeerTlsCaPath = "/workspace/organizations/peerOrganizations/domestic.example.com/peers/peer0.domestic.example.com/tls/ca.crt"
    AdminMspPath = "/workspace/organizations/peerOrganizations/domestic.example.com/users/Admin@domestic.example.com/msp"
    AnchorTx = "/workspace/channel-artifacts/DomesticNuclearRegulatorMSPanchors.tx"
    HostTlsCa = (Join-Path $fabricRoot "organizations\peerOrganizations\domestic.example.com\peers\peer0.domestic.example.com\tls\ca.crt")
    HostAdminMsp = (Join-Path $fabricRoot "organizations\peerOrganizations\domestic.example.com\users\Admin@domestic.example.com\msp")
    HostPeerAlias = "peer0.domestic.example.com"
    HostPeerUrl = "grpcs://localhost:7051"
    ConnectionProfile = (Join-Path $connectionProfilesDir "domestic-gateway.json")
  }
  coordination = @{
    Name = "CoordinatingAuthority"
    MspId = "CoordinatingAuthorityMSP"
    PeerAddress = "peer0.coordination.example.com:8051"
    PeerTlsCaPath = "/workspace/organizations/peerOrganizations/coordination.example.com/peers/peer0.coordination.example.com/tls/ca.crt"
    AdminMspPath = "/workspace/organizations/peerOrganizations/coordination.example.com/users/Admin@coordination.example.com/msp"
    AnchorTx = "/workspace/channel-artifacts/CoordinatingAuthorityMSPanchors.tx"
    HostTlsCa = (Join-Path $fabricRoot "organizations\peerOrganizations\coordination.example.com\peers\peer0.coordination.example.com\tls\ca.crt")
    HostAdminMsp = (Join-Path $fabricRoot "organizations\peerOrganizations\coordination.example.com\users\Admin@coordination.example.com\msp")
    HostPeerAlias = "peer0.coordination.example.com"
    HostPeerUrl = "grpcs://localhost:8051"
    ConnectionProfile = (Join-Path $connectionProfilesDir "coordination-gateway.json")
  }
  foreign = @{
    Name = "ForeignNuclearRegulator"
    MspId = "ForeignNuclearRegulatorMSP"
    PeerAddress = "peer0.foreign.example.com:9051"
    PeerTlsCaPath = "/workspace/organizations/peerOrganizations/foreign.example.com/peers/peer0.foreign.example.com/tls/ca.crt"
    AdminMspPath = "/workspace/organizations/peerOrganizations/foreign.example.com/users/Admin@foreign.example.com/msp"
    AnchorTx = "/workspace/channel-artifacts/ForeignNuclearRegulatorMSPanchors.tx"
    HostTlsCa = (Join-Path $fabricRoot "organizations\peerOrganizations\foreign.example.com\peers\peer0.foreign.example.com\tls\ca.crt")
    HostAdminMsp = (Join-Path $fabricRoot "organizations\peerOrganizations\foreign.example.com\users\Admin@foreign.example.com\msp")
    HostPeerAlias = "peer0.foreign.example.com"
    HostPeerUrl = "grpcs://localhost:9051"
    ConnectionProfile = (Join-Path $connectionProfilesDir "foreign-gateway.json")
  }
}

Write-Host "Stopping any existing Fabric runtime..." -ForegroundColor Cyan
& docker compose -f $composeFile down -v --remove-orphans | Out-Null

Write-Host "Resetting generated artifact directories..." -ForegroundColor Cyan
Reset-Directory $organizationsDir
Reset-Directory $channelArtifactsDir
Reset-Directory $connectionProfilesDir
Reset-Directory $stateDir

Write-Host "Generating crypto material..." -ForegroundColor Cyan
Invoke-FabricTools @(
  "cryptogen",
  "generate",
  "--config=/workspace/config/crypto-config.yaml",
  "--output=/workspace/organizations"
) | Out-Null

Write-Host "Normalizing admin identity filenames..." -ForegroundColor Cyan
Normalize-AdminIdentity (Join-Path $fabricRoot "organizations\peerOrganizations\domestic.example.com\users\Admin@domestic.example.com\msp")
Normalize-AdminIdentity (Join-Path $fabricRoot "organizations\peerOrganizations\coordination.example.com\users\Admin@coordination.example.com\msp")
Normalize-AdminIdentity (Join-Path $fabricRoot "organizations\peerOrganizations\foreign.example.com\users\Admin@foreign.example.com\msp")

Write-Host "Generating channel artifacts..." -ForegroundColor Cyan
Invoke-FabricTools @(
  "configtxgen",
  "-profile", "NuclearWorkflowOrdererGenesis",
  "-channelID", "system-channel",
  "-outputBlock", "/workspace/channel-artifacts/genesis.block"
) | Out-Null

Invoke-FabricTools @(
  "configtxgen",
  "-profile", "RegulatoryWorkflowChannel",
  "-outputCreateChannelTx", "/workspace/channel-artifacts/$channelName.tx",
  "-channelID", $channelName
) | Out-Null

Invoke-FabricTools @(
  "configtxgen",
  "-profile", "RegulatoryWorkflowChannel",
  "-outputAnchorPeersUpdate", "/workspace/channel-artifacts/DomesticNuclearRegulatorMSPanchors.tx",
  "-channelID", $channelName,
  "-asOrg", "DomesticNuclearRegulatorMSP"
) | Out-Null

Invoke-FabricTools @(
  "configtxgen",
  "-profile", "RegulatoryWorkflowChannel",
  "-outputAnchorPeersUpdate", "/workspace/channel-artifacts/CoordinatingAuthorityMSPanchors.tx",
  "-channelID", $channelName,
  "-asOrg", "CoordinatingAuthorityMSP"
) | Out-Null

Invoke-FabricTools @(
  "configtxgen",
  "-profile", "RegulatoryWorkflowChannel",
  "-outputAnchorPeersUpdate", "/workspace/channel-artifacts/ForeignNuclearRegulatorMSPanchors.tx",
  "-channelID", $channelName,
  "-asOrg", "ForeignNuclearRegulatorMSP"
) | Out-Null

Write-Host "Starting orderer and peers..." -ForegroundColor Cyan
Invoke-DockerCommand @("compose", "-f", $composeFile, "up", "-d") | Out-Null
Start-Sleep -Seconds 8

Write-Host "Creating channel block..." -ForegroundColor Cyan
Invoke-PeerCli $orgs.domestic @(
  "peer",
  "channel",
  "create",
  "-o", "orderer.orderer.example.com:7050",
  "-c", $channelName,
  "-f", "/workspace/channel-artifacts/$channelName.tx",
  "--outputBlock", "/workspace/channel-artifacts/$channelName.block",
  "--tls",
  "--cafile", $ordererCaPath
) | Out-Null

Write-Host "Joining peers to channel..." -ForegroundColor Cyan
foreach ($orgKey in @("domestic", "coordination", "foreign")) {
  Invoke-PeerCli $orgs[$orgKey] @(
    "peer",
    "channel",
    "join",
    "-b", "/workspace/channel-artifacts/$channelName.block"
  ) | Out-Null
}

Write-Host "Updating anchor peers..." -ForegroundColor Cyan
foreach ($orgKey in @("domestic", "coordination", "foreign")) {
  Invoke-PeerCli $orgs[$orgKey] @(
    "peer",
    "channel",
    "update",
    "-o", "orderer.orderer.example.com:7050",
    "-c", $channelName,
    "-f", $orgs[$orgKey].AnchorTx,
    "--tls",
    "--cafile", $ordererCaPath
  ) | Out-Null
}

Write-Host "Packaging chaincode..." -ForegroundColor Cyan
Invoke-PeerCli $orgs.domestic @(
  "peer",
  "lifecycle",
  "chaincode",
  "package",
  "/workspace/channel-artifacts/$chaincodeName.tar.gz",
  "--path", "/workspace-chaincode",
  "--lang", "node",
  "--label", $chaincodeLabel
) -MountChaincode | Out-Null

Write-Host "Installing chaincode on peers..." -ForegroundColor Cyan
foreach ($orgKey in @("domestic", "coordination", "foreign")) {
  Invoke-PeerCli $orgs[$orgKey] @(
    "peer",
    "lifecycle",
    "chaincode",
    "install",
    "/workspace/channel-artifacts/$chaincodeName.tar.gz"
  ) | Out-Null
}

Write-Host "Resolving installed chaincode package ID..." -ForegroundColor Cyan
$installedJson = Invoke-PeerCli $orgs.domestic @(
  "peer",
  "lifecycle",
  "chaincode",
  "queryinstalled",
  "--output",
  "json"
)
$installed = $installedJson | ConvertFrom-Json
$packageId = $installed.installed_chaincodes |
  Where-Object { $_.label -eq $chaincodeLabel } |
  Select-Object -ExpandProperty package_id -First 1

if (-not $packageId) {
  throw "Unable to resolve chaincode package ID for label '$chaincodeLabel'."
}

Write-Host "Approving chaincode definition for each org..." -ForegroundColor Cyan
foreach ($orgKey in @("domestic", "coordination", "foreign")) {
  Invoke-PeerCli $orgs[$orgKey] @(
    "peer",
    "lifecycle",
    "chaincode",
    "approveformyorg",
    "-o", "orderer.orderer.example.com:7050",
    "--channelID", $channelName,
    "--name", $chaincodeName,
    "--version", $chaincodeVersion,
    "--package-id", $packageId,
    "--sequence", $chaincodeSequence,
    "--signature-policy", $signaturePolicy,
    "--tls",
    "--cafile", $ordererCaPath
  ) | Out-Null
}

Write-Host "Checking commit readiness..." -ForegroundColor Cyan
Invoke-PeerCli $orgs.domestic @(
  "peer",
  "lifecycle",
  "chaincode",
  "checkcommitreadiness",
  "--channelID", $channelName,
  "--name", $chaincodeName,
  "--version", $chaincodeVersion,
  "--sequence", $chaincodeSequence,
  "--signature-policy", $signaturePolicy,
  "--output",
  "json"
) | Out-Null

Write-Host "Committing chaincode definition..." -ForegroundColor Cyan
Invoke-PeerCli $orgs.domestic @(
  "peer",
  "lifecycle",
  "chaincode",
  "commit",
  "-o", "orderer.orderer.example.com:7050",
  "--channelID", $channelName,
  "--name", $chaincodeName,
  "--version", $chaincodeVersion,
  "--sequence", $chaincodeSequence,
  "--signature-policy", $signaturePolicy,
  "--tls",
  "--cafile", $ordererCaPath,
  "--peerAddresses", "peer0.domestic.example.com:7051",
  "--tlsRootCertFiles", "/workspace/organizations/peerOrganizations/domestic.example.com/peers/peer0.domestic.example.com/tls/ca.crt",
  "--peerAddresses", "peer0.coordination.example.com:8051",
  "--tlsRootCertFiles", "/workspace/organizations/peerOrganizations/coordination.example.com/peers/peer0.coordination.example.com/tls/ca.crt",
  "--peerAddresses", "peer0.foreign.example.com:9051",
  "--tlsRootCertFiles", "/workspace/organizations/peerOrganizations/foreign.example.com/peers/peer0.foreign.example.com/tls/ca.crt"
) | Out-Null

Write-Host "Verifying committed definition..." -ForegroundColor Cyan
Invoke-PeerCli $orgs.domestic @(
  "peer",
  "lifecycle",
  "chaincode",
  "querycommitted",
  "--channelID", $channelName,
  "--name", $chaincodeName
) | Out-Null

Write-Host "Writing gateway connection profiles..." -ForegroundColor Cyan
Write-ConnectionProfile `
  -ProfilePath $orgs.domestic.ConnectionProfile `
  -ProfileName "domestic-gateway" `
  -OrganizationName $orgs.domestic.Name `
  -MspId $orgs.domestic.MspId `
  -PeerName $orgs.domestic.HostPeerAlias `
  -PeerUrl $orgs.domestic.HostPeerUrl `
  -PeerTlsCaPath $orgs.domestic.HostTlsCa `
  -PeerHostAlias $orgs.domestic.HostPeerAlias `
  -IdentityCertPath (Join-Path $orgs.domestic.HostAdminMsp "signcerts\cert.pem") `
  -IdentityKeyPath (Join-Path $orgs.domestic.HostAdminMsp "keystore\key.pem")

Write-ConnectionProfile `
  -ProfilePath $orgs.coordination.ConnectionProfile `
  -ProfileName "coordination-gateway" `
  -OrganizationName $orgs.coordination.Name `
  -MspId $orgs.coordination.MspId `
  -PeerName $orgs.coordination.HostPeerAlias `
  -PeerUrl $orgs.coordination.HostPeerUrl `
  -PeerTlsCaPath $orgs.coordination.HostTlsCa `
  -PeerHostAlias $orgs.coordination.HostPeerAlias `
  -IdentityCertPath (Join-Path $orgs.coordination.HostAdminMsp "signcerts\cert.pem") `
  -IdentityKeyPath (Join-Path $orgs.coordination.HostAdminMsp "keystore\key.pem")

Write-ConnectionProfile `
  -ProfilePath $orgs.foreign.ConnectionProfile `
  -ProfileName "foreign-gateway" `
  -OrganizationName $orgs.foreign.Name `
  -MspId $orgs.foreign.MspId `
  -PeerName $orgs.foreign.HostPeerAlias `
  -PeerUrl $orgs.foreign.HostPeerUrl `
  -PeerTlsCaPath $orgs.foreign.HostTlsCa `
  -PeerHostAlias $orgs.foreign.HostPeerAlias `
  -IdentityCertPath (Join-Path $orgs.foreign.HostAdminMsp "signcerts\cert.pem") `
  -IdentityKeyPath (Join-Path $orgs.foreign.HostAdminMsp "keystore\key.pem")

Write-Host ""
Write-Host "Fabric sandbox is ready." -ForegroundColor Green
Write-Host "Channel: $channelName"
Write-Host "Chaincode: $chaincodeName"
Write-Host "Connection profiles:"
Write-Host "  - $($orgs.domestic.ConnectionProfile)"
Write-Host "  - $($orgs.coordination.ConnectionProfile)"
Write-Host "  - $($orgs.foreign.ConnectionProfile)"
