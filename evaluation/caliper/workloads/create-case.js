'use strict';

const { WorkloadModuleBase } = require('@hyperledger/caliper-core');
const {
  buildActorClaims,
  buildLogicalIndex,
  buildCasePayload,
  randomCorrelationId,
} = require('./lib/payloads.js');

class CreateCaseWorkload extends WorkloadModuleBase {
  constructor() {
    super();
    this.requestIndex = 0;
  }

  async submitTransaction() {
    const contractId = this.roundArguments.contractId || 'CaseContract';
    const logicalIndex = buildLogicalIndex(
      1,
      this.requestIndex,
      this.workerIndex,
      this.totalWorkers,
    );
    this.requestIndex += 1;
    const { payloadJson } = buildCasePayload(this.workerIndex, logicalIndex);
    const actorJson = buildActorClaims(
      this.roundArguments.actorRole || 'applicant_case_manager',
      this.roundArguments.actorOrgId || 'bench-applicant-org',
      this.roundArguments.actorOrgType || 'applicant_organization',
    );

    await this.sutAdapter.sendRequests({
      contractId,
      contractFunction: 'createCase',
      contractArguments: [
        payloadJson,
        actorJson,
        randomCorrelationId('corr-create-case'),
        new Date().toISOString(),
      ],
      readOnly: false,
    });
  }
}

function createWorkloadModule() {
  return new CreateCaseWorkload();
}

module.exports.createWorkloadModule = createWorkloadModule;
