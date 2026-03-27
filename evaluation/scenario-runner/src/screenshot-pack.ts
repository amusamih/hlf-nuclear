import { Buffer } from "node:buffer";
import type { DocumentReference, DocumentType, UserClaims } from "@prototype/shared";
import {
  APPLICANT_ACTOR,
  COORDINATION_ACTOR,
  DOMESTIC_ACTOR,
  FOREIGN_ACTOR,
} from "./actors.js";
import { BackendClient } from "./client.js";

interface ScreenshotCaseRecord {
  screenshotId: string;
  label: string;
  workspace: string;
  targetState: string;
  caseId?: string;
  caseNumber?: string;
  url: string;
  description: string;
}

const DEFAULT_CASE_PAYLOAD = {
  applicantOrgId: APPLICANT_ACTOR.organizationId,
  applicantOrgName: "Synthetic Applicant Organization",
  itemCategory: "fresh_fuel_component",
  itemDescription: "Unirradiated fuel assembly shipment request",
  quantity: 2,
  originJurisdiction: "United Arab Emirates",
  destinationJurisdiction: "Republic of Korea",
  intendedUse: "peaceful_nuclear_power_generation",
  legalTreatyBasis: "sandbox-bilateral-assurance-arrangement",
  priority: "routine" as const,
  remarksSummary: "Synthetic case generated for frontend screenshot capture.",
};

function base64Content(caseId: string, documentType: DocumentType, label: string): string {
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

function accessScopeFor(documentType: DocumentType): string[] {
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
  client: BackendClient,
  actor: UserClaims,
  caseId: string,
  documentType: DocumentType,
  label: string,
  supersedesDocumentId?: string,
): Promise<DocumentReference> {
  const result = await client.uploadDocument({
    actor,
    caseId,
    documentType,
    fileName: `${documentType}.txt`,
    mimeType: "text/plain",
    classification: "restricted",
    accessScope: accessScopeFor(documentType),
    contentBase64: base64Content(caseId, documentType, label),
    supersedesDocumentId,
  });

  return result.documentReference;
}

async function createDraft(client: BackendClient, suffix: string) {
  const result = await client.createDraft(APPLICANT_ACTOR, {
    ...DEFAULT_CASE_PAYLOAD,
    remarksSummary: `${DEFAULT_CASE_PAYLOAD.remarksSummary} ${suffix}`,
  });
  return result.caseRecord;
}

async function createSubmittedCase(client: BackendClient, suffix: string) {
  const caseRecord = await createDraft(client, suffix);
  const documentIds = [];

  for (const documentType of [
    "assurance_application_form",
    "item_technical_specification",
    "end_use_declaration",
    "supporting_correspondence",
  ] as const) {
    const documentReference = await uploadDocument(
      client,
      APPLICANT_ACTOR,
      caseRecord.caseId,
      documentType,
      suffix,
    );
    documentIds.push(documentReference.documentId);
  }

  const submitted = await client.submitCase(
    caseRecord.caseId,
    APPLICANT_ACTOR,
    `Applicant submits the case for ${suffix}.`,
    documentIds,
  );

  return submitted.caseRecord;
}

async function createMoreInfoCase(client: BackendClient, suffix: string) {
  const submitted = await createSubmittedCase(client, suffix);
  await client.transitionCase(
    submitted.caseId,
    DOMESTIC_ACTOR,
    "record_domestic_review",
    "Domestic regulator begins screenshot review case.",
  );
  const requestNotice = await uploadDocument(
    client,
    DOMESTIC_ACTOR,
    submitted.caseId,
    "request_for_information_notice",
    suffix,
  );
  const requested = await client.transitionCase(
    submitted.caseId,
    DOMESTIC_ACTOR,
    "request_more_information",
    "Domestic regulator requests additional evidence for screenshot state.",
    [requestNotice.documentId],
  );
  return requested.caseRecord;
}

async function createRejectedCase(client: BackendClient, suffix: string) {
  const submitted = await createSubmittedCase(client, suffix);
  await client.transitionCase(
    submitted.caseId,
    DOMESTIC_ACTOR,
    "record_domestic_review",
    "Domestic regulator reviews the rejected-case screenshot sample.",
  );
  const rejected = await client.transitionCase(
    submitted.caseId,
    DOMESTIC_ACTOR,
    "reject_case",
    "Domestic regulator rejects the case for screenshot capture.",
  );
  return rejected.caseRecord;
}

async function createUnderForeignReviewCase(
  client: BackendClient,
  suffix: string,
) {
  const submitted = await createSubmittedCase(client, suffix);
  await client.transitionCase(
    submitted.caseId,
    DOMESTIC_ACTOR,
    "record_domestic_review",
    "Domestic regulator prepares the foreign-review screenshot sample.",
  );
  await client.transitionCase(
    submitted.caseId,
    DOMESTIC_ACTOR,
    "forward_to_coordination",
    "Domestic regulator forwards to coordination for screenshot capture.",
  );
  const forwardingPacket = await uploadDocument(
    client,
    COORDINATION_ACTOR,
    submitted.caseId,
    "coordination_forwarding_package",
    suffix,
  );
  await client.transitionCase(
    submitted.caseId,
    COORDINATION_ACTOR,
    "forward_to_foreign_authority",
    "Coordination forwards the case to foreign review.",
    [forwardingPacket.documentId],
  );
  const underReview = await client.transitionCase(
    submitted.caseId,
    FOREIGN_ACTOR,
    "record_foreign_review",
    "Foreign regulator acknowledges receipt and begins review.",
  );
  return underReview.caseRecord;
}

async function createApprovedCase(client: BackendClient, suffix: string) {
  const underForeignReview = await createUnderForeignReviewCase(client, suffix);
  const foreignDecision = await uploadDocument(
    client,
    FOREIGN_ACTOR,
    underForeignReview.caseId,
    "foreign_regulator_response",
    suffix,
  );
  const approved = await client.transitionCase(
    underForeignReview.caseId,
    FOREIGN_ACTOR,
    "approve_case",
    "Foreign regulator approves the case for screenshot capture.",
    [foreignDecision.documentId],
  );
  return approved.caseRecord;
}

async function createIssuedCase(client: BackendClient, suffix: string) {
  const approved = await createApprovedCase(client, suffix);
  const instrument = await uploadDocument(
    client,
    COORDINATION_ACTOR,
    approved.caseId,
    "assurance_instrument",
    suffix,
  );
  const issued = await client.transitionCase(
    approved.caseId,
    COORDINATION_ACTOR,
    "issue_assurance",
    "Coordination issues the assurance for screenshot capture.",
    [instrument.documentId],
  );
  return {
    caseRecord: issued.caseRecord,
    assuranceInstrumentId: instrument.documentId,
  };
}

async function createAmendedCase(client: BackendClient, suffix: string) {
  const { caseRecord: issuedCase, assuranceInstrumentId } = await createIssuedCase(
    client,
    suffix,
  );
  const amendmentRequest = await uploadDocument(
    client,
    DOMESTIC_ACTOR,
    issuedCase.caseId,
    "amendment_request_package",
    suffix,
  );
  await client.transitionCase(
    issuedCase.caseId,
    DOMESTIC_ACTOR,
    "initiate_non_substantive_amendment",
    "Domestic regulator initiates a non-substantive amendment for screenshot capture.",
    [amendmentRequest.documentId],
  );
  const amendedInstrument = await uploadDocument(
    client,
    COORDINATION_ACTOR,
    issuedCase.caseId,
    "assurance_instrument",
    `${suffix}-amended`,
    assuranceInstrumentId,
  );
  const amended = await client.transitionCase(
    issuedCase.caseId,
    COORDINATION_ACTOR,
    "amend_assurance",
    "Coordination finalizes the amended assurance for screenshot capture.",
    [amendmentRequest.documentId, amendedInstrument.documentId],
  );
  return amended.caseRecord;
}

async function createRevokedCase(client: BackendClient, suffix: string) {
  const { caseRecord: issuedCase } = await createIssuedCase(client, suffix);
  const revocationNotice = await uploadDocument(
    client,
    DOMESTIC_ACTOR,
    issuedCase.caseId,
    "revocation_notice",
    suffix,
  );
  const revoked = await client.transitionCase(
    issuedCase.caseId,
    DOMESTIC_ACTOR,
    "revoke_assurance",
    "Domestic regulator revokes the assurance for screenshot capture.",
    [revocationNotice.documentId],
  );
  return revoked.caseRecord;
}

function buildUrl(workspace: string, caseId?: string): string {
  const params = new URLSearchParams();
  params.set("workspace", workspace);
  if (caseId) {
    params.set("caseId", caseId);
  }

  return `http://localhost:5173/?${params.toString()}`;
}

async function main(): Promise<void> {
  const client = new BackendClient();
  const draftCase = await createDraft(client, "Draft screenshot case");
  const moreInfoCase = await createMoreInfoCase(client, "More-information screenshot case");
  const rejectedCase = await createRejectedCase(client, "Rejected screenshot case");
  const foreignReviewCase = await createUnderForeignReviewCase(
    client,
    "Foreign-review screenshot case",
  );
  const approvedCase = await createApprovedCase(client, "Approved screenshot case");
  const issuedCase = await createIssuedCase(client, "Issued screenshot case");
  const amendedCase = await createAmendedCase(client, "Amended screenshot case");
  const revokedCase = await createRevokedCase(client, "Revoked screenshot case");

  const cases: ScreenshotCaseRecord[] = [
    {
      screenshotId: "applicant-draft",
      label: "Applicant draft workspace",
      workspace: "applicant",
      targetState: draftCase.currentState,
      caseId: draftCase.caseId,
      caseNumber: draftCase.caseNumber,
      url: buildUrl("applicant", draftCase.caseId),
      description: "Draft case view before formal submission.",
    },
    {
      screenshotId: "applicant-more-info",
      label: "Applicant action-required view",
      workspace: "applicant",
      targetState: moreInfoCase.currentState,
      caseId: moreInfoCase.caseId,
      caseNumber: moreInfoCase.caseNumber,
      url: buildUrl("applicant", moreInfoCase.caseId),
      description: "Case paused in more-information-requested state.",
    },
    {
      screenshotId: "domestic-rejected",
      label: "Domestic regulator rejected case",
      workspace: "domestic",
      targetState: rejectedCase.currentState,
      caseId: rejectedCase.caseId,
      caseNumber: rejectedCase.caseNumber,
      url: buildUrl("domestic", rejectedCase.caseId),
      description: "Domestic review lane showing a terminal rejection.",
    },
    {
      screenshotId: "foreign-review",
      label: "Foreign regulator in-review case",
      workspace: "foreign",
      targetState: foreignReviewCase.currentState,
      caseId: foreignReviewCase.caseId,
      caseNumber: foreignReviewCase.caseNumber,
      url: buildUrl("foreign", foreignReviewCase.caseId),
      description: "Forwarded case in active foreign-review state.",
    },
    {
      screenshotId: "coordination-approved",
      label: "Coordination ready-to-issue case",
      workspace: "coordination",
      targetState: approvedCase.currentState,
      caseId: approvedCase.caseId,
      caseNumber: approvedCase.caseNumber,
      url: buildUrl("coordination", approvedCase.caseId),
      description: "Coordination workspace with approved case pending issuance.",
    },
    {
      screenshotId: "auditor-issued",
      label: "Auditor issued-assurance trace",
      workspace: "auditor",
      targetState: issuedCase.caseRecord.currentState,
      caseId: issuedCase.caseRecord.caseId,
      caseNumber: issuedCase.caseRecord.caseNumber,
      url: buildUrl("auditor", issuedCase.caseRecord.caseId),
      description: "Issued case with timeline and document verification available.",
    },
    {
      screenshotId: "coordination-amended",
      label: "Amended assurance case",
      workspace: "coordination",
      targetState: amendedCase.currentState,
      caseId: amendedCase.caseId,
      caseNumber: amendedCase.caseNumber,
      url: buildUrl("coordination", amendedCase.caseId),
      description: "Amended assurance after non-substantive amendment finalization.",
    },
    {
      screenshotId: "domestic-revoked",
      label: "Revoked assurance case",
      workspace: "domestic",
      targetState: revokedCase.currentState,
      caseId: revokedCase.caseId,
      caseNumber: revokedCase.caseNumber,
      url: buildUrl("domestic", revokedCase.caseId),
      description: "Revoked assurance for post-issuance governance screenshots.",
    },
  ];

  console.log(
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        frontendBaseUrl: "http://localhost:5173",
        note: "Start the live backend and frontend, then open the listed URLs directly for screenshot capture.",
        cases,
      },
      null,
      2,
    ),
  );
}

void main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        error: error instanceof Error ? error.message : "unknown_error",
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
});
