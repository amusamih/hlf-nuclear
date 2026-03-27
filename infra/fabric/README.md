# Fabric Sandbox

This folder contains the source configuration and scripts for the local Hyperledger Fabric
network used by the prototype.

It is a single-machine development sandbox, but it preserves the logical consortium shape
used by the implementation:

- `1` orderer organization with `1` orderer
- `3` member organizations:
  - `DomesticNuclearRegulatorMSP`
  - `CoordinatingAuthorityMSP`
  - `ForeignNuclearRegulatorMSP`
- `1` peer per member organization
- `1` application channel:
  - `regulatory-workflow-channel`
- `1` chaincode package:
  - `nuclear-assurance`

## What is tracked here

Tracked source assets:

- `config/crypto-config.yaml`
- `config/configtx.yaml`
- `docker/docker-compose.fabric.yaml`
- `scripts/up-network.ps1`
- `scripts/down-network.ps1`

Generated runtime artifacts are intentionally not tracked:

- `organizations/`
- `channel-artifacts/`
- `connection-profiles/`
- `state/`

These directories are recreated locally when the sandbox is started.

## Network lifecycle

Bring the sandbox up from the repository root with:

- `npm run fabric:up`

Tear it down with:

- `npm run fabric:down`

`up-network.ps1` performs the full local setup:

1. generates crypto material with `cryptogen`
2. generates genesis/channel artifacts with `configtxgen`
3. starts the orderer and peers with Docker Compose
4. creates and joins `regulatory-workflow-channel`
5. installs, approves, and commits the `nuclear-assurance` chaincode
6. writes gateway connection profiles for the backend and Caliper

`down-network.ps1` stops the containers and removes the generated runtime artifacts.

## Chaincode and channel settings

- Channel name: `regulatory-workflow-channel`
- Chaincode name: `nuclear-assurance`
- Chaincode version: `0.1.0`
- Signature policy:
  - `OutOf(2, 'DomesticNuclearRegulatorMSP.peer', 'CoordinatingAuthorityMSP.peer', 'ForeignNuclearRegulatorMSP.peer')`

The backend invocation planner uses this consortium model to route actions through the
appropriate organization identities for domestic, coordination, and foreign-side steps.

## Gateway usage

When the backend runs with `FABRIC_MODE=real`, it uses the generated gateway connection
profiles under `infra/fabric/connection-profiles`.

The local admin identities are used as gateway clients for the prototype:

- domestic-side actions -> `DomesticNuclearRegulatorMSP`
- coordination actions -> `CoordinatingAuthorityMSP`
- foreign-side actions -> `ForeignNuclearRegulatorMSP`

Applicants remain off-ledger and are represented through application-layer actions rather
than as Fabric member identities.

## Notes

- This sandbox does **not** run a separate Fabric CA service.
  Identity material is generated locally for the development environment.
- This sandbox is intended for reproducible local execution and evaluation, not production deployment.
