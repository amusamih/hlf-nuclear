import {
  DOCUMENT_TYPES,
  type AssuranceCase,
  type DocumentReference,
  type DocumentType,
  type UserClaims,
} from "@prototype/shared";
import {
  Context,
  Contract,
  Info,
  Returns,
  Transaction,
} from "fabric-contract-api";
import {
  caseDocumentKey,
  caseKey,
  documentKey,
} from "../lib/keys.js";
import { assertDocumentMutationAllowed } from "../lib/policy.js";

function parseJson<T>(payload: string): T {
  return JSON.parse(payload) as T;
}

@Info({
  title: "DocumentContract",
  description:
    "Anchors off-chain document metadata and immutable hash references for assurance cases.",
})
export class DocumentContract extends Contract {
  @Transaction()
  @Returns("string")
  async addDocumentReference(
    ctx: Context,
    payloadJson: string,
    actorJson: string,
    timestampIso: string,
  ): Promise<string> {
    const documentReference = parseJson<DocumentReference>(payloadJson);
    const actor = parseJson<UserClaims>(actorJson);
    const documentType = this.assertKnownDocumentType(documentReference.documentType);
    assertDocumentMutationAllowed(actor, documentType);
    const caseRecord = await this.getCaseRecord(ctx, documentReference.caseId);
    const existingPayload = await ctx.stub.getState(
      documentKey(documentReference.documentId),
    );

    if (existingPayload && existingPayload.length > 0) {
      throw new Error(
        `Document "${documentReference.documentId}" already exists. Silent overwrites are forbidden.`,
      );
    }

    if (documentReference.supersedesDocumentId) {
      throw new Error(
        `Document "${documentReference.documentId}" declares supersedesDocumentId. Use updateDocumentVersion for explicit version replacement.`,
      );
    }

    if (documentReference.version !== 1) {
      throw new Error(
        `Initial document "${documentReference.documentId}" must start at version 1.`,
      );
    }

    const storedDocument: DocumentReference = {
      ...documentReference,
      isActive: true,
    };

    await ctx.stub.putState(
      documentKey(storedDocument.documentId),
      Buffer.from(JSON.stringify(storedDocument)),
    );
    await ctx.stub.putState(
      caseDocumentKey(storedDocument.caseId, storedDocument.documentId),
      Buffer.from(JSON.stringify({ documentId: storedDocument.documentId })),
    );
    await this.putCaseRecord(ctx, {
      ...caseRecord,
      activeDocumentIds: Array.from(
        new Set([...caseRecord.activeDocumentIds, storedDocument.documentId]),
      ),
      lastUpdatedAt: timestampIso,
    });
    ctx.stub.setEvent(
      "document.added",
      Buffer.from(JSON.stringify(storedDocument)),
    );

    return JSON.stringify(storedDocument);
  }

  @Transaction()
  @Returns("string")
  async updateDocumentVersion(
    ctx: Context,
    payloadJson: string,
    actorJson: string,
    timestampIso: string,
  ): Promise<string> {
    const nextDocument = parseJson<DocumentReference>(payloadJson);
    const actor = parseJson<UserClaims>(actorJson);
    const documentType = this.assertKnownDocumentType(nextDocument.documentType);
    assertDocumentMutationAllowed(actor, documentType);

    if (!nextDocument.supersedesDocumentId) {
      throw new Error(
        `Document "${nextDocument.documentId}" must specify supersedesDocumentId when versioning.`,
      );
    }

    const caseRecord = await this.getCaseRecord(ctx, nextDocument.caseId);
    const supersededDocument = await this.getDocument(ctx, nextDocument.supersedesDocumentId);

    if (supersededDocument.caseId !== nextDocument.caseId) {
      throw new Error(
        "Superseding document must belong to the same case as the superseded version.",
      );
    }

    if (supersededDocument.documentType !== nextDocument.documentType) {
      throw new Error(
        "Superseding document must preserve the original document type.",
      );
    }

    if (nextDocument.version !== supersededDocument.version + 1) {
      throw new Error(
        `Document "${nextDocument.documentId}" must increment version exactly from ${supersededDocument.version} to ${supersededDocument.version + 1}.`,
      );
    }

    const existingPayload = await ctx.stub.getState(documentKey(nextDocument.documentId));
    if (existingPayload && existingPayload.length > 0) {
      throw new Error(
        `Document "${nextDocument.documentId}" already exists. Silent overwrites are forbidden.`,
      );
    }

    const updatedSupersededDocument: DocumentReference = {
      ...supersededDocument,
      isActive: false,
    };

    await ctx.stub.putState(
      documentKey(updatedSupersededDocument.documentId),
      Buffer.from(JSON.stringify(updatedSupersededDocument)),
    );
    const storedNextDocument: DocumentReference = {
      ...nextDocument,
      isActive: true,
    };
    await ctx.stub.putState(
      documentKey(nextDocument.documentId),
      Buffer.from(JSON.stringify(storedNextDocument)),
    );
    await ctx.stub.putState(
      caseDocumentKey(nextDocument.caseId, nextDocument.documentId),
      Buffer.from(JSON.stringify({ documentId: nextDocument.documentId })),
    );
    await this.putCaseRecord(ctx, {
      ...caseRecord,
      activeDocumentIds: Array.from(
        new Set(
          caseRecord.activeDocumentIds
            .filter((documentId) => documentId !== updatedSupersededDocument.documentId)
            .concat(storedNextDocument.documentId),
        ),
      ),
      lastUpdatedAt: timestampIso,
    });

    const eventPayload = {
      documentId: nextDocument.documentId,
      supersedesDocumentId: nextDocument.supersedesDocumentId,
      caseId: nextDocument.caseId,
      version: nextDocument.version,
    };
    ctx.stub.setEvent(
      "document.versioned",
      Buffer.from(JSON.stringify(eventPayload)),
    );

    return JSON.stringify(storedNextDocument);
  }

  @Transaction()
  @Returns("string")
  async deactivateDocument(
    ctx: Context,
    caseId: string,
    documentId: string,
    actorJson: string,
    justification: string,
    timestampIso: string,
  ): Promise<string> {
    if (!justification || justification.trim().length === 0) {
      throw new Error("Deactivating a document requires a non-empty justification.");
    }

    const actor = parseJson<UserClaims>(actorJson);
    const caseRecord = await this.getCaseRecord(ctx, caseId);
    const documentReference = await this.getDocument(ctx, documentId);
    const documentType = this.assertKnownDocumentType(documentReference.documentType);
    assertDocumentMutationAllowed(actor, documentType);

    if (documentReference.caseId !== caseId) {
      throw new Error(
        `Document "${documentId}" does not belong to case "${caseId}".`,
      );
    }

    if (!documentReference.isActive) {
      throw new Error(`Document "${documentId}" is already inactive.`);
    }

    const updatedDocument: DocumentReference = {
      ...documentReference,
      isActive: false,
    };

    await ctx.stub.putState(
      documentKey(documentId),
      Buffer.from(JSON.stringify(updatedDocument)),
    );
    await this.putCaseRecord(ctx, {
      ...caseRecord,
      activeDocumentIds: caseRecord.activeDocumentIds.filter(
        (activeDocumentId) => activeDocumentId !== documentId,
      ),
      lastUpdatedAt: timestampIso,
    });
    ctx.stub.setEvent(
      "document.deactivated",
      Buffer.from(
        JSON.stringify({
          caseId,
          documentId,
          justification,
        }),
      ),
    );

    return JSON.stringify(updatedDocument);
  }

  @Transaction(false)
  @Returns("string")
  async getDocumentReference(
    ctx: Context,
    documentId: string,
  ): Promise<string> {
    const payload = await ctx.stub.getState(documentKey(documentId));
    if (!payload || payload.length === 0) {
      throw new Error(`Document "${documentId}" does not exist.`);
    }

    return payload.toString();
  }

  @Transaction(false)
  @Returns("string")
  async listCaseDocuments(ctx: Context, caseId: string): Promise<string> {
    const iterator = await ctx.stub.getStateByRange(
      `${caseDocumentKey(caseId, "")}`,
      `${caseDocumentKey(caseId, "~")}`,
    );
    const caseDocuments: DocumentReference[] = [];

    while (true) {
      const result = await iterator.next();
      if (result.done) {
        await iterator.close();
        break;
      }

      const link = parseJson<{ documentId: string }>(
        result.value.value.toString(),
      );
      caseDocuments.push(await this.getDocument(ctx, link.documentId));
    }

    return JSON.stringify(caseDocuments);
  }

  @Transaction(false)
  @Returns("string")
  async listActiveCaseDocuments(ctx: Context, caseId: string): Promise<string> {
    const allDocuments = parseJson<DocumentReference[]>(
      await this.listCaseDocuments(ctx, caseId),
    );
    return JSON.stringify(
      allDocuments.filter((documentReference) => documentReference.isActive),
    );
  }

  private assertKnownDocumentType(documentType: string): DocumentType {
    if (!DOCUMENT_TYPES.includes(documentType as DocumentType)) {
      throw new Error(`Unknown document type "${documentType}".`);
    }

    return documentType as DocumentType;
  }

  private async getCaseRecord(
    ctx: Context,
    caseId: string,
  ): Promise<AssuranceCase> {
    const payload = await ctx.stub.getState(caseKey(caseId));
    if (!payload || payload.length === 0) {
      throw new Error(`Case "${caseId}" does not exist.`);
    }

    return parseJson<AssuranceCase>(payload.toString());
  }

  private async putCaseRecord(
    ctx: Context,
    caseRecord: AssuranceCase,
  ): Promise<void> {
    await ctx.stub.putState(
      caseKey(caseRecord.caseId),
      Buffer.from(JSON.stringify(caseRecord)),
    );
  }

  private async getDocument(
    ctx: Context,
    documentId: string,
  ): Promise<DocumentReference> {
    const payload = await ctx.stub.getState(documentKey(documentId));
    if (!payload || payload.length === 0) {
      throw new Error(`Document "${documentId}" does not exist.`);
    }

    return parseJson<DocumentReference>(payload.toString());
  }
}
