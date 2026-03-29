# Scenario Runner

This package drives the backend over HTTP and captures end-to-end workflow evidence that Caliper does not cover.

## Current scenarios

- `normal-approval-fuel-shipment`
- `more-info-loop`
- `rejection-missing-documents`
- `substantive-amendment-post-issuance`
- `non-substantive-amendment-post-issuance`
- `revocation`
- `unauthorized-attempt`
- `missing-document-path`
- `invalid-transition-attempt`

## Usage

Assuming the backend is running on `http://localhost:3000/api`:

```powershell
node dist/index.js list
node dist/index.js normal-approval-fuel-shipment
node dist/index.js substantive-amendment-post-issuance
node dist/index.js all
node dist/index.js archive
```

You can override the backend base URL with:

```powershell
$env:BACKEND_BASE_URL='http://localhost:3000/api'
```

## What it records

- scenario terminal state
- end-to-end duration
- audit timeline size
- document integrity verification outcome
- backend metric summary snapshot after the scenario completes
- ordered per-step lifecycle trace, including workflow actions and document uploads

The runner also posts `scenario_end_to_end_ms` back to the backend metric store so the scenario duration becomes part of the unified evaluation evidence.

## Stored outputs

Running `node dist/index.js all` writes:

- `results/full-functional-suite.json`
- `results/lifecycle-traces/<scenario-id>.json`
- `results/lifecycle-traces/<scenario-id>.md`
- `results/lifecycle-traces/scenario-index.csv`
- `results/lifecycle-traces/README.md`

Running `node dist/index.js archive` rebuilds the per-scenario trace archive from an
existing `results/full-functional-suite.json` file without rerunning the backend scenarios.

The archive covers all implemented evaluation scenarios in this package. It should not be
described as an exhaustive enumeration of every theoretical workflow permutation.
