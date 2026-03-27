'use strict';

function randomId(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function buildLogicalIndex(startIndex, requestIndex, workerIndex, totalWorkers) {
  return Number(startIndex) + Number(workerIndex) + Number(requestIndex) * Number(totalWorkers);
}

function expandPattern(pattern, index, width = 4, namespace = 'bench') {
  const paddedIndex = String(index).padStart(width, '0');
  return pattern
    .replaceAll('{ns}', namespace)
    .replaceAll('{n}', paddedIndex)
    .replaceAll('{i}', String(index));
}

function buildActorClaims(role, organizationId, organizationType) {
  return JSON.stringify({
    userId: `${role}-${organizationId}`,
    username: `${role}.${organizationId}`,
    role,
    organizationId,
    organizationType,
    permissions: [],
    activeFlag: true,
  });
}

function buildCasePayload(workerIndex, logicalIndex) {
  const suffix = `${workerIndex}-${String(logicalIndex).padStart(5, '0')}`;
  const caseId = randomId(`bench-case-${suffix}`);
  return {
    caseId,
    payloadJson: JSON.stringify({
      caseId,
      caseNumber: `BENCH-${suffix}-${Date.now()}`,
      applicantOrgId: "bench-applicant-org",
      applicantOrgName: "Benchmark Applicant Organization",
      itemCategory: "fresh_fuel_component",
      itemDescription: "Benchmark assurance request",
      quantity: 1,
      originJurisdiction: "Jurisdiction-A",
      destinationJurisdiction: "Jurisdiction-B",
      intendedUse: "peaceful_nuclear_power_generation",
      legalTreatyBasis: "benchmark-basis",
      priority: "routine",
      remarksSummary: "Benchmark-generated case payload.",
      visibilityScope: [
        "applicant_organization",
        "domestic_regulator",
        "coordinating_authority",
        "auditor_body",
      ],
    }),
  };
}

function buildDocumentReference(
  caseId,
  documentType,
  version,
  supersedesDocumentId,
  overrides = {},
) {
  return JSON.stringify({
    documentId: overrides.documentId || randomId(`bench-doc-${documentType}`),
    caseId,
    documentType,
    storageBucket: "bench-bucket",
    storageKey:
      overrides.storageKey || `bench/${caseId}/${documentType}/${version}`,
    sha256Hash: overrides.sha256Hash || randomId("hash"),
    fileName: `${documentType}.pdf`,
    mimeType: "application/pdf",
    version,
    uploadedBy: "benchmark-uploader",
    uploadedAt: overrides.uploadedAt || new Date().toISOString(),
    classification: "restricted",
    accessScope: [
      "domestic_regulator",
      "coordinating_authority",
      "foreign_regulator",
      "auditor_body",
    ],
    supersedesDocumentId,
    isActive: true,
  });
}

function randomCorrelationId(prefix) {
  return randomId(prefix);
}

module.exports = {
  buildActorClaims,
  buildLogicalIndex,
  buildCasePayload,
  buildDocumentReference,
  expandPattern,
  randomCorrelationId,
};
