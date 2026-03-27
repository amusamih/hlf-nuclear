import {
  applyTransition,
  createDraftTransition,
  type AssuranceCase,
  type CreateAssuranceCaseInput,
  type DocumentType,
  type UserClaims,
  type WorkflowActionType,
  type WorkflowEventRecord,
} from "@prototype/shared";
import {
  Context,
  Contract,
  Info,
  Returns,
  Transaction,
} from "fabric-contract-api";
import {
  caseEventKey,
  caseKey,
  caseStateKey,
} from "../lib/keys.js";
import {
  assertCreateCaseAllowed,
  assertTransitionAllowed,
} from "../lib/policy.js";

function parseJson<T>(payload: string): T {
  return JSON.parse(payload) as T;
}

const EMPTY_JSON_ARRAY = "[]";

@Info({
  title: "CaseContract",
  description:
    "Workflow-centric chaincode for cross-border nuclear regulatory assurance cases.",
})
export class CaseContract extends Contract {
  @Transaction()
  @Returns("string")
  async createCase(
    ctx: Context,
    payloadJson: string,
    actorJson: string,
    correlationId: string,
    timestampIso: string,
  ): Promise<string> {
    const input = parseJson<CreateAssuranceCaseInput>(payloadJson);
    const actor = parseJson<UserClaims>(actorJson);
    assertCreateCaseAllowed(actor);
    const existingPayload = await ctx.stub.getState(caseKey(input.caseId));
    if (existingPayload && existingPayload.length > 0) {
      throw new Error(`Case "${input.caseId}" already exists.`);
    }
    const gateway = this.resolveGateway(ctx);
    const { caseRecord, event } = createDraftTransition(
      input,
      actor,
      correlationId,
      timestampIso,
    );
    event.invokedByGatewayOrg = gateway.gatewayOrg;
    event.invokedByGatewayUserId = gateway.gatewayUserId;

    await this.putCase(ctx, caseRecord);
    await this.appendEvent(ctx, caseRecord.caseId, event);
    ctx.stub.setEvent("case.created", Buffer.from(JSON.stringify(event)));

    return JSON.stringify({
      caseRecord,
      event,
    });
  }

  @Transaction()
  @Returns("string")
  async submitCase(
    ctx: Context,
    caseId: string,
    actorJson: string,
    documentTypesJson: string,
    relatedDocumentIdsJson: string,
    justification: string,
    correlationId: string,
    timestampIso: string,
  ): Promise<string> {
    return this.performTransition(
      ctx,
      caseId,
      "submit_case",
      actorJson,
      documentTypesJson,
      relatedDocumentIdsJson,
      justification,
      correlationId,
      timestampIso,
      "case.submitted",
    );
  }

  @Transaction()
  @Returns("string")
  async recordDomesticReview(
    ctx: Context,
    caseId: string,
    actorJson: string,
    justification: string,
    correlationId: string,
    timestampIso: string,
  ): Promise<string> {
    return this.performTransition(
      ctx,
      caseId,
      "record_domestic_review",
      actorJson,
      EMPTY_JSON_ARRAY,
      EMPTY_JSON_ARRAY,
      justification,
      correlationId,
      timestampIso,
      "case.domestic_review_started",
    );
  }

  @Transaction()
  @Returns("string")
  async requestMoreInformation(
    ctx: Context,
    caseId: string,
    actorJson: string,
    documentTypesJson: string,
    relatedDocumentIdsJson: string,
    justification: string,
    correlationId: string,
    timestampIso: string,
  ): Promise<string> {
    return this.performTransition(
      ctx,
      caseId,
      "request_more_information",
      actorJson,
      documentTypesJson,
      relatedDocumentIdsJson,
      justification,
      correlationId,
      timestampIso,
      "case.more_information_requested",
    );
  }

  @Transaction()
  @Returns("string")
  async respondToInformationRequest(
    ctx: Context,
    caseId: string,
    actorJson: string,
    documentTypesJson: string,
    relatedDocumentIdsJson: string,
    justification: string,
    correlationId: string,
    timestampIso: string,
  ): Promise<string> {
    return this.performTransition(
      ctx,
      caseId,
      "respond_to_information_request",
      actorJson,
      documentTypesJson,
      relatedDocumentIdsJson,
      justification,
      correlationId,
      timestampIso,
      "case.more_information_responded",
    );
  }

  @Transaction()
  @Returns("string")
  async forwardToCoordination(
    ctx: Context,
    caseId: string,
    actorJson: string,
    justification: string,
    correlationId: string,
    timestampIso: string,
  ): Promise<string> {
    return this.performTransition(
      ctx,
      caseId,
      "forward_to_coordination",
      actorJson,
      EMPTY_JSON_ARRAY,
      EMPTY_JSON_ARRAY,
      justification,
      correlationId,
      timestampIso,
      "case.forwarded_to_coordination",
    );
  }

  @Transaction()
  @Returns("string")
  async forwardToForeignAuthority(
    ctx: Context,
    caseId: string,
    actorJson: string,
    documentTypesJson: string,
    relatedDocumentIdsJson: string,
    justification: string,
    correlationId: string,
    timestampIso: string,
  ): Promise<string> {
    return this.performTransition(
      ctx,
      caseId,
      "forward_to_foreign_authority",
      actorJson,
      documentTypesJson,
      relatedDocumentIdsJson,
      justification,
      correlationId,
      timestampIso,
      "case.forwarded_to_foreign_authority",
    );
  }

  @Transaction()
  @Returns("string")
  async recordForeignReview(
    ctx: Context,
    caseId: string,
    actorJson: string,
    justification: string,
    correlationId: string,
    timestampIso: string,
  ): Promise<string> {
    return this.performTransition(
      ctx,
      caseId,
      "record_foreign_review",
      actorJson,
      EMPTY_JSON_ARRAY,
      EMPTY_JSON_ARRAY,
      justification,
      correlationId,
      timestampIso,
      "case.foreign_review_started",
    );
  }

  @Transaction()
  @Returns("string")
  async approveCase(
    ctx: Context,
    caseId: string,
    actorJson: string,
    documentTypesJson: string,
    relatedDocumentIdsJson: string,
    justification: string,
    correlationId: string,
    timestampIso: string,
  ): Promise<string> {
    return this.performTransition(
      ctx,
      caseId,
      "approve_case",
      actorJson,
      documentTypesJson,
      relatedDocumentIdsJson,
      justification,
      correlationId,
      timestampIso,
      "case.approved",
    );
  }

  @Transaction()
  @Returns("string")
  async rejectCase(
    ctx: Context,
    caseId: string,
    actorJson: string,
    documentTypesJson: string,
    relatedDocumentIdsJson: string,
    justification: string,
    correlationId: string,
    timestampIso: string,
  ): Promise<string> {
    return this.performTransition(
      ctx,
      caseId,
      "reject_case",
      actorJson,
      documentTypesJson,
      relatedDocumentIdsJson,
      justification,
      correlationId,
      timestampIso,
      "case.rejected",
    );
  }

  @Transaction()
  @Returns("string")
  async issueAssurance(
    ctx: Context,
    caseId: string,
    actorJson: string,
    documentTypesJson: string,
    relatedDocumentIdsJson: string,
    justification: string,
    correlationId: string,
    timestampIso: string,
  ): Promise<string> {
    return this.performTransition(
      ctx,
      caseId,
      "issue_assurance",
      actorJson,
      documentTypesJson,
      relatedDocumentIdsJson,
      justification,
      correlationId,
      timestampIso,
      "case.issued",
    );
  }

  @Transaction()
  @Returns("string")
  async initiateNonSubstantiveAmendment(
    ctx: Context,
    caseId: string,
    actorJson: string,
    documentTypesJson: string,
    relatedDocumentIdsJson: string,
    justification: string,
    correlationId: string,
    timestampIso: string,
  ): Promise<string> {
    return this.performTransition(
      ctx,
      caseId,
      "initiate_non_substantive_amendment",
      actorJson,
      documentTypesJson,
      relatedDocumentIdsJson,
      justification,
      correlationId,
      timestampIso,
      "case.non_substantive_amendment_initiated",
    );
  }

  @Transaction()
  @Returns("string")
  async initiateSubstantiveAmendment(
    ctx: Context,
    caseId: string,
    actorJson: string,
    documentTypesJson: string,
    relatedDocumentIdsJson: string,
    justification: string,
    correlationId: string,
    timestampIso: string,
  ): Promise<string> {
    return this.performTransition(
      ctx,
      caseId,
      "initiate_substantive_amendment",
      actorJson,
      documentTypesJson,
      relatedDocumentIdsJson,
      justification,
      correlationId,
      timestampIso,
      "case.substantive_amendment_initiated",
    );
  }

  @Transaction()
  @Returns("string")
  async amendAssurance(
    ctx: Context,
    caseId: string,
    actorJson: string,
    documentTypesJson: string,
    relatedDocumentIdsJson: string,
    justification: string,
    correlationId: string,
    timestampIso: string,
  ): Promise<string> {
    return this.performTransition(
      ctx,
      caseId,
      "amend_assurance",
      actorJson,
      documentTypesJson,
      relatedDocumentIdsJson,
      justification,
      correlationId,
      timestampIso,
      "case.amended",
    );
  }

  @Transaction()
  @Returns("string")
  async rejectAmendment(
    ctx: Context,
    caseId: string,
    actorJson: string,
    justification: string,
    correlationId: string,
    timestampIso: string,
  ): Promise<string> {
    return this.performTransition(
      ctx,
      caseId,
      "reject_amendment",
      actorJson,
      EMPTY_JSON_ARRAY,
      EMPTY_JSON_ARRAY,
      justification,
      correlationId,
      timestampIso,
      "case.amendment_rejected",
    );
  }

  @Transaction()
  @Returns("string")
  async revokeAssurance(
    ctx: Context,
    caseId: string,
    actorJson: string,
    documentTypesJson: string,
    relatedDocumentIdsJson: string,
    justification: string,
    correlationId: string,
    timestampIso: string,
  ): Promise<string> {
    return this.performTransition(
      ctx,
      caseId,
      "revoke_assurance",
      actorJson,
      documentTypesJson,
      relatedDocumentIdsJson,
      justification,
      correlationId,
      timestampIso,
      "case.revoked",
    );
  }

  @Transaction()
  @Returns("string")
  async closeCase(
    ctx: Context,
    caseId: string,
    actorJson: string,
    justification: string,
    correlationId: string,
    timestampIso: string,
  ): Promise<string> {
    return this.performTransition(
      ctx,
      caseId,
      "close_case",
      actorJson,
      EMPTY_JSON_ARRAY,
      EMPTY_JSON_ARRAY,
      justification,
      correlationId,
      timestampIso,
      "case.closed",
    );
  }

  @Transaction(false)
  @Returns("string")
  async getCase(ctx: Context, caseId: string): Promise<string> {
    const caseRecord = await this.getCaseRecord(ctx, caseId);
    return JSON.stringify(caseRecord);
  }

  @Transaction(false)
  @Returns("string")
  async getCaseState(ctx: Context, caseId: string): Promise<string> {
    const caseRecord = await this.getCaseRecord(ctx, caseId);
    return JSON.stringify({
      caseId: caseRecord.caseId,
      caseNumber: caseRecord.caseNumber,
      currentState: caseRecord.currentState,
      currentSubstate: caseRecord.currentSubstate,
      auditSequenceNumber: caseRecord.auditSequenceNumber,
    });
  }

  @Transaction(false)
  @Returns("string")
  async getCaseHistory(ctx: Context, caseId: string): Promise<string> {
    const iterator = await ctx.stub.getStateByRange(
      `${caseEventKey(caseId, "")}`,
      `${caseEventKey(caseId, "~")}`,
    );
    const events: WorkflowEventRecord[] = [];

    while (true) {
      const result = await iterator.next();
      if (result.done) {
        await iterator.close();
        break;
      }

      events.push(
        JSON.parse(result.value.value.toString()) as WorkflowEventRecord,
      );
    }

    return JSON.stringify(events);
  }

  @Transaction(false)
  @Returns("string")
  async listCasesByState(ctx: Context, state: string): Promise<string> {
    const iterator = await ctx.stub.getStateByRange(
      `${caseStateKey(state, "")}`,
      `${caseStateKey(state, "~")}`,
    );
    const cases: AssuranceCase[] = [];

    while (true) {
      const result = await iterator.next();
      if (result.done) {
        await iterator.close();
        break;
      }

      const stateLink = parseJson<{ caseId: string }>(
        result.value.value.toString(),
      );
      cases.push(await this.getCaseRecord(ctx, stateLink.caseId));
    }

    return JSON.stringify(cases);
  }

  private async getCaseRecord(
    ctx: Context,
    caseId: string,
  ): Promise<AssuranceCase> {
    const payload = await ctx.stub.getState(caseKey(caseId));
    if (!payload || payload.length === 0) {
      throw new Error(`Case "${caseId}" does not exist.`);
    }

    return JSON.parse(payload.toString()) as AssuranceCase;
  }

  private async putCase(ctx: Context, caseRecord: AssuranceCase): Promise<void> {
    const existingPayload = await ctx.stub.getState(caseKey(caseRecord.caseId));
    const previousCase =
      existingPayload && existingPayload.length > 0
        ? (parseJson<AssuranceCase>(existingPayload.toString()) as AssuranceCase)
        : undefined;

    await ctx.stub.putState(
      caseKey(caseRecord.caseId),
      Buffer.from(JSON.stringify(caseRecord)),
    );
    await ctx.stub.putState(
      caseStateKey(caseRecord.currentState, caseRecord.caseId),
      Buffer.from(JSON.stringify({ caseId: caseRecord.caseId })),
    );

    if (
      previousCase &&
      previousCase.currentState !== caseRecord.currentState
    ) {
      await ctx.stub.deleteState(
        caseStateKey(previousCase.currentState, caseRecord.caseId),
      );
    }
  }

  private async appendEvent(
    ctx: Context,
    caseId: string,
    event: WorkflowEventRecord,
  ): Promise<void> {
    await ctx.stub.putState(
      caseEventKey(caseId, event.actionId),
      Buffer.from(JSON.stringify(event)),
    );
  }

  private resolveGateway(ctx: Context): {
    gatewayOrg: string;
    gatewayUserId: string;
  } {
    return {
      gatewayOrg:
        ctx.clientIdentity.getMSPID() ??
        "unresolved-membership-service-provider",
      gatewayUserId: ctx.clientIdentity.getID(),
    };
  }

  private async performTransition(
    ctx: Context,
    caseId: string,
    action: Exclude<WorkflowActionType, "create_case">,
    actorJson: string,
    documentTypesJson: string,
    relatedDocumentIdsJson: string,
    justification: string,
    correlationId: string,
    timestampIso: string,
    eventName: string,
  ): Promise<string> {
    const actor = parseJson<UserClaims>(actorJson);
    const gateway = this.resolveGateway(ctx);
    const caseRecord = await this.getCaseRecord(ctx, caseId);
    const documentTypes = parseJson<DocumentType[]>(documentTypesJson);
    const relatedDocumentIds = parseJson<string[]>(relatedDocumentIdsJson);
    assertTransitionAllowed(
      caseRecord,
      action,
      actor,
      documentTypes,
      justification,
    );

    const { updatedCase, event } = applyTransition(
      caseRecord,
      action,
      actor,
      documentTypes,
      relatedDocumentIds,
      justification,
      correlationId,
      timestampIso,
    );
    event.invokedByGatewayOrg = gateway.gatewayOrg;
    event.invokedByGatewayUserId = gateway.gatewayUserId;

    await this.putCase(ctx, updatedCase);
    await this.appendEvent(ctx, caseId, event);
    ctx.stub.setEvent(eventName, Buffer.from(JSON.stringify(event)));

    return JSON.stringify({
      caseRecord: updatedCase,
      event,
    });
  }
}
