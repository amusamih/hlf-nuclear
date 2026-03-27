import { randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";
import { performance } from "node:perf_hooks";
import { BadRequestException, Injectable } from "@nestjs/common";
import {
  METRICS,
  SYNTHETIC_SCENARIOS,
  type CreateAssuranceCaseInput,
  type DocumentReference,
  type DocumentType,
  type UserClaims,
} from "@prototype/shared";
import {
  INTEGRATION_SCHEMA_VERSION,
  type DomesticIntakeMessage,
  type DomesticStatusSyncMessage,
  type ForeignAcknowledgementMessage,
  type ForeignDecisionMessage,
  type ForeignForwardingMessage,
  type IntegrationDocumentManifestEntry,
  type IntegrationExchangeRecord,
  type IntegrationExchangeSummary,
} from "@prototype/shared/dist/integration.js";
import { CasesService } from "../cases/cases.service.js";
import { DocumentsService } from "../documents/documents.service.js";
import { MetricsService } from "../metrics/metrics.service.js";

const DOMESTIC_ACTOR: UserClaims = {
  userId: "sim-domestic-officer",
  username: "sim.domestic.officer",
  role: "domestic_regulator_officer",
  organizationId: "domestic-regulator-sandbox",
  organizationType: "domestic_regulator",
  permissions: ["review_cases", "forward_cases", "revoke_assurances"],
  activeFlag: true,
};

const COORDINATION_ACTOR: UserClaims = {
  userId: "sim-coordination-officer",
  username: "sim.coordination.officer",
  role: "coordination_officer",
  organizationId: "coordination-authority-sandbox",
  organizationType: "coordinating_authority",
  permissions: ["coordinate_cases", "issue_assurances"],
  activeFlag: true,
};

const FOREIGN_ACTOR: UserClaims = {
  userId: "sim-foreign-officer",
  username: "sim.foreign.officer",
  role: "foreign_regulator_officer",
  organizationId: "foreign-regulator-sandbox",
  organizationType: "foreign_regulator",
  permissions: ["review_forwarded_cases", "issue_decisions"],
  activeFlag: true,
};

const REQUIRED_INTAKE_DOCUMENTS: DocumentType[] = [
  "assurance_application_form",
  "item_technical_specification",
  "end_use_declaration",
];

@Injectable()
export class SimulatorService {
  private readonly exchangeLog: IntegrationExchangeRecord[] = [];

  constructor(
    private readonly casesService: CasesService,
    private readonly documentsService: DocumentsService,
    private readonly metrics: MetricsService,
  ) {}

  getScenarioCatalog() {
    return SYNTHETIC_SCENARIOS;
  }

  getMetricCatalog() {
    return METRICS;
  }

  listExchanges(): IntegrationExchangeRecord[] {
    return [...this.exchangeLog];
  }

  getExchangeSummary(): IntegrationExchangeSummary {
    const bySimulator: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    const byMessageType: Record<string, number> = {};

    for (const exchange of this.exchangeLog) {
      bySimulator[exchange.simulator] =
        (bySimulator[exchange.simulator] ?? 0) + 1;
      byStatus[exchange.status] = (byStatus[exchange.status] ?? 0) + 1;
      byMessageType[exchange.messageType] =
        (byMessageType[exchange.messageType] ?? 0) + 1;
    }

    return {
      totalExchanges: this.exchangeLog.length,
      bySimulator,
      byStatus,
      byMessageType,
    };
  }

  async submitDomesticIntake(message: DomesticIntakeMessage) {
    const startedAt = performance.now();
    this.assertDomesticIntakeMessage(message);

    const applicantActor = this.buildApplicantActor(
      message.applicant.applicantOrgId,
      message.applicant.applicantOrgName,
    );

    const draft = await this.casesService.createDraft({
      actor: applicantActor,
      payload: {
        ...(message.caseDraft satisfies Omit<
          CreateAssuranceCaseInput,
          "caseId" | "caseNumber" | "applicantOrgId" | "applicantOrgName"
        >),
        applicantOrgId: message.applicant.applicantOrgId,
        applicantOrgName: message.applicant.applicantOrgName,
      },
    });

    const uploadedDocumentIds: string[] = [];
    const uploadedDocumentTypes: DocumentType[] = [];

    for (const manifestEntry of message.documentManifest) {
      if (!manifestEntry.contentBase64) {
        continue;
      }

      const upload = await this.documentsService.uploadDocument({
        actor: applicantActor,
        caseId: draft.caseRecord.caseId,
        documentType: manifestEntry.documentType,
        fileName: manifestEntry.fileName,
        mimeType: manifestEntry.mimeType,
        classification: manifestEntry.classification,
        accessScope:
          manifestEntry.accessScope ??
          this.defaultAccessScope(manifestEntry.documentType),
        contentBase64: manifestEntry.contentBase64,
      });
      uploadedDocumentIds.push(upload.documentReference.documentId);
      uploadedDocumentTypes.push(upload.documentReference.documentType as DocumentType);
    }

    let caseRecord = draft.caseRecord;
    let transitionEvent = draft.event;
    let transitionTransactionId = draft.transactionId;

    if (message.autoSubmit !== false) {
      const submitted = await this.casesService.submitCase(draft.caseRecord.caseId, {
        actor: applicantActor,
        justification:
          "Domestic intake emulator hands the case into the cross-border workflow sandbox.",
        relatedDocumentIds: uploadedDocumentIds,
        documentTypes: uploadedDocumentTypes,
      });
      caseRecord = submitted.caseRecord;
      transitionEvent = submitted.event;
      transitionTransactionId = submitted.transactionId;
    }

    const statusSync = this.buildDomesticStatusSyncMessage(caseRecord.caseId, caseRecord);

    this.recordExchange({
      simulator: "domestic_emulator",
      messageType: "domestic_intake",
      direction: "inbound",
      status: "applied",
      caseId: caseRecord.caseId,
      correlationId: message.correlationId,
      details: {
        autoSubmit: message.autoSubmit !== false,
        uploadedDocumentCount: uploadedDocumentIds.length,
      },
    });
    this.recordExchange({
      simulator: "domestic_emulator",
      messageType: "domestic_status_sync",
      direction: "outbound",
      status: "generated",
      caseId: caseRecord.caseId,
      correlationId: message.correlationId,
      details: {
        state: caseRecord.currentState,
      },
    });

    this.metrics.record(
      "domestic_intake_latency_ms",
      performance.now() - startedAt,
      caseRecord.caseId,
      {
        autoSubmit: message.autoSubmit !== false,
        uploadedDocumentCount: uploadedDocumentIds.length,
      },
    );
    this.metrics.increment("integration_exchange_success_count", caseRecord.caseId, {
      simulator: "domestic_emulator",
      messageType: "domestic_intake",
    });

    return {
      caseRecord,
      uploadedDocumentIds,
      statusSync,
      transactionId: transitionTransactionId,
      event: transitionEvent,
    };
  }

  async buildDomesticStatusSync(caseId: string, externalCaseRef?: string) {
    const startedAt = performance.now();
    const caseRecord = await this.casesService.getCase(caseId);
    const message = this.buildDomesticStatusSyncMessage(
      caseId,
      caseRecord,
      externalCaseRef,
    );

    this.recordExchange({
      simulator: "domestic_emulator",
      messageType: "domestic_status_sync",
      direction: "outbound",
      status: "generated",
      caseId,
      correlationId: message.correlationId,
      details: {
        state: caseRecord.currentState,
      },
    });
    this.metrics.record(
      "status_sync_generation_ms",
      performance.now() - startedAt,
      caseId,
      { state: caseRecord.currentState },
    );
    this.metrics.increment("integration_exchange_success_count", caseId, {
      simulator: "domestic_emulator",
      messageType: "domestic_status_sync",
    });

    return message;
  }

  async buildForeignForwarding(caseId: string, responseDueAt?: string) {
    const caseRecord = await this.casesService.getCase(caseId);
    const documents = await this.documentsService.listCaseDocuments(caseId);
    const manifest = documents
      .filter(
        (document: DocumentReference) =>
          document.accessScope.includes("foreign_regulator") ||
          document.documentType === "coordination_forwarding_package",
      )
      .map((document) => this.toManifestEntry(document.documentId, document.documentType as DocumentType, {
        fileName: document.fileName,
        mimeType: document.mimeType,
        classification: document.classification,
        accessScope: document.accessScope,
        sha256Hash: document.sha256Hash,
      }));

    const message: ForeignForwardingMessage = {
      messageId: `msg-${randomUUID()}`,
      schemaVersion: INTEGRATION_SCHEMA_VERSION,
      timestamp: new Date().toISOString(),
      correlationId: `${caseId}:foreign-forward`,
      caseId,
      originatingAuthority: "coordinating_authority",
      destinationAuthority: "foreign_nuclear_regulator",
      caseSummary: {
        caseNumber: caseRecord.caseNumber,
        itemCategory: caseRecord.itemCategory,
        quantity: caseRecord.quantity,
        originJurisdiction: caseRecord.originJurisdiction,
        destinationJurisdiction: caseRecord.destinationJurisdiction,
        intendedUse: caseRecord.intendedUse,
      },
      documentManifest: manifest,
      responseDueAt:
        responseDueAt ??
        new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    };

    this.recordExchange({
      simulator: "foreign_simulator",
      messageType: "foreign_forwarding",
      direction: "outbound",
      status: "generated",
      caseId,
      correlationId: message.correlationId,
      details: {
        manifestCount: manifest.length,
      },
    });
    this.metrics.increment("integration_exchange_success_count", caseId, {
      simulator: "foreign_simulator",
      messageType: "foreign_forwarding",
    });

    return message;
  }

  async acknowledgeForeignReceipt(message: ForeignAcknowledgementMessage) {
    const startedAt = performance.now();
    this.assertForeignAcknowledgementMessage(message);

    const transition = await this.casesService.transitionCase(message.caseId, {
      actor: FOREIGN_ACTOR,
      action: "record_foreign_review",
      justification:
        "Foreign simulator acknowledged receipt and started foreign review.",
      relatedDocumentIds: [],
      documentTypes: [],
    });

    this.recordExchange({
      simulator: "foreign_simulator",
      messageType: "foreign_acknowledgement",
      direction: "inbound",
      status: "applied",
      caseId: message.caseId,
      correlationId: message.correlationId,
      details: {
        state: transition.caseRecord.currentState,
      },
    });
    this.metrics.record(
      "foreign_simulator_exchange_latency_ms",
      performance.now() - startedAt,
      message.caseId,
      { exchangeType: "acknowledgement" },
    );
    this.metrics.increment("integration_exchange_success_count", message.caseId, {
      simulator: "foreign_simulator",
      messageType: "foreign_acknowledgement",
    });

    return transition;
  }

  async applyForeignDecision(message: ForeignDecisionMessage) {
    const startedAt = performance.now();
    this.assertForeignDecisionMessage(message);

    let documentId: string | undefined;
    let transition;

    if (message.decision === "approved") {
      const upload = await this.documentsService.uploadDocument({
        actor: FOREIGN_ACTOR,
        caseId: message.caseId,
        documentType: "foreign_regulator_response",
        fileName: "foreign-decision.txt",
        mimeType: "text/plain",
        classification: "restricted",
        accessScope: [
          "domestic_regulator",
          "coordinating_authority",
          "foreign_regulator",
          "auditor_body",
        ],
        contentBase64: Buffer.from(
          `decision=approved\ncaseId=${message.caseId}\njustification=${message.justification}`,
          "utf8",
        ).toString("base64"),
      });
      documentId = upload.documentReference.documentId;
      transition = await this.casesService.transitionCase(message.caseId, {
        actor: FOREIGN_ACTOR,
        action: "approve_case",
        justification: message.justification,
        relatedDocumentIds: [documentId],
        documentTypes: ["foreign_regulator_response"],
      });
    } else if (message.decision === "rejected") {
      transition = await this.casesService.transitionCase(message.caseId, {
        actor: FOREIGN_ACTOR,
        action: "reject_case",
        justification: message.justification,
        relatedDocumentIds: [],
        documentTypes: [],
      });
    } else {
      const upload = await this.documentsService.uploadDocument({
        actor: FOREIGN_ACTOR,
        caseId: message.caseId,
        documentType: "request_for_information_notice",
        fileName: "request-for-information.txt",
        mimeType: "text/plain",
        classification: "restricted",
        accessScope: [
          "applicant_organization",
          "domestic_regulator",
          "coordinating_authority",
          "foreign_regulator",
          "auditor_body",
        ],
        contentBase64: Buffer.from(
          `decision=more_information_requested\ncaseId=${message.caseId}\njustification=${message.justification}`,
          "utf8",
        ).toString("base64"),
      });
      documentId = upload.documentReference.documentId;
      transition = await this.casesService.transitionCase(message.caseId, {
        actor: FOREIGN_ACTOR,
        action: "request_more_information",
        justification: message.justification,
        relatedDocumentIds: [documentId],
        documentTypes: ["request_for_information_notice"],
      });
    }

    this.recordExchange({
      simulator: "foreign_simulator",
      messageType: "foreign_decision",
      direction: "inbound",
      status: "applied",
      caseId: message.caseId,
      correlationId: message.correlationId,
      details: {
        decision: message.decision,
        documentAnchored: Boolean(documentId),
      },
    });
    this.metrics.record(
      "foreign_simulator_exchange_latency_ms",
      performance.now() - startedAt,
      message.caseId,
      { exchangeType: "decision", decision: message.decision },
    );
    this.metrics.increment("integration_exchange_success_count", message.caseId, {
      simulator: "foreign_simulator",
      messageType: "foreign_decision",
      decision: message.decision,
    });

    return {
      transition,
      documentId,
    };
  }

  private buildApplicantActor(
    organizationId: string,
    organizationName: string,
  ): UserClaims {
    return {
      userId: `${organizationId}-manager`,
      username: `${organizationName.toLowerCase().replace(/\s+/g, ".")}.manager`,
      role: "applicant_case_manager",
      organizationId,
      organizationType: "applicant_organization",
      permissions: [
        "create_case",
        "submit_case",
        "respond_to_information_request",
      ],
      activeFlag: true,
    };
  }

  private buildDomesticStatusSyncMessage(
    caseId: string,
    caseRecord: Awaited<ReturnType<CasesService["getCase"]>>,
    externalCaseRef?: string,
  ): DomesticStatusSyncMessage {
    return {
      messageId: `msg-${randomUUID()}`,
      schemaVersion: INTEGRATION_SCHEMA_VERSION,
      timestamp: new Date().toISOString(),
      correlationId: `${caseId}:domestic-status-sync`,
      caseId,
      externalCaseRef,
      state: caseRecord.currentState,
      substate: caseRecord.currentSubstate,
      reasonCode:
        caseRecord.currentState === "rejected"
          ? "rejected"
          : caseRecord.currentState === "revoked"
            ? "revoked"
            : null,
    };
  }

  private recordExchange(
    input: Omit<IntegrationExchangeRecord, "exchangeId" | "timestamp"> & {
      timestamp?: string;
    },
  ) {
    this.exchangeLog.push({
      exchangeId: `exchange-${randomUUID()}`,
      timestamp: input.timestamp ?? new Date().toISOString(),
      ...input,
    });
  }

  private toManifestEntry(
    documentId: string,
    documentType: DocumentType,
    overrides: Partial<IntegrationDocumentManifestEntry>,
  ): IntegrationDocumentManifestEntry {
    return {
      documentId,
      documentType,
      fileName: overrides.fileName ?? `${documentType}.txt`,
      mimeType: overrides.mimeType ?? "text/plain",
      classification: overrides.classification ?? "restricted",
      accessScope: overrides.accessScope,
      sha256Hash: overrides.sha256Hash,
      contentBase64: overrides.contentBase64,
    };
  }

  private defaultAccessScope(documentType: DocumentType): string[] {
    switch (documentType) {
      case "coordination_forwarding_package":
      case "foreign_regulator_response":
        return [
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

  private assertDomesticIntakeMessage(message: DomesticIntakeMessage) {
    const errors: string[] = [];

    if (!message.messageId) errors.push("messageId is required.");
    if (message.schemaVersion !== INTEGRATION_SCHEMA_VERSION) {
      errors.push(
        `schemaVersion must be "${INTEGRATION_SCHEMA_VERSION}".`,
      );
    }
    if (!message.timestamp) errors.push("timestamp is required.");
    if (!message.correlationId) errors.push("correlationId is required.");
    if (!message.sourceSystem) errors.push("sourceSystem is required.");
    if (!message.applicant?.applicantOrgId) {
      errors.push("applicant.applicantOrgId is required.");
    }
    if (!message.applicant?.applicantOrgName) {
      errors.push("applicant.applicantOrgName is required.");
    }
    if (!message.caseDraft?.itemCategory) {
      errors.push("caseDraft.itemCategory is required.");
    }
    if (!message.caseDraft?.itemDescription) {
      errors.push("caseDraft.itemDescription is required.");
    }
    if (!message.caseDraft?.originJurisdiction) {
      errors.push("caseDraft.originJurisdiction is required.");
    }
    if (!message.caseDraft?.destinationJurisdiction) {
      errors.push("caseDraft.destinationJurisdiction is required.");
    }
    if (!message.caseDraft?.intendedUse) {
      errors.push("caseDraft.intendedUse is required.");
    }

    if (message.autoSubmit !== false) {
      for (const requiredDocumentType of REQUIRED_INTAKE_DOCUMENTS) {
        const manifestEntry = message.documentManifest.find(
          (document) => document.documentType === requiredDocumentType,
        );
        if (!manifestEntry?.contentBase64) {
          errors.push(
            `autoSubmit requires inline contentBase64 for ${requiredDocumentType}.`,
          );
        }
      }
    }

    if (errors.length > 0) {
      this.metrics.increment("integration_exchange_failure_count", message.caseId, {
        simulator: "domestic_emulator",
        messageType: "domestic_intake",
      });
      this.metrics.increment("schema_validation_failure_count", message.caseId, {
        simulator: "domestic_emulator",
        messageType: "domestic_intake",
      });
      throw new BadRequestException(errors.join(" "));
    }
  }

  private assertForeignAcknowledgementMessage(
    message: ForeignAcknowledgementMessage,
  ) {
    const errors: string[] = [];

    if (!message.messageId) errors.push("messageId is required.");
    if (message.schemaVersion !== INTEGRATION_SCHEMA_VERSION) {
      errors.push(
        `schemaVersion must be "${INTEGRATION_SCHEMA_VERSION}".`,
      );
    }
    if (!message.caseId) errors.push("caseId is required.");
    if (!message.correlationId) errors.push("correlationId is required.");
    if (message.status !== "acknowledged") {
      errors.push('status must be "acknowledged".');
    }

    if (errors.length > 0) {
      this.metrics.increment("integration_exchange_failure_count", message.caseId, {
        simulator: "foreign_simulator",
        messageType: "foreign_acknowledgement",
      });
      this.metrics.increment("schema_validation_failure_count", message.caseId, {
        simulator: "foreign_simulator",
        messageType: "foreign_acknowledgement",
      });
      throw new BadRequestException(errors.join(" "));
    }
  }

  private assertForeignDecisionMessage(message: ForeignDecisionMessage) {
    const errors: string[] = [];

    if (!message.messageId) errors.push("messageId is required.");
    if (message.schemaVersion !== INTEGRATION_SCHEMA_VERSION) {
      errors.push(
        `schemaVersion must be "${INTEGRATION_SCHEMA_VERSION}".`,
      );
    }
    if (!message.caseId) errors.push("caseId is required.");
    if (!message.correlationId) errors.push("correlationId is required.");
    if (!message.justification?.trim()) {
      errors.push("justification is required.");
    }
    if (
      !["approved", "rejected", "more_information_requested"].includes(
        message.decision,
      )
    ) {
      errors.push(
        'decision must be "approved", "rejected", or "more_information_requested".',
      );
    }

    if (errors.length > 0) {
      this.metrics.increment("integration_exchange_failure_count", message.caseId, {
        simulator: "foreign_simulator",
        messageType: "foreign_decision",
      });
      this.metrics.increment("schema_validation_failure_count", message.caseId, {
        simulator: "foreign_simulator",
        messageType: "foreign_decision",
      });
      throw new BadRequestException(errors.join(" "));
    }
  }
}
