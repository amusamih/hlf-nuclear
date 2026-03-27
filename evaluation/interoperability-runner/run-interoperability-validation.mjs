import { Buffer } from "node:buffer";

const baseUrl = process.env.BACKEND_BASE_URL ?? "http://localhost:3000/api";

const DOMESTIC_ACTOR = {
  userId: "interop-domestic-officer",
  username: "interop.domestic.officer",
  role: "domestic_regulator_officer",
  organizationId: "domestic-regulator-interop",
  organizationType: "domestic_regulator",
  permissions: ["review_cases", "forward_cases"],
  activeFlag: true,
};

const COORDINATION_ACTOR = {
  userId: "interop-coordination-officer",
  username: "interop.coordination.officer",
  role: "coordination_officer",
  organizationId: "coordination-authority-interop",
  organizationType: "coordinating_authority",
  permissions: ["coordinate_cases", "issue_assurance_artifacts"],
  activeFlag: true,
};

function textBase64(value) {
  return Buffer.from(value, "utf8").toString("base64");
}

async function get(path) {
  const response = await fetch(`${baseUrl}${path}`);
  return parseResponse(response);
}

async function post(path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseResponse(response);
}

async function parseResponse(response) {
  if (!response.ok) {
    throw new Error(`Request failed with ${response.status}: ${await response.text()}`);
  }

  return response.json();
}

async function main() {
  const correlationId = `interop-${Date.now()}`;
  const intakeMessage = {
    messageId: `msg-${correlationId}-intake`,
    schemaVersion: "v1",
    timestamp: new Date().toISOString(),
    correlationId,
    caseId: `ext-${correlationId}`,
    sourceSystem: "domestic-intake-emulator",
    applicant: {
      applicantOrgId: "applicant-org-interop",
      applicantOrgName: "Synthetic Applicant Organization",
    },
    caseDraft: {
      itemCategory: "fresh_fuel_component",
      itemDescription: "Unirradiated fuel assembly shipment request",
      quantity: 2,
      originJurisdiction: "Jurisdiction-A",
      destinationJurisdiction: "Jurisdiction-B",
      intendedUse: "peaceful_nuclear_power_generation",
      legalTreatyBasis: "sandbox-bilateral-assurance-arrangement",
      priority: "routine",
      remarksSummary: "Domestic emulator handoff for interoperability validation.",
      visibilityScope: [
        "applicant_organization",
        "domestic_regulator",
        "coordinating_authority",
        "auditor_body",
      ],
    },
    documentManifest: [
      {
        documentId: `manifest-${correlationId}-application`,
        documentType: "assurance_application_form",
        fileName: "assurance-application.txt",
        mimeType: "text/plain",
        classification: "restricted",
        contentBase64: textBase64("assurance application"),
      },
      {
        documentId: `manifest-${correlationId}-spec`,
        documentType: "item_technical_specification",
        fileName: "technical-specification.txt",
        mimeType: "text/plain",
        classification: "restricted",
        contentBase64: textBase64("technical specification"),
      },
      {
        documentId: `manifest-${correlationId}-enduse`,
        documentType: "end_use_declaration",
        fileName: "end-use-declaration.txt",
        mimeType: "text/plain",
        classification: "restricted",
        contentBase64: textBase64("end use declaration"),
      },
    ],
    autoSubmit: true,
  };

  const intake = await post("/simulator/domestic/intake", intakeMessage);
  const caseId = intake.caseRecord.caseId;

  await post(`/cases/${caseId}/actions`, {
    actor: DOMESTIC_ACTOR,
    action: "record_domestic_review",
    justification: "Domestic interoperability validation review start.",
    relatedDocumentIds: [],
    documentTypes: [],
  });

  await post(`/cases/${caseId}/actions`, {
    actor: DOMESTIC_ACTOR,
    action: "forward_to_coordination",
    justification: "Domestic interoperability validation forwarding.",
    relatedDocumentIds: [],
    documentTypes: [],
  });

  const forwardingDocument = await post("/documents", {
    actor: COORDINATION_ACTOR,
    caseId,
    documentType: "coordination_forwarding_package",
    fileName: "coordination-forwarding.txt",
    mimeType: "text/plain",
    classification: "restricted",
    accessScope: [
      "domestic_regulator",
      "coordinating_authority",
      "foreign_regulator",
      "auditor_body",
    ],
    contentBase64: textBase64("coordination forwarding package"),
  });

  await post(`/cases/${caseId}/actions`, {
    actor: COORDINATION_ACTOR,
    action: "forward_to_foreign_authority",
    justification: "Coordination forwards case to foreign simulator.",
    relatedDocumentIds: [forwardingDocument.documentReference.documentId],
    documentTypes: ["coordination_forwarding_package"],
  });

  const foreignOutbound = await get(`/simulator/foreign/outbound/${caseId}`);

  const foreignAcknowledgement = await post("/simulator/foreign/acknowledge", {
    messageId: `msg-${correlationId}-foreign-ack`,
    schemaVersion: "v1",
    timestamp: new Date().toISOString(),
    correlationId: foreignOutbound.correlationId,
    caseId,
    status: "acknowledged",
  });

  const foreignDecision = await post("/simulator/foreign/decision", {
    messageId: `msg-${correlationId}-foreign-decision`,
    schemaVersion: "v1",
    timestamp: new Date().toISOString(),
    correlationId: foreignOutbound.correlationId,
    caseId,
    decision: "approved",
    justification: "Foreign simulator approves the forwarded case.",
  });

  const assuranceInstrument = await post("/documents", {
    actor: COORDINATION_ACTOR,
    caseId,
    documentType: "assurance_instrument",
    fileName: "assurance-instrument.txt",
    mimeType: "text/plain",
    classification: "restricted",
    accessScope: [
      "applicant_organization",
      "domestic_regulator",
      "coordinating_authority",
      "foreign_regulator",
      "auditor_body",
    ],
    contentBase64: textBase64("issued assurance instrument"),
  });

  const issued = await post(`/cases/${caseId}/actions`, {
    actor: COORDINATION_ACTOR,
    action: "issue_assurance",
    justification: "Coordination issues assurance after foreign simulator approval.",
    relatedDocumentIds: [assuranceInstrument.documentReference.documentId],
    documentTypes: ["assurance_instrument"],
  });

  const statusSync = await get(
    `/simulator/domestic/status-sync/${caseId}?externalCaseRef=domestic-interop-001`,
  );
  const exchangeSummary = await get("/simulator/exchanges/summary");
  const exchanges = await get("/simulator/exchanges");
  const auditTimeline = await get(`/cases/${caseId}/audit-timeline`);
  const metricsSummary = await get(`/metrics/summary?caseId=${caseId}`);
  const documentVerification = await get(
    `/documents/${assuranceInstrument.documentReference.documentId}/verify`,
  );

  console.log(
    JSON.stringify(
      {
        caseId,
        correlationId,
        terminalState: issued.caseRecord.currentState,
        intakeStatus: intake.caseRecord.currentState,
        foreignOutbound,
        foreignAcknowledgementState: foreignAcknowledgement.caseRecord.currentState,
        foreignDecisionState: foreignDecision.transition.caseRecord.currentState,
        statusSync,
        exchangeSummary,
        exchangeCount: exchanges.length,
        auditEventCount: auditTimeline.length,
        metricsSummary,
        issuedDocumentVerified: documentVerification.verified,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
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
