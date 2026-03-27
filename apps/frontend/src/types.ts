import type {
  AssuranceCase,
  DocumentReference,
  WorkflowEventRecord,
} from "@prototype/shared";

export interface MetricSummaryRow {
  metricId: string;
  count: number;
  min: number;
  max: number;
  average: number;
  p50: number;
  p95: number;
}

export interface CaseCommandResponse {
  transactionId: string;
  caseRecord: AssuranceCase;
  event: WorkflowEventRecord;
}

export interface UploadDocumentResponse {
  transactionId: string;
  documentReference: DocumentReference;
}

export interface VerifyDocumentResponse {
  documentReference: DocumentReference;
  verified: boolean;
}

export interface IntegrationExchangeRecord {
  exchangeId: string;
  simulator: string;
  messageType: string;
  direction: string;
  status: string;
  caseId: string;
  correlationId: string;
  timestamp: string;
  details?: Record<string, string | number | boolean>;
}

export interface IntegrationExchangeSummary {
  totalExchanges: number;
  bySimulator: Record<string, number>;
  byStatus: Record<string, number>;
  byMessageType: Record<string, number>;
}
