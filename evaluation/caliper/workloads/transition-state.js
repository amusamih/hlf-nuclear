'use strict';

const { WorkloadModuleBase } = require('@hyperledger/caliper-core');
const {
  buildActorClaims,
  buildLogicalIndex,
  expandPattern,
  randomCorrelationId,
} = require('./lib/payloads.js');

class TransitionStateWorkload extends WorkloadModuleBase {
  constructor() {
    super();
    this.requestIndex = 0;
  }

  async submitTransaction() {
    const contractId = this.roundArguments.contractId || 'CaseContract';
    const contractFunction =
      this.roundArguments.contractFunction || 'recordDomesticReview';
    const actorJson = buildActorClaims(
      this.roundArguments.actorRole || 'domestic_regulator_officer',
      this.roundArguments.actorOrgId || 'domestic-regulator-benchmark',
      this.roundArguments.actorOrgType || 'domestic_regulator',
    );
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
    const seedCaseIds = this.roundArguments.seedCaseIds || ['bench-case-seed-0001'];
    const caseId = this.roundArguments.seedCasePattern
      ? expandPattern(
          this.roundArguments.seedCasePattern,
          logicalIndex,
          indexWidth,
          seedNamespace,
        )
      : seedCaseIds[this.txIndex % seedCaseIds.length];
    const justification =
      this.roundArguments.justification || 'Benchmark workflow transition.';
    const mode = this.roundArguments.mode || 'simple';
    const relatedDocumentIds = Array.isArray(this.roundArguments.relatedDocumentPatterns)
      ? this.roundArguments.relatedDocumentPatterns.map((pattern) =>
          expandPattern(pattern, logicalIndex, indexWidth, seedNamespace),
        )
      : this.roundArguments.relatedDocumentIds || [];

    const contractArguments =
      mode === 'documented'
        ? [
            caseId,
            actorJson,
            JSON.stringify(this.roundArguments.documentTypes || []),
            JSON.stringify(relatedDocumentIds),
            justification,
            randomCorrelationId(`corr-${contractFunction}`),
            new Date().toISOString(),
          ]
        : [
            caseId,
            actorJson,
            justification,
            randomCorrelationId(`corr-${contractFunction}`),
            new Date().toISOString(),
          ];

    await this.sutAdapter.sendRequests({
      contractId,
      contractFunction,
      contractArguments,
      readOnly: false,
    });
  }
}

function createWorkloadModule() {
  return new TransitionStateWorkload();
}

module.exports.createWorkloadModule = createWorkloadModule;
