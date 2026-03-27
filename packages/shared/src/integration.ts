import type { CreateAssuranceCaseInput, DocumentReference } from "./domain.js";
import type { DocumentType } from "./documents.js";

export const INTEGRATION_SCHEMA_VERSION = "v1";

export type SimulatorName = "domestic_emulator" | "foreign_simulator";
export type ExchangeDirection = "inbound" | "outbound" | "generated";
export type ExchangeStatus = "accepted" | "applied" | "generated" | "rejected";
export type ForeignDecision = "approved" | "rejected" | "more_information_requested";

export interface IntegrationEnvelope {
  messageId: string;
  schemaVersion: string;
  timestamp: string;
  correlationId: string;
  caseId: string;
}

export interface IntegrationDocumentManifestEntry {
  documentId: string;
  documentType: DocumentType;
  sha256Hash?: string;
  fileName: string;
  mimeType: string;
  classification: DocumentReference["classification"];
  accessScope?: string[];
  contentBase64?: string;
}

export interface DomesticIntakeMessage extends IntegrationEnvelope {
  sourceSystem: "domestic-intake-emulator";
  applicant: {
    applicantOrgId: string;
    applicantOrgName: string;
  };
  caseDraft: Omit<CreateAssuranceCaseInput, "caseId" | "caseNumber" | "applicantOrgId" | "applicantOrgName">;
  documentManifest: IntegrationDocumentManifestEntry[];
  autoSubmit?: boolean;
}

export interface DomesticStatusSyncMessage extends IntegrationEnvelope {
  externalCaseRef?: string;
  state: string;
  substate?: string;
  reasonCode?: string | null;
}

export interface ForeignForwardingMessage extends IntegrationEnvelope {
  originatingAuthority: "coordinating_authority";
  destinationAuthority: "foreign_nuclear_regulator";
  caseSummary: {
    caseNumber: string;
    itemCategory: string;
    quantity: number;
    originJurisdiction: string;
    destinationJurisdiction: string;
    intendedUse: string;
  };
  documentManifest: IntegrationDocumentManifestEntry[];
  responseDueAt: string;
}

export interface ForeignAcknowledgementMessage extends IntegrationEnvelope {
  status: "acknowledged";
}

export interface ForeignDecisionMessage extends IntegrationEnvelope {
  decision: ForeignDecision;
  justification: string;
}

export interface IntegrationExchangeRecord {
  exchangeId: string;
  simulator: SimulatorName;
  messageType: string;
  direction: ExchangeDirection;
  status: ExchangeStatus;
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
