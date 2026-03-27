# Fabric Integration Notes

This folder now contains the runnable Hyperledger Fabric dev-network assets for the first-paper sandbox, along with the gateway configuration expected by the backend and Caliper.

## Paper-1 network shape

- `1` orderer org with `1` orderer
- `3` member orgs:
  - `DomesticNuclearRegulatorMSP`
  - `CoordinatingAuthorityMSP`
  - `ForeignNuclearRegulatorMSP`
- `1` peer per member org
- `1` main channel:
  - `regulatory-workflow-channel`
- `1` chaincode package:
  - `nuclear-assurance`

## Contract surface expected by the backend

The backend relay layer now maps its write operations directly to these contract names and transaction names:

- `CaseContract`
  - `createCase`
  - `submitCase`
  - `recordDomesticReview`
  - `requestMoreInformation`
  - `respondToInformationRequest`
  - `forwardToCoordination`
  - `forwardToForeignAuthority`
  - `recordForeignReview`
  - `approveCase`
  - `rejectCase`
  - `issueAssurance`
  - `initiateNonSubstantiveAmendment`
  - `initiateSubstantiveAmendment`
  - `amendAssurance`
  - `rejectAmendment`
  - `revokeAssurance`
  - `closeCase`
- `DocumentContract`
  - `addDocumentReference`
  - `updateDocumentVersion`
  - `deactivateDocument`
  - `getDocumentReference`
  - `listCaseDocuments`
  - `listActiveCaseDocuments`

## Gateway model

Applicant-originated actions remain off-ledger and are relayed through a regulator-controlled gateway identity:

- applicant and domestic actions:
  - backend uses `DomesticNuclearRegulatorMSP`
- coordination actions:
  - backend uses `CoordinatingAuthorityMSP`
- foreign actions:
  - backend uses `ForeignNuclearRegulatorMSP`

This keeps the prototype compatible in principle with a real Fabric gateway setup without making applicant users network members.

## Runtime inputs used by the backend

The backend supports two modes:

- `FABRIC_MODE=simulated`
  - keeps the original local relay behavior
- `FABRIC_MODE=real`
  - uses the generated gateway connection profiles under `infra/fabric/connection-profiles`

Optional overrides:

- `FABRIC_CHANNEL_NAME`
- `FABRIC_CHAINCODE_NAME`
- `FABRIC_CONNECTION_PROFILE_DOMESTIC`
- `FABRIC_CONNECTION_PROFILE_COORDINATION`
- `FABRIC_CONNECTION_PROFILE_FOREIGN`

## Local run order

1. Build the shared package and chaincode bundle.
2. Run `npm run fabric:up`.
3. Start the backend with `FABRIC_MODE=real`.
4. Run the scenario runner and Caliper against the live sandbox.

The `up-network.ps1` script generates:

- crypto material under `infra/fabric/organizations`
- channel artifacts under `infra/fabric/channel-artifacts`
- connection profiles under `infra/fabric/connection-profiles`
- local peer/orderer state under `infra/fabric/state`

## Endorsement intent

The backend invocation planner already tags each write with the paper-1 endorsement lane so a real gateway implementation can later translate it into state-based endorsement or explicit endorsement selection logic:

- domestic/coordinating lane:
  - `DomesticNuclearRegulatorMSP`
  - `CoordinatingAuthorityMSP`
- coordination/foreign lane:
  - `CoordinatingAuthorityMSP`
  - `ForeignNuclearRegulatorMSP`
