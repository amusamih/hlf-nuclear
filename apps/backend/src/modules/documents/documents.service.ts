import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { BadRequestException, Injectable } from "@nestjs/common";
import {
  DOCUMENT_TYPES,
  type DocumentReference,
  type DocumentType,
  type UserClaims,
} from "@prototype/shared";
import { FabricRelayService } from "../fabric/fabric.service.js";
import { MetricsService } from "../metrics/metrics.service.js";
import { buildLedgerReference } from "../projections/ledger-reference.js";
import { ProjectionStoreService } from "../projections/projections.service.js";
import { StorageService } from "../storage/storage.service.js";

export interface UploadDocumentRequest {
  actor: UserClaims;
  caseId: string;
  documentType: DocumentType;
  fileName: string;
  mimeType: string;
  classification: DocumentReference["classification"];
  accessScope: string[];
  contentBase64: string;
  supersedesDocumentId?: string;
}

interface UploadDocumentOptions {
  documentId?: string;
  objectKey?: string;
  uploadedAt?: string;
}

@Injectable()
export class DocumentsService {
  private readonly bucket = "assurance-documents";

  constructor(
    private readonly storage: StorageService,
    private readonly fabricRelay: FabricRelayService,
    private readonly projections: ProjectionStoreService,
    private readonly metrics: MetricsService,
  ) {}

  async uploadDocument(
    request: UploadDocumentRequest,
    options: UploadDocumentOptions = {},
  ): Promise<{ documentReference: DocumentReference; transactionId: string }> {
    const startedAt = performance.now();
    if (!DOCUMENT_TYPES.includes(request.documentType)) {
      throw new BadRequestException(
        `Unknown documentType "${request.documentType}".`,
      );
    }
    await this.projections.getCase(request.caseId);

    let version = 1;
    let previousDocument: DocumentReference | undefined;
    if (request.supersedesDocumentId) {
      previousDocument = await this.projections.getDocument(
        request.supersedesDocumentId,
      );
      version = previousDocument.version + 1;
    }
    const currentCase = await this.projections.getCase(request.caseId);

    const documentId = options.documentId ?? `doc-${randomUUID()}`;
    const uploadedAt = options.uploadedAt ?? new Date().toISOString();
    const storageDescriptor = await this.storage.storeObject({
      bucket: this.bucket,
      contentBase64: request.contentBase64,
      objectKey:
        options.objectKey ??
        `${request.caseId}/${documentId}/v${version}/${request.fileName}`,
    });

    const documentReference: DocumentReference = {
      documentId,
      caseId: request.caseId,
      documentType: request.documentType,
      storageBucket: storageDescriptor.bucket,
      storageKey: storageDescriptor.objectKey,
      sha256Hash: storageDescriptor.sha256Hash,
      fileName: request.fileName,
      mimeType: request.mimeType,
      version,
      uploadedBy: request.actor.userId,
      uploadedAt,
      classification: request.classification,
      accessScope: request.accessScope,
      supersedesDocumentId: request.supersedesDocumentId,
      isActive: true,
    };

    try {
      const relayResult = await this.fabricRelay.anchorDocumentReference(
        documentReference,
        request.actor,
      );
      const updatedCase = {
        ...currentCase,
        activeDocumentIds: Array.from(
          new Set(
            previousDocument
              ? currentCase.activeDocumentIds
                  .filter(
                    (activeDocumentId) =>
                      activeDocumentId !== previousDocument?.documentId,
                  )
                  .concat(documentReference.documentId)
              : currentCase.activeDocumentIds.concat(documentReference.documentId),
          ),
        ),
        lastUpdatedAt: documentReference.uploadedAt,
      };
      await this.projections.persistDocumentUpdate(
        documentReference,
        buildLedgerReference({
          transactionId: relayResult.transactionId,
          invocationPlan: relayResult.invocationPlan,
          documentReference,
        }),
        previousDocument,
      );
      await this.projections.persistCaseSnapshot(
        updatedCase,
        buildLedgerReference({
          transactionId: relayResult.transactionId,
          invocationPlan: relayResult.invocationPlan,
          caseRecord: updatedCase,
        }),
      );
      this.metrics.record(
        "document_anchor_latency_ms",
        performance.now() - startedAt,
        request.caseId,
        { documentType: request.documentType },
      );

      return {
        documentReference,
        transactionId: relayResult.transactionId,
      };
    } catch (error) {
      await this.storage.deleteObject(
        storageDescriptor.bucket,
        storageDescriptor.objectKey,
      );
      throw error;
    }
  }

  listCaseDocuments(caseId: string): Promise<DocumentReference[]> {
    return this.projections.listCaseDocuments(caseId);
  }

  async verifyDocument(documentId: string): Promise<{
    documentReference: DocumentReference;
    verified: boolean;
  }> {
    const startedAt = performance.now();
    const documentReference = await this.projections.getDocument(documentId);
    const verified = await this.storage.verifyObjectHash(
      documentReference.storageBucket,
      documentReference.storageKey,
      documentReference.sha256Hash,
    );

    this.metrics.record(
      "document_integrity_verification_ms",
      performance.now() - startedAt,
      documentReference.caseId,
      { documentId },
    );

    if (!verified) {
      this.metrics.increment(
        "document_hash_mismatch_count",
        documentReference.caseId,
        { documentId },
      );
    }

    return {
      documentReference,
      verified,
    };
  }
}
