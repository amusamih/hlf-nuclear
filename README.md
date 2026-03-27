# Cross-Border Nuclear Authorization Platform

This repository contains the implementation of a prototype platform for managing cross-border nuclear authorization workflows with:

- a React web portal
- a NestJS backend
- a permissioned Hyperledger Fabric network
- PostgreSQL for operational projections and reporting
- MinIO for off-chain document storage
- evaluation harnesses for functional, interoperability, and benchmark runs

The prototype is designed around a document-heavy, multi-organization regulatory workflow in which the blockchain layer maintains the authoritative workflow state and audit trail, while application services manage portal interaction, document handling, reporting views, and external-system integration.

## Implementation Scope

The current implementation covers:

- applicant case submission and document intake
- domestic review initiation and progression
- coordination and foreign-authority forwarding
- foreign review, approval, and rejection paths
- additional-information loops
- issuance, amendment, revocation, and closure handling
- off-chain document storage with on-chain anchoring
- read-model projection into PostgreSQL
- benchmark and validation tooling

## Repository Structure

- `apps/backend`
  NestJS backend with case, document, Fabric, storage, projection, simulator, metrics, and benchmark-seeding modules.

- `apps/frontend`
  React + Vite web portal for the prototype user interface.

- `packages/shared`
  Shared workflow types, document taxonomy, permissions, transition definitions, and common models used across the backend, chaincode, and evaluation tooling.

- `smart-contracts/chaincode`
  Hyperledger Fabric smart contracts for workflow state transitions and document anchoring.

- `infra`
  Local development infrastructure, including:
  - `docker-compose.dev.yml` for PostgreSQL and MinIO
  - `fabric/scripts/up-network.ps1`
  - `fabric/scripts/down-network.ps1`

- `evaluation/scenario-runner`
  End-to-end scenario execution harness.

- `evaluation/interoperability-runner`
  Interoperability validation runner for domestic/foreign exchange paths.

- `evaluation/caliper`
  Hyperledger Caliper benchmarks for ledger-oriented latency and throughput testing.

- `evaluation/companion-evidence`
  Tracked paper-support validation artifacts such as blocked-path evidence and interoperability traces.

## Local Runtime Model

The prototype runs as a local multi-service environment:

- backend service
- frontend service
- PostgreSQL
- MinIO
- Hyperledger Fabric ordering and peer services

Although these services can run on a single machine for development, they remain logically separated in the architecture.

## Prerequisites

You should have the following available:

- Node.js and npm
- Docker / Docker Desktop
- PowerShell

For the Fabric network and Caliper runs, Docker must be running.

## Quick Start

### 1. Install workspace dependencies

```powershell
npm install
```

### 2. Build shared and implementation packages

```powershell
npm run build:shared
npm run build:chaincode
npm run build:backend
npm run build --workspace @prototype/frontend
```

### 3. Start PostgreSQL and MinIO

```powershell
docker compose -f infra/docker-compose.dev.yml up -d
```

### 4. Start the Fabric development network

```powershell
npm run fabric:up
```

To shut it down later:

```powershell
npm run fabric:down
```

### 5. Start the backend

```powershell
npm run dev:backend
```

### 6. Start the frontend

```powershell
npm run dev:frontend
```

## Useful Build and Run Commands

```powershell
npm run build
npm run build:shared
npm run build:chaincode
npm run build:backend
npm run dev:backend
npm run dev:frontend
```

Backend benchmark seeding:

```powershell
npm run seed:benchmark --workspace @prototype/backend
```

## Evaluation Tooling

### Scenario Runner

Build:

```powershell
npm run build --workspace @prototype/scenario-runner
```

Run:

```powershell
npm run run --workspace @prototype/scenario-runner
```

### Interoperability Runner

The interoperability runner is implemented as:

- `evaluation/interoperability-runner/run-interoperability-validation.mjs`

It is used to exercise domestic/foreign integration-style exchange paths through the prototype.

### Caliper Benchmarks

Caliper benchmark definitions are under:

- `evaluation/caliper/benchmarks`

Important benchmark commands:

```powershell
npm run bench:create-case --workspace @prototype/caliper
npm run bench:workflow:smoke --workspace @prototype/caliper
npm run bench:workflow --workspace @prototype/caliper
npm run bench:workflow:paper --workspace @prototype/caliper
npm run bench:workflow:rate-sweep --workspace @prototype/caliper
```

Caliper network configuration and workload modules are under:

- `evaluation/caliper/networks`
- `evaluation/caliper/workloads`

Companion evidence referenced by the paper is tracked under:

- `evaluation/companion-evidence`

## Persistence and Trust Boundaries

- **PostgreSQL**
  stores operational projections, queues, summaries, audit views, and reporting data.

- **MinIO**
  stores document files, versions, and retrieval metadata.

- **Hyperledger Fabric**
  stores the authoritative workflow state, transition history, and anchored document references/hashes.

The application layer bridges these parts so that day-to-day operations use fast projections while trust-critical verification remains grounded in the permissioned blockchain ledger.
