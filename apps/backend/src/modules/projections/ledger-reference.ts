import type {
  AssuranceCase,
  DocumentReference,
  LedgerReference,
  WorkflowEventRecord,
} from "@prototype/shared";
import type { FabricInvocationPlan } from "../fabric/fabric-invocation-plans.js";

interface LedgerReferenceInput {
  transactionId: string;
  invocationPlan: FabricInvocationPlan;
  caseRecord?: AssuranceCase;
  event?: WorkflowEventRecord;
  documentReference?: DocumentReference;
  committedAt?: string;
  chaincodeEventName?: string;
}

export function buildLedgerReference(
  input: LedgerReferenceInput,
): LedgerReference {
  const committedAt = input.committedAt ?? new Date().toISOString();

  return {
    transactionId: input.transactionId,
    actionId: input.event?.actionId,
    auditSequenceNumber:
      input.event && input.caseRecord
        ? input.caseRecord.auditSequenceNumber
        : input.caseRecord?.auditSequenceNumber,
    channelName: input.invocationPlan.channelName,
    chaincodeName: input.invocationPlan.chaincodeName,
    transactionName: input.invocationPlan.transactionName,
    correlationId:
      input.event?.correlationId ??
      input.documentReference?.documentId ??
      input.invocationPlan.args.at(-2),
    committedAt,
    gatewayOrganization: input.invocationPlan.gatewayOrganization,
    projectionUpdatedAt: committedAt,
    projectionSyncStatus: "in_sync",
    chaincodeEventName: input.chaincodeEventName,
    validationCode: "VALID",
    endorsingOrganizations: input.invocationPlan.endorsingOrganizations,
  };
}
