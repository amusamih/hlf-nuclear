'use strict';

const { WorkloadModuleBase } = require('@hyperledger/caliper-core');
const {
  buildActorClaims,
  buildDocumentReference,
  buildLogicalIndex,
  expandPattern,
} = require('./lib/payloads.js');

class DocumentVersionWorkload extends WorkloadModuleBase {
  constructor() {
    super();
    this.requestIndex = 0;
  }

  async submitTransaction() {
    const contractId = this.roundArguments.contractId || 'DocumentContract';
    const contractFunction =
      this.roundArguments.contractFunction || 'DocumentContract:updateDocumentVersion';
    const startIndex = Number(this.roundArguments.startIndex || 1);
    const indexWidth = Number(this.roundArguments.indexWidth || 4);
    const logicalIndex = buildLogicalIndex(
      startIndex,
      this.requestIndex,
      this.workerIndex,
      this.totalWorkers,
    );
    this.requestIndex += 1;
    const seedNamespace = this.roundArguments.seedNamespace || 'bench';
    const caseId = this.roundArguments.seedCasePattern
      ? expandPattern(
          this.roundArguments.seedCasePattern,
          logicalIndex,
          indexWidth,
          seedNamespace,
        )
      : this.roundArguments.seedCaseId || 'bench-case-seed-0001';
    const documentType =
      this.roundArguments.documentType || 'assurance_instrument';
    const supersedesDocumentId = this.roundArguments.supersedesDocumentPattern
      ? expandPattern(
          this.roundArguments.supersedesDocumentPattern,
          logicalIndex,
          indexWidth,
          seedNamespace,
        )
      : this.roundArguments.supersedesDocumentId ||
        'bench-doc-assurance-instrument-v1';
    const documentId = this.roundArguments.documentIdPattern
      ? expandPattern(
          this.roundArguments.documentIdPattern,
          logicalIndex,
          indexWidth,
          seedNamespace,
        )
      : undefined;
    const actorJson = buildActorClaims(
      this.roundArguments.actorRole || 'coordination_officer',
      this.roundArguments.actorOrgId || 'coordination-authority-benchmark',
      this.roundArguments.actorOrgType || 'coordinating_authority',
    );
    const payloadJson = buildDocumentReference(
      caseId,
      documentType,
      Number(this.roundArguments.version || 2),
      supersedesDocumentId,
      {
        documentId,
        storageKey: `bench/${caseId}/${documentType}/v${Number(this.roundArguments.version || 2)}`,
        sha256Hash: `bench-version-hash-${documentType}-${String(logicalIndex).padStart(indexWidth, '0')}`,
        uploadedAt: new Date(Date.UTC(2026, 0, 2, 0, logicalIndex, 0)).toISOString(),
      },
    );

    await this.sutAdapter.sendRequests({
      contractId,
      contractFunction,
      contractArguments: [payloadJson, actorJson, new Date().toISOString()],
      readOnly: false,
    });
  }
}

function createWorkloadModule() {
  return new DocumentVersionWorkload();
}

module.exports.createWorkloadModule = createWorkloadModule;
