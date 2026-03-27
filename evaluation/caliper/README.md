# Caliper Benchmarks

This folder contains the Hyperledger Caliper benchmark configurations used to measure
ledger-level performance for the implemented cross-border nuclear authorization prototype.

These benchmarks target the live Fabric sandbox under [`infra/fabric`](../../infra/fabric)
and are complementary to:

- [`evaluation/scenario-runner`](../scenario-runner) for end-to-end workflow validation
- [`evaluation/interoperability-runner`](../interoperability-runner) for integration-path validation

## Included benchmark profiles

- `benchmarks/create-case-only.yaml`
  - focused draft-case creation benchmark
- `benchmarks/workflow-smoke.yaml`
  - low-scale sanity check for a representative workflow mix
- `benchmarks/workflow-benchmark.yaml`
  - broader workflow benchmark retained for exploratory runs
- `benchmarks/workflow-benchmark-paper.yaml`
  - paper-facing benchmark profile used for the summarized latency and throughput results
- `benchmarks/workflow-rate-sweep.yaml`
  - fixed-rate sweep used to generate throughput/latency curves across send rates

## Network profile

- `networks/fabric-sandbox-network.yaml`
  - Caliper network definition for the local Fabric sandbox
  - references the generated connection profiles and admin identities written by
    `infra/fabric/scripts/up-network.ps1`

## Workload modules

- `workloads/create-case.js`
- `workloads/document-anchor.js`
- `workloads/document-version.js`
- `workloads/transition-state.js`

These workloads exercise the deployed `CaseContract` and `DocumentContract` interfaces
on the `regulatory-workflow-channel`.

## Prerequisites

1. Install workspace dependencies from the repository root.
2. Build the shared package and chaincode bundle.
3. Start the Fabric sandbox with `npm run fabric:up`.
4. Ensure the benchmark seed namespace referenced by the selected YAML profile exists.

The benchmark configurations used for the recorded paper runs assume pre-seeded case and
document data for namespaces such as `benchpaper2` and `benchsweep3`.

## Commands

Run from the repository root:

- `npm run bench:create-case --workspace @prototype/caliper`
- `npm run bench:workflow:smoke --workspace @prototype/caliper`
- `npm run bench:workflow --workspace @prototype/caliper`
- `npm run bench:workflow:paper --workspace @prototype/caliper`
- `npm run bench:workflow:rate-sweep --workspace @prototype/caliper`

## Output

Caliper writes a local HTML report to:

- `evaluation/caliper/report.html`

That report is runtime output and is intentionally not tracked in Git.

## Scope and intent

These benchmarks measure ledger-facing behavior such as:

- average latency
- achieved throughput
- success/failure under controlled load

They do not replace the higher-level validation flows, which are captured by the
scenario runner and interoperability runner.
