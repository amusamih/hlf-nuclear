import type {
  AssuranceCase,
  CreateAssuranceCaseInput,
  DocumentReference,
  DocumentType,
  UserClaims,
  WorkflowActionType,
  WorkflowEventRecord,
} from "@prototype/shared";

export interface CreateDraftResponse {
  transactionId: string;
  caseRecord: AssuranceCase;
  event: WorkflowEventRecord;
}

export interface UploadDocumentResponse {
  documentReference: DocumentReference;
  transactionId: string;
}

export interface TransitionResponse {
  transactionId: string;
  caseRecord: AssuranceCase;
  event: WorkflowEventRecord;
}

export interface MetricSummary {
  metricId: string;
  count: number;
  min: number;
  max: number;
  average: number;
  p50: number;
  p95: number;
}

export interface MetricRecordInput {
  metricId: string;
  value: number;
  caseId?: string;
  metadata?: Record<string, string | number | boolean>;
}

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

export class BackendClient {
  constructor(
    private readonly baseUrl: string = process.env.BACKEND_BASE_URL ??
      "http://localhost:3000/api",
  ) {}

  createDraft(
    actor: UserClaims,
    payload: Omit<CreateAssuranceCaseInput, "caseId" | "caseNumber">,
  ): Promise<CreateDraftResponse> {
    return this.post<CreateDraftResponse>("/cases", { actor, payload });
  }

  submitCase(
    caseId: string,
    actor: UserClaims,
    justification: string,
    relatedDocumentIds: string[],
  ): Promise<TransitionResponse> {
    return this.post<TransitionResponse>(`/cases/${caseId}/submit`, {
      actor,
      justification,
      relatedDocumentIds,
    });
  }

  transitionCase(
    caseId: string,
    actor: UserClaims,
    action: Exclude<WorkflowActionType, "create_case" | "submit_case">,
    justification: string,
    relatedDocumentIds: string[] = [],
    documentTypes?: DocumentType[],
  ): Promise<TransitionResponse> {
    return this.post<TransitionResponse>(`/cases/${caseId}/actions`, {
      actor,
      action,
      justification,
      relatedDocumentIds,
      documentTypes,
    });
  }

  uploadDocument(
    request: UploadDocumentRequest,
  ): Promise<UploadDocumentResponse> {
    return this.post<UploadDocumentResponse>("/documents", request);
  }

  getCase(caseId: string): Promise<AssuranceCase> {
    return this.get<AssuranceCase>(`/cases/${caseId}`);
  }

  getAuditTimeline(caseId: string): Promise<WorkflowEventRecord[]> {
    return this.get<WorkflowEventRecord[]>(`/cases/${caseId}/audit-timeline`);
  }

  verifyDocument(documentId: string): Promise<{
    documentReference: DocumentReference;
    verified: boolean;
  }> {
    return this.get(`/documents/${documentId}/verify`);
  }

  getMetricSummary(caseId?: string): Promise<MetricSummary[]> {
    const params = new URLSearchParams();
    if (caseId) {
      params.set("caseId", caseId);
    }

    const path = params.size > 0
      ? `/metrics/summary?${params.toString()}`
      : "/metrics/summary";
    return this.get<MetricSummary[]>(path);
  }

  recordMetric(input: MetricRecordInput): Promise<MetricRecordInput> {
    return this.post<MetricRecordInput>("/metrics", input);
  }

  private async get<T>(path: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`);
    return this.parseResponse<T>(response);
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    return this.parseResponse<T>(response);
  }

  private async parseResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      throw new Error(
        `Backend request failed with ${response.status}: ${await response.text()}`,
      );
    }

    return (await response.json()) as T;
  }
}
