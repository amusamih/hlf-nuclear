import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { ForbiddenException, Injectable } from "@nestjs/common";
import {
  ROLE_PERMISSION_MATRIX,
  type AssuranceCase,
  type CreateAssuranceCaseInput,
  type DocumentType,
  TRANSITIONS,
  type UserClaims,
  type WorkflowEventRecord,
  type WorkflowActionType,
} from "@prototype/shared";
import { FabricRelayService } from "../fabric/fabric.service.js";
import { MetricsService } from "../metrics/metrics.service.js";
import { buildLedgerReference } from "../projections/ledger-reference.js";
import { ProjectionStoreService } from "../projections/projections.service.js";

export interface CreateDraftRequest {
  actor: UserClaims;
  payload: Omit<CreateAssuranceCaseInput, "caseId" | "caseNumber">;
}

export interface SubmitCaseRequest {
  actor: UserClaims;
  justification: string;
  documentTypes?: DocumentType[];
  relatedDocumentIds: string[];
}

export interface TransitionCaseRequest {
  actor: UserClaims;
  action: Exclude<WorkflowActionType, "create_case">;
  justification: string;
  documentTypes?: DocumentType[];
  relatedDocumentIds: string[];
}

@Injectable()
export class CasesService {
  constructor(
    private readonly projections: ProjectionStoreService,
    private readonly fabricRelay: FabricRelayService,
    private readonly metrics: MetricsService,
  ) {}

  listCases(): Promise<AssuranceCase[]> {
    return this.projections.listCases();
  }

  getCase(caseId: string): Promise<AssuranceCase> {
    return this.projections.getCase(caseId);
  }

  listEvents(caseId: string): Promise<WorkflowEventRecord[]> {
    return this.projections.listEvents(caseId);
  }

  async reconstructAuditTimeline(caseId: string): Promise<WorkflowEventRecord[]> {
    const startedAt = performance.now();
    const timeline = [...(await this.projections.listEvents(caseId))].sort(
      (left, right) => {
        if (left.timestamp === right.timestamp) {
          return left.actionId.localeCompare(right.actionId);
        }

        return left.timestamp.localeCompare(right.timestamp);
      },
    );

    this.metrics.record(
      "audit_reconstruction_ms",
      performance.now() - startedAt,
      caseId,
      { eventCount: timeline.length },
    );

    return timeline;
  }

  getWorkflowModel() {
    return TRANSITIONS;
  }

  async createDraft(request: CreateDraftRequest) {
    const startedAt = performance.now();
    const nextSequence = (await this.projections.countCases()) + 1;
    const caseId = `case-${randomUUID()}`;
    const caseNumber = `NRA-${new Date().getUTCFullYear()}-${String(nextSequence).padStart(4, "0")}`;

    const result = await this.createDraftFromInput(
      {
        caseId,
        caseNumber,
        ...request.payload,
      },
      request.actor,
    );
    this.metrics.record(
      "case_creation_latency_ms",
      performance.now() - startedAt,
      result.caseRecord.caseId,
      { state: "draft" },
    );

    return result;
  }

  submitCase(caseId: string, request: SubmitCaseRequest) {
    return this.transitionCase(caseId, {
      ...request,
      action: "submit_case",
    });
  }

  async transitionCase(caseId: string, request: TransitionCaseRequest) {
    const startedAt = performance.now();
    const caseRecord = await this.projections.getCase(caseId);
    const documentTypes =
      request.documentTypes ??
      (await this.deriveDocumentTypes(request.relatedDocumentIds));
    const relayResult = await this.fabricRelay.transitionCase(
      caseRecord,
      request.action,
      request.actor,
      documentTypes,
      request.relatedDocumentIds,
      request.justification,
    );
    const { caseRecord: updatedCase, event } = relayResult.payload;
    await this.projections.persistCaseUpdate(
      updatedCase,
      event,
      buildLedgerReference({
        transactionId: relayResult.transactionId,
        invocationPlan: relayResult.invocationPlan,
        caseRecord: updatedCase,
        event,
      }),
    );
    this.metrics.record(
      "transition_latency_ms",
      performance.now() - startedAt,
      caseId,
      { action: request.action },
    );

    return {
      transactionId: relayResult.transactionId,
      caseRecord: updatedCase,
      event,
    };
  }

  async createDraftFromInput(
    input: CreateAssuranceCaseInput,
    actor: UserClaims,
  ): Promise<{
    transactionId: string;
    caseRecord: AssuranceCase;
    event: WorkflowEventRecord;
  }> {
    this.assertCreateDraftAllowed(actor);
    const relayResult = await this.fabricRelay.createCase(input, actor);
    const { caseRecord, event } = relayResult.payload;

    await this.projections.persistCaseUpdate(
      caseRecord,
      event,
      buildLedgerReference({
        transactionId: relayResult.transactionId,
        invocationPlan: relayResult.invocationPlan,
        caseRecord,
        event,
      }),
    );

    return {
      transactionId: relayResult.transactionId,
      caseRecord,
      event,
    };
  }

  private async deriveDocumentTypes(documentIds: string[]): Promise<DocumentType[]> {
    return Promise.all(
      documentIds.map(async (documentId) => {
        const documentReference = await this.projections.getDocument(documentId);
        return documentReference.documentType as DocumentType;
      }),
    );
  }

  private assertCreateDraftAllowed(actor: UserClaims): void {
    const roleProfile = ROLE_PERMISSION_MATRIX[actor.role];
    if (!actor.activeFlag) {
      throw new ForbiddenException(`Actor "${actor.userId}" is inactive.`);
    }
    if (roleProfile.organizationType !== actor.organizationType) {
      throw new ForbiddenException(
        `Role "${actor.role}" cannot be used from organization type "${actor.organizationType}".`,
      );
    }
    if (!roleProfile.allowedActions.includes("create_case")) {
      throw new ForbiddenException(
        `Role "${actor.role}" cannot create draft cases.`,
      );
    }
  }
}
