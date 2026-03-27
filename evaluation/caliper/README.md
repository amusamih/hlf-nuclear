# Caliper Scaffold

This folder contains the first Caliper-oriented benchmark scaffold for the nuclear assurance sandbox.

It is intentionally limited to **ledger-level benchmarking**. Use it together with the scenario runner under `evaluation/scenario-runner` for full end-to-end evaluation.

## Included artifacts

- `benchmarks/workflow-benchmark.yaml`
  - initial benchmark-round definitions
- `networks/fabric-sandbox-network.yaml`
  - placeholder Fabric network profile aligned with the paper-1 topology
- `workloads/`
  - workload modules for case creation, document anchoring, and workflow transitions

## Important note

This is a **scaffold**, not a fully wired benchmark environment.

You will still need to adapt:

- crypto material paths
- connection profile paths
- channel name
- contract IDs as packaged on the final Fabric dev network
- any seed case IDs or seed document IDs used for transition rounds

The scaffold assumes the following chaincode contracts and function names:

- `CaseContract.createCase`
- `CaseContract.submitCase`
- `CaseContract.recordDomesticReview`
- `CaseContract.forwardToCoordination`
- `CaseContract.forwardToForeignAuthority`
- `CaseContract.recordForeignReview`
- `CaseContract.approveCase`
- `CaseContract.issueAssurance`
- `CaseContract.initiateSubstantiveAmendment`
- `CaseContract.amendAssurance`
- `CaseContract.rejectAmendment`
- `DocumentContract.addDocumentReference`
- `DocumentContract.updateDocumentVersion`

## Recommended use

1. Bring up the final Fabric dev network for the one-machine sandbox.
2. Seed the required pre-state for rounds that assume an existing case.
3. Run Caliper for ledger latency/throughput.
4. Run the scenario runner separately for end-to-end workflow timing and auditability.
