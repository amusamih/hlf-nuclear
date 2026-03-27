export interface MetricDefinition {
  metricId: string;
  category:
    | "functional"
    | "performance"
    | "security"
    | "auditability"
    | "interoperability"
    | "feasibility";
  description: string;
  unit: string;
}

export const METRICS: MetricDefinition[] = [
  {
    metricId: "case_creation_latency_ms",
    category: "performance",
    description: "Latency for draft creation and initial ledger anchoring.",
    unit: "milliseconds",
  },
  {
    metricId: "transition_latency_ms",
    category: "performance",
    description: "Per-transition processing time across backend, ledger, and projection path.",
    unit: "milliseconds",
  },
  {
    metricId: "scenario_end_to_end_ms",
    category: "performance",
    description: "Total scenario execution time from submission to terminal state.",
    unit: "milliseconds",
  },
  {
    metricId: "fabric_invoke_latency_ms",
    category: "performance",
    description: "Time spent invoking the ledger transaction path or its local relay equivalent.",
    unit: "milliseconds",
  },
  {
    metricId: "document_anchor_latency_ms",
    category: "performance",
    description: "Time to store, hash, and anchor a document reference.",
    unit: "milliseconds",
  },
  {
    metricId: "document_integrity_verification_ms",
    category: "security",
    description: "Time to verify an off-chain object against the on-chain SHA-256 reference.",
    unit: "milliseconds",
  },
  {
    metricId: "transaction_success_count",
    category: "functional",
    description: "Count of successful workflow transactions.",
    unit: "count",
  },
  {
    metricId: "transaction_failure_count",
    category: "functional",
    description: "Count of failed workflow transactions.",
    unit: "count",
  },
  {
    metricId: "access_denied_count",
    category: "security",
    description: "Count of unauthorized actions blocked by backend or chaincode.",
    unit: "count",
  },
  {
    metricId: "document_hash_mismatch_count",
    category: "security",
    description: "Count of retrieval-integrity mismatches detected against on-chain hashes.",
    unit: "count",
  },
  {
    metricId: "audit_reconstruction_ms",
    category: "auditability",
    description: "Time to reconstruct a deterministic case timeline for auditors.",
    unit: "milliseconds",
  },
  {
    metricId: "integration_exchange_failure_count",
    category: "interoperability",
    description: "Failures across domestic-emulator and foreign-simulator exchanges.",
    unit: "count",
  },
  {
    metricId: "integration_exchange_success_count",
    category: "interoperability",
    description: "Successful domestic-emulator and foreign-simulator exchanges.",
    unit: "count",
  },
  {
    metricId: "domestic_intake_latency_ms",
    category: "interoperability",
    description: "Time to validate and ingest a domestic emulator handoff into the workflow backend.",
    unit: "milliseconds",
  },
  {
    metricId: "foreign_simulator_exchange_latency_ms",
    category: "interoperability",
    description: "Time to process foreign simulator acknowledgements or decisions.",
    unit: "milliseconds",
  },
  {
    metricId: "status_sync_generation_ms",
    category: "interoperability",
    description: "Time to generate a domestic-facing status synchronization message from current case state.",
    unit: "milliseconds",
  },
  {
    metricId: "schema_validation_failure_count",
    category: "interoperability",
    description: "Count of simulator messages rejected due to schema or semantic validation failures.",
    unit: "count",
  },
  {
    metricId: "manual_handoffs_removed",
    category: "feasibility",
    description: "Estimated manual reconciliation or forwarding handoffs removed versus baseline.",
    unit: "count",
  },
];
