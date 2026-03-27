import { Buffer } from "node:buffer";
import type {
  AssuranceCase,
  DocumentReference,
  DocumentType,
  UserClaims,
} from "@prototype/shared";
import {
  APPLICANT_ACTOR,
  COORDINATION_ACTOR,
  DOMESTIC_ACTOR,
  FOREIGN_ACTOR,
} from "./actors.js";
import { BackendClient, type MetricSummary } from "./client.js";

export interface ScenarioStep {
  step: string;
  state?: string;
  transactionId?: string;
  documentId?: string;
  outcome?: "success" | "blocked";
  message?: string;
}

export interface ExpectedFailureEvidence {
  step: string;
  message: string;
}

export interface ScenarioRunResult {
  scenarioId: string;
  caseId: string;
  terminalState: string;
  caseStateAfterScenario: string;
  durationMs: number;
  auditEventCount: number;
  verifiedDocuments: string[];
  metricsSummary: MetricSummary[];
  steps: ScenarioStep[];
  expectedFailure?: ExpectedFailureEvidence;
}

interface ScenarioContext {
  client: BackendClient;
  steps: ScenarioStep[];
}

interface CaseArtifacts {
  caseRecord: AssuranceCase;
  documentIds: Map<DocumentType, string>;
}

export interface EvaluationScenarioDefinition {
  scenarioId: string;
  label: string;
  run(client: BackendClient): Promise<ScenarioRunResult>;
}

const DEFAULT_CASE_PAYLOAD = {
  applicantOrgId: APPLICANT_ACTOR.organizationId,
  applicantOrgName: "Applicant Organization A",
  itemCategory: "fresh_fuel_component",
  itemDescription: "Unirradiated fuel assembly shipment request",
  quantity: 2,
  originJurisdiction: "Jurisdiction-A",
  destinationJurisdiction: "Jurisdiction-B",
  intendedUse: "peaceful_nuclear_power_generation",
  legalTreatyBasis: "applicable-bilateral-assurance-arrangement",
  priority: "routine" as const,
  remarksSummary: "Synthetic scenario generated for backend evaluation.",
};

const MINIMAL_SUBMISSION_DOCUMENT_TYPES: readonly DocumentType[] = [
  "assurance_application_form",
  "item_technical_specification",
  "end_use_declaration",
];

const FULL_SUBMISSION_DOCUMENT_TYPES: readonly DocumentType[] = [
  ...MINIMAL_SUBMISSION_DOCUMENT_TYPES,
  "supporting_correspondence",
  "transport_authorization",
  "package_design_certificate",
];

function buildContentBase64(
  caseId: string,
  documentType: DocumentType,
  label: string,
): string {
  return Buffer.from(
    [
      `caseId=${caseId}`,
      `documentType=${documentType}`,
      `label=${label}`,
      `generatedAt=${new Date().toISOString()}`,
    ].join("\n"),
    "utf8",
  ).toString("base64");
}

function defaultAccessScope(documentType: DocumentType): string[] {
  switch (documentType) {
    case "coordination_forwarding_package":
    case "foreign_regulator_response":
      return [
        "domestic_regulator",
        "coordinating_authority",
        "foreign_regulator",
        "auditor_body",
      ];
    case "assurance_instrument":
      return [
        "applicant_organization",
        "domestic_regulator",
        "coordinating_authority",
        "foreign_regulator",
        "auditor_body",
      ];
    default:
      return [
        "applicant_organization",
        "domestic_regulator",
        "coordinating_authority",
        "auditor_body",
      ];
  }
}

async function uploadDocument(
  context: ScenarioContext,
  actor: UserClaims,
  caseId: string,
  documentType: DocumentType,
  label: string,
  supersedesDocumentId?: string,
): Promise<DocumentReference> {
  const uploadResult = await context.client.uploadDocument({
    actor,
    caseId,
    documentType,
    fileName: `${documentType}.txt`,
    mimeType: "text/plain",
    classification: "restricted",
    accessScope: defaultAccessScope(documentType),
    contentBase64: buildContentBase64(caseId, documentType, label),
    supersedesDocumentId,
  });

  context.steps.push({
    step: `upload:${documentType}`,
    documentId: uploadResult.documentReference.documentId,
    transactionId: uploadResult.transactionId,
    outcome: "success",
  });

  return uploadResult.documentReference;
}

function requireDocumentId(
  documentIds: Map<DocumentType, string>,
  documentType: DocumentType,
): string {
  const documentId = documentIds.get(documentType);
  if (!documentId) {
    throw new Error(`Scenario is missing document "${documentType}".`);
  }

  return documentId;
}

async function expectScenarioFailure(
  context: ScenarioContext,
  step: string,
  operation: () => Promise<unknown>,
  caseId: string,
  validation?: (message: string) => boolean,
): Promise<ExpectedFailureEvidence> {
  try {
    await operation();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "unknown_expected_failure";
    if (validation && !validation(message)) {
      throw error;
    }

    const caseRecord = await context.client.getCase(caseId);
    context.steps.push({
      step,
      state: caseRecord.currentState,
      outcome: "blocked",
      message,
    });

    return { step, message };
  }

  throw new Error(`Scenario step "${step}" was expected to fail but succeeded.`);
}

async function createDraftWithDocuments(
  context: ScenarioContext,
  documentTypes: readonly DocumentType[],
  label: string,
): Promise<CaseArtifacts> {
  const documentIds = new Map<DocumentType, string>();
  const draft = await context.client.createDraft(APPLICANT_ACTOR, DEFAULT_CASE_PAYLOAD);
  const caseId = draft.caseRecord.caseId;
  context.steps.push({
    step: "create_draft",
    state: draft.caseRecord.currentState,
    transactionId: draft.transactionId,
    outcome: "success",
  });

  for (const documentType of documentTypes) {
    const documentReference = await uploadDocument(
      context,
      APPLICANT_ACTOR,
      caseId,
      documentType,
      label,
    );
    documentIds.set(documentType, documentReference.documentId);
  }

  return {
    caseRecord: draft.caseRecord,
    documentIds,
  };
}

async function buildSubmittedBaseline(
  context: ScenarioContext,
  documentTypes: readonly DocumentType[] = FULL_SUBMISSION_DOCUMENT_TYPES,
  justification = "Applicant submits a complete synthetic assurance request package.",
): Promise<CaseArtifacts> {
  const { caseRecord, documentIds } = await createDraftWithDocuments(
    context,
    documentTypes,
    "baseline submission bundle",
  );
  const caseId = caseRecord.caseId;
  const submitted = await context.client.submitCase(
    caseId,
    APPLICANT_ACTOR,
    justification,
    Array.from(documentIds.values()),
  );
  context.steps.push({
    step: "submit_case",
    state: submitted.caseRecord.currentState,
    transactionId: submitted.transactionId,
    outcome: "success",
  });

  return {
    caseRecord: submitted.caseRecord,
    documentIds,
  };
}

async function buildUnderDomesticReviewBaseline(
  context: ScenarioContext,
  documentTypes: readonly DocumentType[] = FULL_SUBMISSION_DOCUMENT_TYPES,
): Promise<CaseArtifacts> {
  const { caseRecord, documentIds } = await buildSubmittedBaseline(
    context,
    documentTypes,
  );
  const domesticReview = await context.client.transitionCase(
    caseRecord.caseId,
    DOMESTIC_ACTOR,
    "record_domestic_review",
    "Domestic regulator accepts the case into active review.",
  );
  context.steps.push({
    step: "record_domestic_review",
    state: domesticReview.caseRecord.currentState,
    transactionId: domesticReview.transactionId,
    outcome: "success",
  });

  return {
    caseRecord: domesticReview.caseRecord,
    documentIds,
  };
}

async function buildUnderForeignReviewBaseline(
  context: ScenarioContext,
): Promise<CaseArtifacts> {
  const { caseRecord, documentIds } = await buildUnderDomesticReviewBaseline(
    context,
  );
  const caseId = caseRecord.caseId;

  const coordinationQueue = await context.client.transitionCase(
    caseId,
    DOMESTIC_ACTOR,
    "forward_to_coordination",
    "Domestic regulator endorses the case for cross-border coordination.",
  );
  context.steps.push({
    step: "forward_to_coordination",
    state: coordinationQueue.caseRecord.currentState,
    transactionId: coordinationQueue.transactionId,
    outcome: "success",
  });

  const forwardingPacket = await uploadDocument(
    context,
    COORDINATION_ACTOR,
    caseId,
    "coordination_forwarding_package",
    "forwarding packet for foreign review",
  );
  documentIds.set(
    "coordination_forwarding_package",
    forwardingPacket.documentId,
  );

  const forwarded = await context.client.transitionCase(
    caseId,
    COORDINATION_ACTOR,
    "forward_to_foreign_authority",
    "Coordinating authority forwards the case to the foreign counterpart.",
    [forwardingPacket.documentId],
  );
  context.steps.push({
    step: "forward_to_foreign_authority",
    state: forwarded.caseRecord.currentState,
    transactionId: forwarded.transactionId,
    outcome: "success",
  });

  const foreignReview = await context.client.transitionCase(
    caseId,
    FOREIGN_ACTOR,
    "record_foreign_review",
    "Foreign regulator acknowledges receipt and starts review.",
  );
  context.steps.push({
    step: "record_foreign_review",
    state: foreignReview.caseRecord.currentState,
    transactionId: foreignReview.transactionId,
    outcome: "success",
  });

  return {
    caseRecord: foreignReview.caseRecord,
    documentIds,
  };
}

async function buildIssuedBaseline(
  context: ScenarioContext,
): Promise<CaseArtifacts> {
  const { caseRecord, documentIds } = await buildUnderForeignReviewBaseline(
    context,
  );
  const caseId = caseRecord.caseId;

  const foreignResponse = await uploadDocument(
    context,
    FOREIGN_ACTOR,
    caseId,
    "foreign_regulator_response",
    "foreign approval response",
  );
  documentIds.set("foreign_regulator_response", foreignResponse.documentId);

  const approved = await context.client.transitionCase(
    caseId,
    FOREIGN_ACTOR,
    "approve_case",
    "Foreign regulator approves the forwarded case.",
    [foreignResponse.documentId],
  );
  context.steps.push({
    step: "approve_case",
    state: approved.caseRecord.currentState,
    transactionId: approved.transactionId,
    outcome: "success",
  });

  const assuranceInstrument = await uploadDocument(
    context,
    COORDINATION_ACTOR,
    caseId,
    "assurance_instrument",
    "initial assurance instrument",
  );
  documentIds.set("assurance_instrument", assuranceInstrument.documentId);

  const issued = await context.client.transitionCase(
    caseId,
    COORDINATION_ACTOR,
    "issue_assurance",
    "Coordinating authority issues the initial assurance instrument.",
    [assuranceInstrument.documentId],
  );
  context.steps.push({
    step: "issue_assurance",
    state: issued.caseRecord.currentState,
    transactionId: issued.transactionId,
    outcome: "success",
  });

  return {
    caseRecord: issued.caseRecord,
    documentIds,
  };
}

interface FinalizeScenarioOptions {
  terminalStateOverride?: string;
  expectedFailure?: ExpectedFailureEvidence;
}

async function finalizeScenario(
  context: ScenarioContext,
  scenarioId: string,
  caseId: string,
  startedAt: number,
  verifiedDocumentIds: string[],
  options: FinalizeScenarioOptions = {},
): Promise<ScenarioRunResult> {
  const caseRecord = await context.client.getCase(caseId);
  const durationMs = Date.now() - startedAt;
  const terminalState = options.terminalStateOverride ?? caseRecord.currentState;
  await context.client.recordMetric({
    metricId: "scenario_end_to_end_ms",
    value: durationMs,
    caseId,
    metadata: {
      scenarioId,
      terminalState,
    },
  });
  const auditTimeline = await context.client.getAuditTimeline(caseId);
  const metricsSummary = await context.client.getMetricSummary(caseId);

  return {
    scenarioId,
    caseId,
    terminalState,
    caseStateAfterScenario: caseRecord.currentState,
    durationMs,
    auditEventCount: auditTimeline.length,
    verifiedDocuments: verifiedDocumentIds,
    metricsSummary,
    steps: context.steps,
    expectedFailure: options.expectedFailure,
  };
}

async function runNormalApprovalScenario(
  client: BackendClient,
): Promise<ScenarioRunResult> {
  const startedAt = Date.now();
  const context: ScenarioContext = { client, steps: [] };
  const { caseRecord, documentIds } = await buildIssuedBaseline(context);
  const assuranceInstrumentId = requireDocumentId(
    documentIds,
    "assurance_instrument",
  );
  const verification = await context.client.verifyDocument(assuranceInstrumentId);
  if (!verification.verified) {
    throw new Error("Initial assurance instrument failed integrity verification.");
  }

  return finalizeScenario(
    context,
    "normal-approval-fuel-shipment",
    caseRecord.caseId,
    startedAt,
    [assuranceInstrumentId],
  );
}

async function runMoreInformationLoopScenario(
  client: BackendClient,
): Promise<ScenarioRunResult> {
  const startedAt = Date.now();
  const context: ScenarioContext = { client, steps: [] };
  const { caseRecord, documentIds } = await buildUnderForeignReviewBaseline(
    context,
  );
  const caseId = caseRecord.caseId;

  const requestNotice = await uploadDocument(
    context,
    FOREIGN_ACTOR,
    caseId,
    "request_for_information_notice",
    "foreign regulator requests additional clarification",
  );
  documentIds.set("request_for_information_notice", requestNotice.documentId);

  const requested = await context.client.transitionCase(
    caseId,
    FOREIGN_ACTOR,
    "request_more_information",
    "Foreign regulator requests additional package-handling clarification.",
    [requestNotice.documentId],
  );
  context.steps.push({
    step: "request_more_information",
    state: requested.caseRecord.currentState,
    transactionId: requested.transactionId,
    outcome: "success",
  });

  const responsePackage = await uploadDocument(
    context,
    APPLICANT_ACTOR,
    caseId,
    "response_to_information_package",
    "applicant response to foreign regulator clarification request",
  );
  documentIds.set("response_to_information_package", responsePackage.documentId);

  const responded = await context.client.transitionCase(
    caseId,
    APPLICANT_ACTOR,
    "respond_to_information_request",
    "Applicant provides additional clarification and supporting explanation.",
    [responsePackage.documentId],
  );
  context.steps.push({
    step: "respond_to_information_request",
    state: responded.caseRecord.currentState,
    transactionId: responded.transactionId,
    outcome: "success",
  });

  const foreignResponse = await uploadDocument(
    context,
    FOREIGN_ACTOR,
    caseId,
    "foreign_regulator_response",
    "foreign approval response after information loop",
  );
  documentIds.set("foreign_regulator_response", foreignResponse.documentId);

  const approved = await context.client.transitionCase(
    caseId,
    FOREIGN_ACTOR,
    "approve_case",
    "Foreign regulator approves the case after reviewing the supplemental response.",
    [foreignResponse.documentId],
  );
  context.steps.push({
    step: "approve_case_after_more_info",
    state: approved.caseRecord.currentState,
    transactionId: approved.transactionId,
    outcome: "success",
  });

  const assuranceInstrument = await uploadDocument(
    context,
    COORDINATION_ACTOR,
    caseId,
    "assurance_instrument",
    "assurance instrument issued after information loop",
  );
  documentIds.set("assurance_instrument", assuranceInstrument.documentId);

  const issued = await context.client.transitionCase(
    caseId,
    COORDINATION_ACTOR,
    "issue_assurance",
    "Coordinating authority issues the assurance after successful response loop.",
    [assuranceInstrument.documentId],
  );
  context.steps.push({
    step: "issue_assurance_after_more_info",
    state: issued.caseRecord.currentState,
    transactionId: issued.transactionId,
    outcome: "success",
  });

  const verification = await context.client.verifyDocument(
    assuranceInstrument.documentId,
  );
  if (!verification.verified) {
    throw new Error("Information-loop assurance instrument failed integrity verification.");
  }

  return finalizeScenario(
    context,
    "more-info-loop",
    caseId,
    startedAt,
    [assuranceInstrument.documentId],
  );
}

async function runRejectionScenario(
  client: BackendClient,
): Promise<ScenarioRunResult> {
  const startedAt = Date.now();
  const context: ScenarioContext = { client, steps: [] };
  const { caseRecord } = await buildUnderDomesticReviewBaseline(
    context,
    MINIMAL_SUBMISSION_DOCUMENT_TYPES,
  );

  const rejected = await context.client.transitionCase(
    caseRecord.caseId,
    DOMESTIC_ACTOR,
    "reject_case",
    "Domestic regulator rejects the case because transport authorization and package design evidence are insufficient.",
  );
  context.steps.push({
    step: "reject_case",
    state: rejected.caseRecord.currentState,
    transactionId: rejected.transactionId,
    outcome: "success",
  });

  return finalizeScenario(
    context,
    "rejection-missing-documents",
    caseRecord.caseId,
    startedAt,
    [],
  );
}

async function runSubstantiveAmendmentScenario(
  client: BackendClient,
): Promise<ScenarioRunResult> {
  const startedAt = Date.now();
  const context: ScenarioContext = { client, steps: [] };
  const baseline = await buildIssuedBaseline(context);
  const caseId = baseline.caseRecord.caseId;
  const documentIds = baseline.documentIds;
  const originalForeignResponseId = requireDocumentId(
    documentIds,
    "foreign_regulator_response",
  );
  const originalAssuranceInstrumentId = requireDocumentId(
    documentIds,
    "assurance_instrument",
  );

  const amendmentRequest = await uploadDocument(
    context,
    DOMESTIC_ACTOR,
    caseId,
    "amendment_request_package",
    "substantive amendment request",
  );
  documentIds.set("amendment_request_package", amendmentRequest.documentId);

  const amendmentInitiated = await context.client.transitionCase(
    caseId,
    DOMESTIC_ACTOR,
    "initiate_substantive_amendment",
    "A quantity and destination change requires substantive amendment review.",
    [amendmentRequest.documentId],
  );
  context.steps.push({
    step: "initiate_substantive_amendment",
    state: amendmentInitiated.caseRecord.currentState,
    transactionId: amendmentInitiated.transactionId,
    outcome: "success",
  });

  const coordinated = await context.client.transitionCase(
    caseId,
    DOMESTIC_ACTOR,
    "forward_to_coordination",
    "Domestic regulator endorses the substantive amendment for coordination.",
  );
  context.steps.push({
    step: "forward_to_coordination_amendment",
    state: coordinated.caseRecord.currentState,
    transactionId: coordinated.transactionId,
    outcome: "success",
  });

  const updatedForwardingPacket = await uploadDocument(
    context,
    COORDINATION_ACTOR,
    caseId,
    "coordination_forwarding_package",
    "substantive amendment forwarding packet",
  );
  documentIds.set(
    "coordination_forwarding_package",
    updatedForwardingPacket.documentId,
  );

  const foreignForwarded = await context.client.transitionCase(
    caseId,
    COORDINATION_ACTOR,
    "forward_to_foreign_authority",
    "Coordinating authority forwards the substantive amendment for foreign re-review.",
    [updatedForwardingPacket.documentId],
  );
  context.steps.push({
    step: "forward_to_foreign_authority_amendment",
    state: foreignForwarded.caseRecord.currentState,
    transactionId: foreignForwarded.transactionId,
    outcome: "success",
  });

  const foreignReview = await context.client.transitionCase(
    caseId,
    FOREIGN_ACTOR,
    "record_foreign_review",
    "Foreign regulator begins substantive amendment review.",
  );
  context.steps.push({
    step: "record_foreign_review_amendment",
    state: foreignReview.caseRecord.currentState,
    transactionId: foreignReview.transactionId,
    outcome: "success",
  });

  const updatedForeignResponse = await uploadDocument(
    context,
    FOREIGN_ACTOR,
    caseId,
    "foreign_regulator_response",
    "updated foreign approval response for amendment",
    originalForeignResponseId,
  );
  documentIds.set(
    "foreign_regulator_response",
    updatedForeignResponse.documentId,
  );

  const amendmentApproved = await context.client.transitionCase(
    caseId,
    FOREIGN_ACTOR,
    "approve_case",
    "Foreign regulator approves the substantive amendment.",
    [updatedForeignResponse.documentId],
  );
  context.steps.push({
    step: "approve_case_amendment",
    state: amendmentApproved.caseRecord.currentState,
    transactionId: amendmentApproved.transactionId,
    outcome: "success",
  });

  const updatedAssuranceInstrument = await uploadDocument(
    context,
    COORDINATION_ACTOR,
    caseId,
    "assurance_instrument",
    "amended assurance instrument",
    originalAssuranceInstrumentId,
  );
  documentIds.set(
    "assurance_instrument",
    updatedAssuranceInstrument.documentId,
  );

  const amended = await context.client.transitionCase(
    caseId,
    COORDINATION_ACTOR,
    "amend_assurance",
    "Coordinating authority issues the amended assurance after renewed foreign approval.",
    [amendmentRequest.documentId, updatedAssuranceInstrument.documentId],
  );
  context.steps.push({
    step: "amend_assurance",
    state: amended.caseRecord.currentState,
    transactionId: amended.transactionId,
    outcome: "success",
  });

  const verification = await context.client.verifyDocument(
    updatedAssuranceInstrument.documentId,
  );
  if (!verification.verified) {
    throw new Error("Amended assurance instrument failed integrity verification.");
  }

  return finalizeScenario(
    context,
    "substantive-amendment-post-issuance",
    caseId,
    startedAt,
    [updatedAssuranceInstrument.documentId],
  );
}

async function runNonSubstantiveAmendmentScenario(
  client: BackendClient,
): Promise<ScenarioRunResult> {
  const startedAt = Date.now();
  const context: ScenarioContext = { client, steps: [] };
  const baseline = await buildIssuedBaseline(context);
  const caseId = baseline.caseRecord.caseId;
  const documentIds = baseline.documentIds;
  const originalAssuranceInstrumentId = requireDocumentId(
    documentIds,
    "assurance_instrument",
  );

  const amendmentRequest = await uploadDocument(
    context,
    DOMESTIC_ACTOR,
    caseId,
    "amendment_request_package",
    "non-substantive amendment request",
  );
  documentIds.set("amendment_request_package", amendmentRequest.documentId);

  const amendmentInitiated = await context.client.transitionCase(
    caseId,
    DOMESTIC_ACTOR,
    "initiate_non_substantive_amendment",
    "A clerical correction is classified as a non-substantive amendment.",
    [amendmentRequest.documentId],
  );
  context.steps.push({
    step: "initiate_non_substantive_amendment",
    state: amendmentInitiated.caseRecord.currentState,
    transactionId: amendmentInitiated.transactionId,
    outcome: "success",
  });

  const updatedAssuranceInstrument = await uploadDocument(
    context,
    COORDINATION_ACTOR,
    caseId,
    "assurance_instrument",
    "non-substantive amended assurance instrument",
    originalAssuranceInstrumentId,
  );
  documentIds.set(
    "assurance_instrument",
    updatedAssuranceInstrument.documentId,
  );

  const amended = await context.client.transitionCase(
    caseId,
    COORDINATION_ACTOR,
    "amend_assurance",
    "Coordinating authority issues the non-substantive amendment without foreign re-review.",
    [amendmentRequest.documentId, updatedAssuranceInstrument.documentId],
  );
  context.steps.push({
    step: "amend_assurance_non_substantive",
    state: amended.caseRecord.currentState,
    transactionId: amended.transactionId,
    outcome: "success",
  });

  const verification = await context.client.verifyDocument(
    updatedAssuranceInstrument.documentId,
  );
  if (!verification.verified) {
    throw new Error("Non-substantive amended assurance failed integrity verification.");
  }

  return finalizeScenario(
    context,
    "non-substantive-amendment-post-issuance",
    caseId,
    startedAt,
    [updatedAssuranceInstrument.documentId],
  );
}

async function runRevocationScenario(
  client: BackendClient,
): Promise<ScenarioRunResult> {
  const startedAt = Date.now();
  const context: ScenarioContext = { client, steps: [] };
  const baseline = await buildIssuedBaseline(context);
  const caseId = baseline.caseRecord.caseId;
  const revocationNotice = await uploadDocument(
    context,
    DOMESTIC_ACTOR,
    caseId,
    "revocation_notice",
    "revocation notice after adverse post-issuance finding",
  );

  const revoked = await context.client.transitionCase(
    caseId,
    DOMESTIC_ACTOR,
    "revoke_assurance",
    "Domestic regulator revokes the assurance after adverse follow-up evidence.",
    [revocationNotice.documentId],
  );
  context.steps.push({
    step: "revoke_assurance",
    state: revoked.caseRecord.currentState,
    transactionId: revoked.transactionId,
    outcome: "success",
  });

  return finalizeScenario(
    context,
    "revocation",
    caseId,
    startedAt,
    [],
  );
}

async function runUnauthorizedAttemptScenario(
  client: BackendClient,
): Promise<ScenarioRunResult> {
  const startedAt = Date.now();
  const context: ScenarioContext = { client, steps: [] };
  const { caseRecord } = await buildSubmittedBaseline(
    context,
    MINIMAL_SUBMISSION_DOCUMENT_TYPES,
  );

  const expectedFailure = await expectScenarioFailure(
    context,
    "unauthorized_record_domestic_review_attempt",
    () =>
      context.client.transitionCase(
        caseRecord.caseId,
        APPLICANT_ACTOR,
        "record_domestic_review",
        "Applicant attempts to trigger a regulator-only transition.",
      ),
    caseRecord.caseId,
    (message) =>
      message.includes("not allowed") ||
      message.includes("not permitted") ||
      message.includes("cannot"),
  );

  return finalizeScenario(
    context,
    "unauthorized-attempt",
    caseRecord.caseId,
    startedAt,
    [],
    {
      terminalStateOverride: "blocked",
      expectedFailure,
    },
  );
}

async function runMissingDocumentPathScenario(
  client: BackendClient,
): Promise<ScenarioRunResult> {
  const startedAt = Date.now();
  const context: ScenarioContext = { client, steps: [] };
  const { caseRecord, documentIds } = await createDraftWithDocuments(
    context,
    ["assurance_application_form", "item_technical_specification"],
    "intentionally incomplete submission bundle",
  );

  const expectedFailure = await expectScenarioFailure(
    context,
    "submit_case_missing_document_bundle",
    () =>
      context.client.submitCase(
        caseRecord.caseId,
        APPLICANT_ACTOR,
        "Applicant attempts submission without the end-use declaration.",
        Array.from(documentIds.values()),
      ),
    caseRecord.caseId,
    (message) => message.includes("Missing required document types"),
  );

  return finalizeScenario(
    context,
    "missing-document-path",
    caseRecord.caseId,
    startedAt,
    [],
    {
      terminalStateOverride: "blocked",
      expectedFailure,
    },
  );
}

async function runInvalidTransitionAttemptScenario(
  client: BackendClient,
): Promise<ScenarioRunResult> {
  const startedAt = Date.now();
  const context: ScenarioContext = { client, steps: [] };
  const { caseRecord } = await buildUnderDomesticReviewBaseline(
    context,
    MINIMAL_SUBMISSION_DOCUMENT_TYPES,
  );

  const expectedFailure = await expectScenarioFailure(
    context,
    "forward_to_foreign_authority_invalid_state",
    () =>
      context.client.transitionCase(
        caseRecord.caseId,
        COORDINATION_ACTOR,
        "forward_to_foreign_authority",
        "Coordination attempts to bypass domestic forwarding state.",
      ),
    caseRecord.caseId,
    (message) => message.includes("No transition is defined"),
  );

  return finalizeScenario(
    context,
    "invalid-transition-attempt",
    caseRecord.caseId,
    startedAt,
    [],
    {
      terminalStateOverride: "blocked",
      expectedFailure,
    },
  );
}

export const EVALUATION_SCENARIOS: EvaluationScenarioDefinition[] = [
  {
    scenarioId: "normal-approval-fuel-shipment",
    label: "Normal approval path",
    run: runNormalApprovalScenario,
  },
  {
    scenarioId: "more-info-loop",
    label: "More-information loop",
    run: runMoreInformationLoopScenario,
  },
  {
    scenarioId: "rejection-missing-documents",
    label: "Missing-document rejection path",
    run: runRejectionScenario,
  },
  {
    scenarioId: "substantive-amendment-post-issuance",
    label: "Substantive amendment path",
    run: runSubstantiveAmendmentScenario,
  },
  {
    scenarioId: "non-substantive-amendment-post-issuance",
    label: "Non-substantive amendment path",
    run: runNonSubstantiveAmendmentScenario,
  },
  {
    scenarioId: "revocation",
    label: "Revocation path",
    run: runRevocationScenario,
  },
  {
    scenarioId: "unauthorized-attempt",
    label: "Unauthorized attempt",
    run: runUnauthorizedAttemptScenario,
  },
  {
    scenarioId: "missing-document-path",
    label: "Missing-document validation path",
    run: runMissingDocumentPathScenario,
  },
  {
    scenarioId: "invalid-transition-attempt",
    label: "Invalid transition attempt",
    run: runInvalidTransitionAttemptScenario,
  },
];

export async function runScenarioById(
  client: BackendClient,
  scenarioId: string,
): Promise<ScenarioRunResult> {
  const scenario = EVALUATION_SCENARIOS.find(
    (candidate) => candidate.scenarioId === scenarioId,
  );

  if (!scenario) {
    throw new Error(
      `Unknown scenario "${scenarioId}". Available scenarios: ${EVALUATION_SCENARIOS.map((candidate) => candidate.scenarioId).join(", ")}.`,
    );
  }

  return scenario.run(client);
}
