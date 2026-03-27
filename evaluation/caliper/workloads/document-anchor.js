'use strict';

const { WorkloadModuleBase } = require('@hyperledger/caliper-core');
const {
  buildActorClaims,
  buildDocumentReference,
  buildLogicalIndex,
  expandPattern,
} = require('./lib/payloads.js');

class DocumentAnchorWorkload extends WorkloadModuleBase {
  constructor() {
    super();
    this.requestIndex = 0;
  }

  async submitTransaction() {
    const contractId = this.roundArguments.contractId || 'DocumentContract';
    const contractFunction =
      this.roundArguments.contractFunction || 'DocumentContract:addDocumentReference';
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
      this.roundArguments.documentType || 'coordination_forwarding_package';
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
    const payloadJson = buildDocumentReference(caseId, documentType, 1, undefined, {
      documentId,
      storageKey: `bench/${caseId}/${documentType}/${logicalIndex}`,
      sha256Hash: `bench-hash-${documentType}-${String(logicalIndex).padStart(indexWidth, '0')}`,
      uploadedAt: new Date(Date.UTC(2026, 0, 1, 0, logicalIndex, 0)).toISOString(),
    });

    await this.sutAdapter.sendRequests({
      contractId,
      contractFunction,
      contractArguments: [payloadJson, actorJson, new Date().toISOString()],
      readOnly: false,
    });
  }
}

function createWorkloadModule() {
  return new DocumentAnchorWorkload();
}

module.exports.createWorkloadModule = createWorkloadModule;
