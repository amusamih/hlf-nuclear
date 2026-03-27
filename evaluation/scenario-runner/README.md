# Scenario Runner

This package drives the backend over HTTP and captures end-to-end workflow evidence that Caliper does not cover.

## Current scenarios

- `normal-approval-fuel-shipment`
- `substantive-amendment-post-issuance`
- `non-substantive-amendment-post-issuance`

## Usage

Assuming the backend is running on `http://localhost:3000/api`:

```powershell
node dist/index.js list
node dist/index.js normal-approval-fuel-shipment
node dist/index.js substantive-amendment-post-issuance
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

The runner also posts `scenario_end_to_end_ms` back to the backend metric store so the scenario duration becomes part of the unified evaluation evidence.
