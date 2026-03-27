import { Injectable, NotFoundException, OnModuleInit } from "@nestjs/common";
import {
  type AssuranceCase,
  type CaseProjection,
  type DocumentProjection,
  type DocumentReference,
  type EventProjection,
  type LedgerReference,
  type WorkflowEventRecord,
} from "@prototype/shared";
import { type PoolClient } from "pg";
import { DatabaseService } from "../database/database.service.js";

type ProjectionStoreMode = "memory" | "postgres";

@Injectable()
export class ProjectionStoreService implements OnModuleInit {
  private readonly cases = new Map<string, CaseProjection>();
  private readonly events = new Map<string, EventProjection[]>();
  private readonly documents = new Map<string, DocumentProjection>();
  private readonly caseDocuments = new Map<string, string[]>();

  constructor(private readonly database: DatabaseService) {}

  async onModuleInit(): Promise<void> {
    if (this.isPostgresMode()) {
      await this.database.ensureProjectionSchema();
    }
  }

  async listCases(): Promise<AssuranceCase[]> {
    if (!this.isPostgresMode()) {
      return Array.from(this.cases.values()).map(({ lastLedgerReference, lastReconciledAt, ...caseRecord }) => caseRecord);
    }

    const result = await this.database.query<{ payload: AssuranceCase }>(
      `
        SELECT payload
        FROM case_projection
        ORDER BY created_at ASC, case_number ASC
      `,
    );
    return result.rows.map((row) => row.payload);
  }

  async countCases(): Promise<number> {
    if (!this.isPostgresMode()) {
      return this.cases.size;
    }

    const result = await this.database.query<{ count: string }>(
      "SELECT COUNT(*)::TEXT AS count FROM case_projection",
    );
    return Number(result.rows[0]?.count ?? "0");
  }

  async hasCase(caseId: string): Promise<boolean> {
    if (!this.isPostgresMode()) {
      return this.cases.has(caseId);
    }

    const result = await this.database.query<{ exists: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM case_projection WHERE case_id = $1) AS exists",
      [caseId],
    );
    return result.rows[0]?.exists ?? false;
  }

  async getCase(caseId: string): Promise<AssuranceCase> {
    const caseRecord = this.isPostgresMode()
      ? await this.getCaseFromPostgres(caseId)
      : this.cases.get(caseId);
    if (!caseRecord) {
      throw new NotFoundException(`Unknown caseId "${caseId}".`);
    }

    const { lastLedgerReference, lastReconciledAt, ...payload } = caseRecord;
    return payload;
  }

  async persistCaseUpdate(
    caseRecord: AssuranceCase,
    event: WorkflowEventRecord,
    ledgerReference: LedgerReference,
  ): Promise<void> {
    const normalizedReference = this.normalizeLedgerReference(ledgerReference);
    const caseProjection: CaseProjection = {
      ...caseRecord,
      lastLedgerReference: normalizedReference,
    };
    const eventProjection: EventProjection = {
      ...event,
      ledgerReference: normalizedReference,
    };

    if (!this.isPostgresMode()) {
      this.cases.set(caseRecord.caseId, caseProjection);
      const existingEvents = this.events.get(caseRecord.caseId) ?? [];
      this.events.set(caseRecord.caseId, [...existingEvents, eventProjection]);
      return;
    }

    await this.database.withTransaction(async (client) => {
      await this.upsertCase(client, caseProjection);
      await this.insertEvent(client, eventProjection);
    });
  }

  async persistCaseSnapshot(
    caseRecord: AssuranceCase,
    ledgerReference: LedgerReference,
  ): Promise<void> {
    const normalizedReference = this.normalizeLedgerReference(ledgerReference);
    const caseProjection: CaseProjection = {
      ...caseRecord,
      lastLedgerReference: normalizedReference,
    };

    if (!this.isPostgresMode()) {
      this.cases.set(caseRecord.caseId, caseProjection);
      return;
    }

    await this.database.withTransaction(async (client) => {
      await this.upsertCase(client, caseProjection);
    });
  }

  async listEvents(caseId: string): Promise<WorkflowEventRecord[]> {
    if (!this.isPostgresMode()) {
      return (this.events.get(caseId) ?? []).map(
        ({ ledgerReference, ...event }) => event,
      );
    }

    const result = await this.database.query<{ payload: WorkflowEventRecord }>(
      `
        SELECT payload
        FROM event_projection
        WHERE case_id = $1
        ORDER BY audit_sequence_number ASC NULLS LAST, event_timestamp ASC, action_id ASC
      `,
      [caseId],
    );
    return result.rows.map((row) => row.payload);
  }

  async getDocument(documentId: string): Promise<DocumentReference> {
    const document = this.isPostgresMode()
      ? await this.getDocumentFromPostgres(documentId)
      : this.documents.get(documentId);
    if (!document) {
      throw new NotFoundException(`Unknown documentId "${documentId}".`);
    }

    const { lastLedgerReference, lastReconciledAt, ...payload } = document;
    return payload;
  }

  async hasDocument(documentId: string): Promise<boolean> {
    if (!this.isPostgresMode()) {
      return this.documents.has(documentId);
    }

    const result = await this.database.query<{ exists: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM document_projection WHERE document_id = $1) AS exists",
      [documentId],
    );
    return result.rows[0]?.exists ?? false;
  }

  async persistDocumentUpdate(
    documentReference: DocumentReference,
    ledgerReference: LedgerReference,
    supersededDocument?: DocumentReference,
  ): Promise<void> {
    const normalizedReference = this.normalizeLedgerReference(ledgerReference);
    const nextProjection: DocumentProjection = {
      ...documentReference,
      lastLedgerReference: normalizedReference,
    };
    const supersededProjection = supersededDocument
      ? {
          ...supersededDocument,
          isActive: false,
          lastLedgerReference: normalizedReference,
        }
      : undefined;

    if (!this.isPostgresMode()) {
      if (supersededProjection) {
        this.documents.set(
          supersededProjection.documentId,
          supersededProjection,
        );
      }
      this.documents.set(nextProjection.documentId, nextProjection);
      const caseDocumentIds = this.caseDocuments.get(documentReference.caseId) ?? [];
      if (!caseDocumentIds.includes(documentReference.documentId)) {
        this.caseDocuments.set(documentReference.caseId, [
          ...caseDocumentIds,
          documentReference.documentId,
        ]);
      }
      return;
    }

    await this.database.withTransaction(async (client) => {
      if (supersededProjection) {
        await this.upsertDocument(client, supersededProjection);
      }
      await this.upsertDocument(client, nextProjection);
    });
  }

  async listCaseDocuments(caseId: string): Promise<DocumentReference[]> {
    if (!this.isPostgresMode()) {
      const documentIds = this.caseDocuments.get(caseId) ?? [];
      return Promise.all(
        documentIds.map((documentId) => this.getDocument(documentId)),
      );
    }

    const result = await this.database.query<{ payload: DocumentReference }>(
      `
        SELECT payload
        FROM document_projection
        WHERE case_id = $1
        ORDER BY document_type ASC, version ASC, document_id ASC
      `,
      [caseId],
    );
    return result.rows.map((row) => row.payload);
  }

  private isPostgresMode(): boolean {
    const configuredMode = (
      process.env.PROJECTION_STORE_MODE ?? "memory"
    ).toLowerCase();
    return (configuredMode as ProjectionStoreMode) === "postgres";
  }

  private normalizeLedgerReference(
    ledgerReference: LedgerReference,
  ): LedgerReference {
    return {
      ...ledgerReference,
      projectionUpdatedAt: new Date().toISOString(),
      projectionSyncStatus: "in_sync",
    };
  }

  private async getCaseFromPostgres(
    caseId: string,
  ): Promise<CaseProjection | undefined> {
    const result = await this.database.query<{
      payload: AssuranceCase;
      last_ledger_reference: LedgerReference;
      last_reconciled_at: string | null;
    }>(
      `
        SELECT payload, last_ledger_reference, last_reconciled_at
        FROM case_projection
        WHERE case_id = $1
      `,
      [caseId],
    );
    const row = result.rows[0];
    if (!row) {
      return undefined;
    }

    return {
      ...row.payload,
      lastLedgerReference: row.last_ledger_reference,
      lastReconciledAt: row.last_reconciled_at ?? undefined,
    };
  }

  private async getDocumentFromPostgres(
    documentId: string,
  ): Promise<DocumentProjection | undefined> {
    const result = await this.database.query<{
      payload: DocumentReference;
      last_ledger_reference: LedgerReference;
      last_reconciled_at: string | null;
    }>(
      `
        SELECT payload, last_ledger_reference, last_reconciled_at
        FROM document_projection
        WHERE document_id = $1
      `,
      [documentId],
    );
    const row = result.rows[0];
    if (!row) {
      return undefined;
    }

    return {
      ...row.payload,
      lastLedgerReference: row.last_ledger_reference,
      lastReconciledAt: row.last_reconciled_at ?? undefined,
    };
  }

  private async upsertCase(
    client: PoolClient,
    projection: CaseProjection,
  ): Promise<void> {
    await client.query(
      `
        INSERT INTO case_projection (
          case_id,
          case_number,
          current_state,
          current_substate,
          applicant_org_id,
          applicant_org_name,
          priority,
          created_at,
          last_updated_at,
          payload,
          last_ledger_reference,
          last_reconciled_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12
        )
        ON CONFLICT (case_id)
        DO UPDATE SET
          case_number = EXCLUDED.case_number,
          current_state = EXCLUDED.current_state,
          current_substate = EXCLUDED.current_substate,
          applicant_org_id = EXCLUDED.applicant_org_id,
          applicant_org_name = EXCLUDED.applicant_org_name,
          priority = EXCLUDED.priority,
          created_at = EXCLUDED.created_at,
          last_updated_at = EXCLUDED.last_updated_at,
          payload = EXCLUDED.payload,
          last_ledger_reference = EXCLUDED.last_ledger_reference,
          last_reconciled_at = EXCLUDED.last_reconciled_at
      `,
      [
        projection.caseId,
        projection.caseNumber,
        projection.currentState,
        projection.currentSubstate ?? null,
        projection.applicantOrgId,
        projection.applicantOrgName,
        projection.priority,
        projection.createdAt,
        projection.lastUpdatedAt,
        JSON.stringify(this.stripCaseProjection(projection)),
        JSON.stringify(projection.lastLedgerReference),
        projection.lastReconciledAt ?? null,
      ],
    );
  }

  private async insertEvent(
    client: PoolClient,
    projection: EventProjection,
  ): Promise<void> {
    await client.query(
      `
        INSERT INTO event_projection (
          action_id,
          case_id,
          action_type,
          previous_state,
          new_state,
          actor_role,
          actor_org,
          event_timestamp,
          audit_sequence_number,
          payload,
          ledger_reference
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb
        )
        ON CONFLICT (action_id)
        DO UPDATE SET
          case_id = EXCLUDED.case_id,
          action_type = EXCLUDED.action_type,
          previous_state = EXCLUDED.previous_state,
          new_state = EXCLUDED.new_state,
          actor_role = EXCLUDED.actor_role,
          actor_org = EXCLUDED.actor_org,
          event_timestamp = EXCLUDED.event_timestamp,
          audit_sequence_number = EXCLUDED.audit_sequence_number,
          payload = EXCLUDED.payload,
          ledger_reference = EXCLUDED.ledger_reference
      `,
      [
        projection.actionId,
        projection.caseId,
        projection.actionType,
        projection.previousState ?? null,
        projection.newState,
        projection.actorRole,
        projection.actorOrg,
        projection.timestamp,
        projection.ledgerReference.auditSequenceNumber ?? null,
        JSON.stringify(this.stripEventProjection(projection)),
        JSON.stringify(projection.ledgerReference),
      ],
    );
  }

  private async upsertDocument(
    client: PoolClient,
    projection: DocumentProjection,
  ): Promise<void> {
    await client.query(
      `
        INSERT INTO document_projection (
          document_id,
          case_id,
          document_type,
          version,
          is_active,
          uploaded_at,
          payload,
          last_ledger_reference,
          last_reconciled_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9
        )
        ON CONFLICT (document_id)
        DO UPDATE SET
          case_id = EXCLUDED.case_id,
          document_type = EXCLUDED.document_type,
          version = EXCLUDED.version,
          is_active = EXCLUDED.is_active,
          uploaded_at = EXCLUDED.uploaded_at,
          payload = EXCLUDED.payload,
          last_ledger_reference = EXCLUDED.last_ledger_reference,
          last_reconciled_at = EXCLUDED.last_reconciled_at
      `,
      [
        projection.documentId,
        projection.caseId,
        projection.documentType,
        projection.version,
        projection.isActive,
        projection.uploadedAt,
        JSON.stringify(this.stripDocumentProjection(projection)),
        JSON.stringify(projection.lastLedgerReference),
        projection.lastReconciledAt ?? null,
      ],
    );
  }

  private stripCaseProjection(projection: CaseProjection): AssuranceCase {
    const { lastLedgerReference, lastReconciledAt, ...payload } = projection;
    return payload;
  }

  private stripEventProjection(
    projection: EventProjection,
  ): WorkflowEventRecord {
    const { ledgerReference, ...payload } = projection;
    return payload;
  }

  private stripDocumentProjection(
    projection: DocumentProjection,
  ): DocumentReference {
    const { lastLedgerReference, lastReconciledAt, ...payload } = projection;
    return payload;
  }
}
