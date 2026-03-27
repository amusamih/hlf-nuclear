import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import {
  Pool,
  type PoolClient,
  type QueryResult,
  type QueryResultRow,
} from "pg";

type ProjectionStoreMode = "memory" | "postgres";

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private pool?: Pool;

  async onModuleInit(): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }

    this.pool = new Pool({
      host: process.env.POSTGRES_HOST ?? "127.0.0.1",
      port: Number(process.env.POSTGRES_PORT ?? "5432"),
      database: process.env.POSTGRES_DATABASE ?? "nuclear_assurance",
      user: process.env.POSTGRES_USER ?? "prototype",
      password: process.env.POSTGRES_PASSWORD ?? "prototype",
      ssl:
        (process.env.POSTGRES_SSL ?? "false").toLowerCase() === "true"
          ? { rejectUnauthorized: false }
          : undefined,
    });

    await this.pool.query("SELECT 1");
  }

  async onModuleDestroy(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = undefined;
    }
  }

  isEnabled(): boolean {
    return this.resolveMode() === "postgres";
  }

  async ensureProjectionSchema(): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }

    await this.query(`
      CREATE TABLE IF NOT EXISTS case_projection (
        case_id TEXT PRIMARY KEY,
        case_number TEXT NOT NULL,
        current_state TEXT NOT NULL,
        current_substate TEXT,
        applicant_org_id TEXT NOT NULL,
        applicant_org_name TEXT NOT NULL,
        priority TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        last_updated_at TIMESTAMPTZ NOT NULL,
        payload JSONB NOT NULL,
        last_ledger_reference JSONB NOT NULL,
        last_reconciled_at TIMESTAMPTZ
      )
    `);
    await this.query(`
      CREATE INDEX IF NOT EXISTS idx_case_projection_current_state
      ON case_projection (current_state)
    `);
    await this.query(`
      CREATE INDEX IF NOT EXISTS idx_case_projection_applicant_org
      ON case_projection (applicant_org_id)
    `);

    await this.query(`
      CREATE TABLE IF NOT EXISTS document_projection (
        document_id TEXT PRIMARY KEY,
        case_id TEXT NOT NULL,
        document_type TEXT NOT NULL,
        version INTEGER NOT NULL,
        is_active BOOLEAN NOT NULL,
        uploaded_at TIMESTAMPTZ NOT NULL,
        payload JSONB NOT NULL,
        last_ledger_reference JSONB NOT NULL,
        last_reconciled_at TIMESTAMPTZ
      )
    `);
    await this.query(`
      CREATE INDEX IF NOT EXISTS idx_document_projection_case
      ON document_projection (case_id)
    `);
    await this.query(`
      CREATE INDEX IF NOT EXISTS idx_document_projection_case_active
      ON document_projection (case_id, is_active)
    `);

    await this.query(`
      CREATE TABLE IF NOT EXISTS event_projection (
        action_id TEXT PRIMARY KEY,
        case_id TEXT NOT NULL,
        action_type TEXT NOT NULL,
        previous_state TEXT,
        new_state TEXT NOT NULL,
        actor_role TEXT NOT NULL,
        actor_org TEXT NOT NULL,
        event_timestamp TIMESTAMPTZ NOT NULL,
        audit_sequence_number INTEGER,
        payload JSONB NOT NULL,
        ledger_reference JSONB NOT NULL
      )
    `);
    await this.query(`
      CREATE INDEX IF NOT EXISTS idx_event_projection_case_sequence
      ON event_projection (case_id, audit_sequence_number, event_timestamp)
    `);
  }

  async query<T extends QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<T>> {
    const pool = this.getPool();
    return pool.query<T>(text, values);
  }

  async withClient<T>(
    operation: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const pool = this.getPool();
    const client = await pool.connect();
    try {
      return await operation(client);
    } finally {
      client.release();
    }
  }

  async withTransaction<T>(
    operation: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    return this.withClient(async (client) => {
      await client.query("BEGIN");
      try {
        const result = await operation(client);
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });
  }

  private resolveMode(): ProjectionStoreMode {
    const configuredMode = (
      process.env.PROJECTION_STORE_MODE ?? "memory"
    ).toLowerCase();
    return configuredMode === "postgres" ? "postgres" : "memory";
  }

  private getPool(): Pool {
    if (!this.pool) {
      throw new Error(
        "DatabaseService is not initialized. Set PROJECTION_STORE_MODE=postgres and ensure PostgreSQL is reachable before using the PostgreSQL projection store.",
      );
    }

    return this.pool;
  }
}
