import { Injectable } from "@nestjs/common";
import type {
  CreateAssuranceCaseInput,
  DocumentReference,
  DocumentType,
  UserClaims,
  WorkflowActionType,
} from "@prototype/shared";
import { CasesService } from "../cases/cases.service.js";
import { DocumentsService } from "../documents/documents.service.js";

interface SeedSummary {
  seriesId: string;
  casesCreated: number;
  documentsAnchored: number;
}

type SeedSeriesId =
  | "anchor"
  | "draft"
  | "submitted"
  | "issued"
  | "approved_amendment";

interface BenchmarkSeedConfig {
  namespace: string;
  anchorCount: number;
  draftCount: number;
  submittedCount: number;
  issuedCount: number;
  approvedAmendmentCount: number;
  enabledSeries: Set<SeedSeriesId>;
}

export interface BenchmarkSeedReport {
  startedAt: string;
  finishedAt: string;
  namespace: string;
  totalCasesCreated: number;
  totalDocumentsAnchored: number;
  series: SeedSummary[];
}

const APPLICANT_ACTOR: UserClaims = {
  userId: "benchmark-applicant-user",
  username: "benchmark.applicant",
  role: "applicant_case_manager",
  organizationId: "applicant-org-benchmark",
  organizationType: "applicant_organization",
  permissions: [],
  activeFlag: true,
};

const DOMESTIC_ACTOR: UserClaims = {
  userId: "benchmark-domestic-user",
  username: "benchmark.domestic",
  role: "domestic_regulator_officer",
  organizationId: "domestic-regulator-benchmark",
  organizationType: "domestic_regulator",
  permissions: [],
  activeFlag: true,
};

const COORDINATION_ACTOR: UserClaims = {
  userId: "benchmark-coordination-user",
  username: "benchmark.coordination",
  role: "coordination_officer",
  organizationId: "coordination-authority-benchmark",
  organizationType: "coordinating_authority",
  permissions: [],
  activeFlag: true,
};

const FOREIGN_ACTOR: UserClaims = {
  userId: "benchmark-foreign-user",
  username: "benchmark.foreign",
  role: "foreign_regulator_officer",
  organizationId: "foreign-regulator-benchmark",
  organizationType: "foreign_regulator",
  permissions: [],
  activeFlag: true,
};

@Injectable()
export class BenchmarkSeedService {
  constructor(
    private readonly casesService: CasesService,
    private readonly documentsService: DocumentsService,
  ) {}

  async seedDefaultDataset(): Promise<BenchmarkSeedReport> {
    const startedAt = new Date().toISOString();
    const config = this.resolveConfig();
    const series: SeedSummary[] = [];

    if (config.enabledSeries.has("anchor")) {
      series.push(
        await this.seedAnchorCases(config.namespace, config.anchorCount),
      );
    }
    if (config.enabledSeries.has("draft")) {
      series.push(
        await this.seedDraftSubmissionCases(
          config.namespace,
          config.draftCount,
        ),
      );
    }
    if (config.enabledSeries.has("submitted")) {
      series.push(
        await this.seedSubmittedCases(
          config.namespace,
          config.submittedCount,
        ),
      );
    }
    if (config.enabledSeries.has("issued")) {
      series.push(
        await this.seedIssuedCases(config.namespace, config.issuedCount),
      );
    }
    if (config.enabledSeries.has("approved_amendment")) {
      series.push(
        await this.seedApprovedAmendmentCases(
          config.namespace,
          config.approvedAmendmentCount,
        ),
      );
    }

    return {
      startedAt,
      finishedAt: new Date().toISOString(),
      namespace: config.namespace,
      totalCasesCreated: series.reduce(
        (sum, entry) => sum + entry.casesCreated,
        0,
      ),
      totalDocumentsAnchored: series.reduce(
        (sum, entry) => sum + entry.documentsAnchored,
        0,
      ),
      series,
    };
  }

  private async seedAnchorCases(
    namespace: string,
    count: number,
  ): Promise<SeedSummary> {
    let casesCreated = 0;
    for (let index = 1; index <= count; index += 1) {
      const suffix = this.formatIndex(index);
      await this.createDraftCase(
        this.seedId(namespace, "anchor-case", suffix),
        `BENCH-ANC-${suffix}`,
        `Benchmark anchor case ${suffix}`,
      );
      casesCreated += 1;
    }

    return {
      seriesId: "anchor-cases",
      casesCreated,
      documentsAnchored: 0,
    };
  }

  private async seedDraftSubmissionCases(
    namespace: string,
    count: number,
  ): Promise<SeedSummary> {
    let casesCreated = 0;
    let documentsAnchored = 0;

    for (let index = 1; index <= count; index += 1) {
      const suffix = this.formatIndex(index);
      const caseId = this.seedId(namespace, "draft-case", suffix);
      await this.createDraftCase(
        caseId,
        `BENCH-DRF-${suffix}`,
        `Benchmark draft submission case ${suffix}`,
      );
      casesCreated += 1;

      for (const definition of [
        {
          documentId: this.seedId(namespace, "doc-app-form", suffix),
          documentType: "assurance_application_form",
          label: "submission application form",
        },
        {
          documentId: this.seedId(namespace, "doc-spec", suffix),
          documentType: "item_technical_specification",
          label: "submission technical specification",
        },
        {
          documentId: this.seedId(namespace, "doc-enduse", suffix),
          documentType: "end_use_declaration",
          label: "submission end-use declaration",
        },
      ] as const) {
        await this.uploadSeedDocument(
          caseId,
          definition.documentId,
          definition.documentType,
          APPLICANT_ACTOR,
          definition.label,
          index,
        );
        documentsAnchored += 1;
      }
    }

    return {
      seriesId: "draft-cases-for-submit-benchmark",
      casesCreated,
      documentsAnchored,
    };
  }

  private async seedSubmittedCases(
    namespace: string,
    count: number,
  ): Promise<SeedSummary> {
    let casesCreated = 0;
    let documentsAnchored = 0;

    for (let index = 1; index <= count; index += 1) {
      const suffix = this.formatIndex(index);
      const caseId = this.seedId(namespace, "submitted-case", suffix);
      await this.createDraftCase(
        caseId,
        `BENCH-SUB-${suffix}`,
        `Benchmark submitted case ${suffix}`,
      );
      casesCreated += 1;

      const relatedDocumentIds = [
        this.seedId(namespace, "submitted-doc-app-form", suffix),
        this.seedId(namespace, "submitted-doc-spec", suffix),
        this.seedId(namespace, "submitted-doc-enduse", suffix),
      ];
      const documentTypes: DocumentType[] = [
        "assurance_application_form",
        "item_technical_specification",
        "end_use_declaration",
      ];

      await this.uploadSeedDocument(
        caseId,
        relatedDocumentIds[0],
        "assurance_application_form",
        APPLICANT_ACTOR,
        "submitted application form",
        index,
      );
      await this.uploadSeedDocument(
        caseId,
        relatedDocumentIds[1],
        "item_technical_specification",
        APPLICANT_ACTOR,
        "submitted technical specification",
        index,
      );
      await this.uploadSeedDocument(
        caseId,
        relatedDocumentIds[2],
        "end_use_declaration",
        APPLICANT_ACTOR,
        "submitted end-use declaration",
        index,
      );
      documentsAnchored += relatedDocumentIds.length;

      await this.transitionCase(
        caseId,
        APPLICANT_ACTOR,
        "submit_case",
        "Seed benchmark case submission.",
        relatedDocumentIds,
        documentTypes,
      );
    }

    return {
      seriesId: "submitted-cases-for-domestic-review-benchmark",
      casesCreated,
      documentsAnchored,
    };
  }

  private async seedIssuedCases(
    namespace: string,
    count: number,
  ): Promise<SeedSummary> {
    let casesCreated = 0;
    let documentsAnchored = 0;

    for (let index = 1; index <= count; index += 1) {
      const suffix = this.formatIndex(index);
      const caseId = this.seedId(namespace, "issued-case", suffix);
      await this.createDraftCase(
        caseId,
        `BENCH-ISS-${suffix}`,
        `Benchmark issued case ${suffix}`,
      );
      casesCreated += 1;

      const submissionDocs = await this.seedSubmissionBundle(
        caseId,
        namespace,
        suffix,
        "issued",
      );
      documentsAnchored += submissionDocs.length;

      await this.transitionCase(
        caseId,
        APPLICANT_ACTOR,
        "submit_case",
        "Seed issued case submission.",
        submissionDocs,
        [
          "assurance_application_form",
          "item_technical_specification",
          "end_use_declaration",
        ],
      );
      await this.transitionCase(
        caseId,
        DOMESTIC_ACTOR,
        "record_domestic_review",
        "Seed issued case domestic review start.",
      );
      await this.transitionCase(
        caseId,
        DOMESTIC_ACTOR,
        "forward_to_coordination",
        "Seed issued case forwarded to coordination.",
      );

      const forwardingDocument = await this.uploadSeedDocument(
        caseId,
        this.seedId(namespace, "issued-doc-forwarding", suffix),
        "coordination_forwarding_package",
        COORDINATION_ACTOR,
        "issued case forwarding package",
        index,
      );
      documentsAnchored += 1;

      await this.transitionCase(
        caseId,
        COORDINATION_ACTOR,
        "forward_to_foreign_authority",
        "Seed issued case forwarding to foreign authority.",
        [forwardingDocument.documentId],
        ["coordination_forwarding_package"],
      );
      await this.transitionCase(
        caseId,
        FOREIGN_ACTOR,
        "record_foreign_review",
        "Seed issued case foreign review start.",
      );

      const foreignResponse = await this.uploadSeedDocument(
        caseId,
        this.seedId(namespace, "issued-doc-foreign-response", suffix),
        "foreign_regulator_response",
        FOREIGN_ACTOR,
        "issued case foreign response",
        index,
      );
      documentsAnchored += 1;

      await this.transitionCase(
        caseId,
        FOREIGN_ACTOR,
        "approve_case",
        "Seed issued case approval.",
        [foreignResponse.documentId],
        ["foreign_regulator_response"],
      );

      const assuranceInstrument = await this.uploadSeedDocument(
        caseId,
        this.seedId(namespace, "doc-assurance-instrument-v1", suffix),
        "assurance_instrument",
        COORDINATION_ACTOR,
        "issued case assurance instrument",
        index,
      );
      documentsAnchored += 1;

      await this.transitionCase(
        caseId,
        COORDINATION_ACTOR,
        "issue_assurance",
        "Seed issued assurance for benchmarking.",
        [assuranceInstrument.documentId],
        ["assurance_instrument"],
      );

      await this.uploadSeedDocument(
        caseId,
        this.seedId(namespace, "doc-amendment-request", suffix),
        "amendment_request_package",
        DOMESTIC_ACTOR,
        "issued case amendment request package",
        index,
      );
      documentsAnchored += 1;
    }

    return {
      seriesId: "issued-cases-for-versioning-and-amendment-initiation",
      casesCreated,
      documentsAnchored,
    };
  }

  private async seedApprovedAmendmentCases(
    namespace: string,
    count: number,
  ): Promise<SeedSummary> {
    let casesCreated = 0;
    let documentsAnchored = 0;

    for (let index = 1; index <= count; index += 1) {
      const suffix = this.formatIndex(index);
      const caseId = this.seedId(namespace, "approved-amendment-case", suffix);
      await this.createDraftCase(
        caseId,
        `BENCH-AMD-${suffix}`,
        `Benchmark approved amendment case ${suffix}`,
      );
      casesCreated += 1;

      const submissionDocs = await this.seedSubmissionBundle(
        caseId,
        namespace,
        suffix,
        "approved",
      );
      documentsAnchored += submissionDocs.length;

      await this.transitionCase(
        caseId,
        APPLICANT_ACTOR,
        "submit_case",
        "Seed approved amendment case submission.",
        submissionDocs,
        [
          "assurance_application_form",
          "item_technical_specification",
          "end_use_declaration",
        ],
      );
      await this.transitionCase(
        caseId,
        DOMESTIC_ACTOR,
        "record_domestic_review",
        "Seed approved amendment case domestic review start.",
      );
      await this.transitionCase(
        caseId,
        DOMESTIC_ACTOR,
        "forward_to_coordination",
        "Seed approved amendment case forwarded to coordination.",
      );

      const initialForwarding = await this.uploadSeedDocument(
        caseId,
        this.seedId(namespace, "approved-doc-forwarding", suffix),
        "coordination_forwarding_package",
        COORDINATION_ACTOR,
        "approved amendment case initial forwarding package",
        index,
      );
      documentsAnchored += 1;

      await this.transitionCase(
        caseId,
        COORDINATION_ACTOR,
        "forward_to_foreign_authority",
        "Seed approved amendment case initial forwarding to foreign authority.",
        [initialForwarding.documentId],
        ["coordination_forwarding_package"],
      );
      await this.transitionCase(
        caseId,
        FOREIGN_ACTOR,
        "record_foreign_review",
        "Seed approved amendment case foreign review start.",
      );

      const initialForeignResponse = await this.uploadSeedDocument(
        caseId,
        this.seedId(namespace, "approved-doc-foreign-response-v1", suffix),
        "foreign_regulator_response",
        FOREIGN_ACTOR,
        "approved amendment case initial foreign response",
        index,
      );
      documentsAnchored += 1;

      await this.transitionCase(
        caseId,
        FOREIGN_ACTOR,
        "approve_case",
        "Seed approved amendment case initial approval.",
        [initialForeignResponse.documentId],
        ["foreign_regulator_response"],
      );

      const initialAssuranceInstrument = await this.uploadSeedDocument(
        caseId,
        this.seedId(namespace, "approved-doc-assurance-instrument-v1", suffix),
        "assurance_instrument",
        COORDINATION_ACTOR,
        "approved amendment case initial assurance instrument",
        index,
      );
      documentsAnchored += 1;

      await this.transitionCase(
        caseId,
        COORDINATION_ACTOR,
        "issue_assurance",
        "Seed approved amendment case initial issuance.",
        [initialAssuranceInstrument.documentId],
        ["assurance_instrument"],
      );

      const amendmentRequest = await this.uploadSeedDocument(
        caseId,
        this.seedId(namespace, "doc-amendment-package-approved", suffix),
        "amendment_request_package",
        DOMESTIC_ACTOR,
        "approved amendment case amendment request",
        index,
      );
      documentsAnchored += 1;

      await this.transitionCase(
        caseId,
        DOMESTIC_ACTOR,
        "initiate_substantive_amendment",
        "Seed approved amendment case substantive amendment initiation.",
        [amendmentRequest.documentId],
        ["amendment_request_package"],
      );
      await this.transitionCase(
        caseId,
        DOMESTIC_ACTOR,
        "forward_to_coordination",
        "Seed approved amendment case forwarded to coordination after amendment initiation.",
      );

      const amendmentForwarding = await this.uploadSeedDocument(
        caseId,
        this.seedId(namespace, "approved-doc-amendment-forwarding", suffix),
        "coordination_forwarding_package",
        COORDINATION_ACTOR,
        "approved amendment case amendment forwarding package",
        index,
      );
      documentsAnchored += 1;

      await this.transitionCase(
        caseId,
        COORDINATION_ACTOR,
        "forward_to_foreign_authority",
        "Seed approved amendment case forwarded to foreign authority for renewed review.",
        [amendmentForwarding.documentId],
        ["coordination_forwarding_package"],
      );
      await this.transitionCase(
        caseId,
        FOREIGN_ACTOR,
        "record_foreign_review",
        "Seed approved amendment case renewed foreign review start.",
      );

      const renewedForeignResponse = await this.uploadSeedDocument(
        caseId,
        this.seedId(namespace, "approved-doc-foreign-response-v2", suffix),
        "foreign_regulator_response",
        FOREIGN_ACTOR,
        "approved amendment case renewed foreign response",
        index,
        initialForeignResponse.documentId,
      );
      documentsAnchored += 1;

      await this.transitionCase(
        caseId,
        FOREIGN_ACTOR,
        "approve_case",
        "Seed approved amendment case renewed approval.",
        [renewedForeignResponse.documentId],
        ["foreign_regulator_response"],
      );

      await this.uploadSeedDocument(
        caseId,
        this.seedId(namespace, "doc-amended-instrument", suffix),
        "assurance_instrument",
        COORDINATION_ACTOR,
        "approved amendment case amended assurance instrument",
        index,
        initialAssuranceInstrument.documentId,
      );
      documentsAnchored += 1;
    }

    return {
      seriesId: "approved-amendment-cases-for-finalization-benchmark",
      casesCreated,
      documentsAnchored,
    };
  }

  private async createDraftCase(
    caseId: string,
    caseNumber: string,
    itemDescription: string,
  ): Promise<void> {
    const input: CreateAssuranceCaseInput = {
      caseId,
      caseNumber,
      applicantOrgId: APPLICANT_ACTOR.organizationId,
      applicantOrgName: "Benchmark Applicant Organization",
      itemCategory: "fresh_fuel_component",
      itemDescription,
      quantity: 1,
      originJurisdiction: "Jurisdiction-A",
      destinationJurisdiction: "Jurisdiction-B",
      intendedUse: "peaceful_nuclear_power_generation",
      legalTreatyBasis: "benchmark-assurance-basis",
      priority: "routine",
      remarksSummary: `Deterministic benchmark seed for ${caseId}.`,
      visibilityScope: [
        "applicant_organization",
        "domestic_regulator",
        "coordinating_authority",
        "foreign_regulator",
        "auditor_body",
      ],
    };

    await this.casesService.createDraftFromInput(input, APPLICANT_ACTOR);
  }

  private async seedSubmissionBundle(
    caseId: string,
    namespace: string,
    suffix: string,
    prefix: string,
  ): Promise<string[]> {
    const application = await this.uploadSeedDocument(
      caseId,
      this.seedId(namespace, `${prefix}-doc-app-form`, suffix),
      "assurance_application_form",
      APPLICANT_ACTOR,
      "benchmark application form",
      Number(suffix),
    );
    const specification = await this.uploadSeedDocument(
      caseId,
      this.seedId(namespace, `${prefix}-doc-spec`, suffix),
      "item_technical_specification",
      APPLICANT_ACTOR,
      "benchmark technical specification",
      Number(suffix),
    );
    const endUse = await this.uploadSeedDocument(
      caseId,
      this.seedId(namespace, `${prefix}-doc-enduse`, suffix),
      "end_use_declaration",
      APPLICANT_ACTOR,
      "benchmark end-use declaration",
      Number(suffix),
    );

    return [application.documentId, specification.documentId, endUse.documentId];
  }

  private async uploadSeedDocument(
    caseId: string,
    documentId: string,
    documentType: DocumentType,
    actor: UserClaims,
    label: string,
    seedIndex: number,
    supersedesDocumentId?: string,
  ): Promise<DocumentReference> {
    const uploadedAt = this.buildTimestamp(seedIndex);
    const result = await this.documentsService.uploadDocument(
      {
        actor,
        caseId,
        documentType,
        fileName: `${documentType}.txt`,
        mimeType: "text/plain",
        classification: "restricted",
        accessScope: this.defaultAccessScope(documentType),
        contentBase64: this.buildContentBase64(caseId, documentId, documentType, label),
        supersedesDocumentId,
      },
      {
        documentId,
        objectKey: `benchmark-seed/${caseId}/${documentId}.txt`,
        uploadedAt,
      },
    );

    return result.documentReference;
  }

  private async transitionCase(
    caseId: string,
    actor: UserClaims,
    action: Exclude<WorkflowActionType, "create_case">,
    justification: string,
    relatedDocumentIds: string[] = [],
    documentTypes?: DocumentType[],
  ): Promise<void> {
    await this.casesService.transitionCase(caseId, {
      actor,
      action,
      justification,
      relatedDocumentIds,
      documentTypes,
    });
  }

  private buildContentBase64(
    caseId: string,
    documentId: string,
    documentType: DocumentType,
    label: string,
  ): string {
    return Buffer.from(
      [
        `caseId=${caseId}`,
        `documentId=${documentId}`,
        `documentType=${documentType}`,
        `label=${label}`,
        "seedProfile=deterministic-benchmark",
      ].join("\n"),
      "utf8",
    ).toString("base64");
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
      case "assurance_instrument":
        return [
          "applicant_organization",
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

  private buildTimestamp(seedIndex: number): string {
    const base = Date.UTC(2026, 0, 1, 0, 0, 0, 0);
    return new Date(base + seedIndex * 60_000).toISOString();
  }

  private resolveConfig(): BenchmarkSeedConfig {
    const profile = (process.env.BENCHMARK_SEED_PROFILE ?? "full").toLowerCase();
    const defaults =
      profile === "smoke"
        ? {
            anchorCount: 1,
            draftCount: 1,
            submittedCount: 1,
            issuedCount: 1,
            approvedAmendmentCount: 1,
          }
        : {
            anchorCount: 25,
            draftCount: 20,
            submittedCount: 20,
            issuedCount: 20,
            approvedAmendmentCount: 20,
          };
    const enabledSeries = new Set<SeedSeriesId>(
      (
        process.env.BENCHMARK_SEED_SERIES ??
        "anchor,draft,submitted,issued,approved_amendment"
      )
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean) as SeedSeriesId[],
    );

    return {
      namespace: process.env.BENCHMARK_SEED_NAMESPACE ?? "bench",
      anchorCount: Number(
        process.env.BENCHMARK_SEED_COUNT_ANCHOR ?? defaults.anchorCount,
      ),
      draftCount: Number(
        process.env.BENCHMARK_SEED_COUNT_DRAFT ?? defaults.draftCount,
      ),
      submittedCount: Number(
        process.env.BENCHMARK_SEED_COUNT_SUBMITTED ?? defaults.submittedCount,
      ),
      issuedCount: Number(
        process.env.BENCHMARK_SEED_COUNT_ISSUED ?? defaults.issuedCount,
      ),
      approvedAmendmentCount: Number(
        process.env.BENCHMARK_SEED_COUNT_APPROVED_AMENDMENT ??
          defaults.approvedAmendmentCount,
      ),
      enabledSeries,
    };
  }

  private seedId(namespace: string, stem: string, suffix: string): string {
    return `${namespace}-${stem}-${suffix}`;
  }

  private formatIndex(index: number): string {
    return String(index).padStart(4, "0");
  }
}
