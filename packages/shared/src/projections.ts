import type {
  AssuranceCase,
  DocumentReference,
  WorkflowEventRecord,
} from "./domain.js";

export type ProjectionSyncStatus =
  | "in_sync"
  | "pending_projection"
  | "drift_detected"
  | "rebuild_required"
  | "rebuilding"
  | "error";

export interface LedgerReference {
  transactionId: string;
  actionId?: string;
  auditSequenceNumber?: number;
  channelName: string;
  chaincodeName: string;
  transactionName: string;
  correlationId?: string;
  committedAt: string;
  gatewayOrganization: string;
  projectionUpdatedAt: string;
  projectionSyncStatus: ProjectionSyncStatus;
  blockNumber?: number;
  chaincodeEventName?: string;
  validationCode?: string;
  endorsingOrganizations?: string[];
}

export interface CaseProjection extends AssuranceCase {
  lastLedgerReference: LedgerReference;
  lastReconciledAt?: string;
}

export interface DocumentProjection extends DocumentReference {
  lastLedgerReference: LedgerReference;
  lastReconciledAt?: string;
}

export interface EventProjection extends WorkflowEventRecord {
  ledgerReference: LedgerReference;
}

export interface ProjectionCheckpoint {
  consumerName: string;
  lastProcessedBlockNumber?: number;
  lastProcessedTransactionId?: string;
  lastProcessedTimestamp?: string;
  status: ProjectionSyncStatus;
}

export interface ReconciliationRunRecord {
  runId: string;
  scope: "lightweight" | "full";
  startedAt: string;
  finishedAt?: string;
  checkedCases: number;
  mismatchCount: number;
  repairedCaseIds: string[];
  status: "running" | "completed" | "failed";
}
