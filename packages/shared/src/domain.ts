export const ORGANIZATION_TYPES = [
  "domestic_regulator",
  "coordinating_authority",
  "foreign_regulator",
  "applicant_organization",
  "auditor_body",
  "platform_admin",
] as const;

export const USER_ROLES = [
  "domestic_regulator_officer",
  "coordination_officer",
  "foreign_regulator_officer",
  "applicant_case_manager",
  "auditor",
  "admin",
] as const;

export const WORKFLOW_STATES = [
  "draft",
  "submitted",
  "under_domestic_review",
  "more_information_requested",
  "awaiting_coordination",
  "forwarded_to_foreign_authority",
  "under_foreign_review",
  "approved",
  "rejected",
  "issued",
  "amended",
  "revoked",
  "closed_archived",
] as const;

export const WORKFLOW_ACTIONS = [
  "create_case",
  "submit_case",
  "record_domestic_review",
  "request_more_information",
  "respond_to_information_request",
  "forward_to_coordination",
  "forward_to_foreign_authority",
  "record_foreign_review",
  "approve_case",
  "reject_case",
  "initiate_non_substantive_amendment",
  "initiate_substantive_amendment",
  "issue_assurance",
  "amend_assurance",
  "reject_amendment",
  "revoke_assurance",
  "close_case",
] as const;

export type OrganizationType = (typeof ORGANIZATION_TYPES)[number];
export type UserRole = (typeof USER_ROLES)[number];
export type WorkflowState = (typeof WORKFLOW_STATES)[number];
export type WorkflowActionType = (typeof WORKFLOW_ACTIONS)[number];
export type AmendmentReviewMode =
  | "none"
  | "non_substantive"
  | "substantive";
export type AmendmentBaseState = Extract<WorkflowState, "issued" | "amended">;

export interface UserClaims {
  userId: string;
  username: string;
  role: UserRole;
  organizationId: string;
  organizationType: OrganizationType;
  permissions: string[];
  activeFlag: boolean;
}

export interface Organization {
  organizationId: string;
  organizationType: OrganizationType;
  organizationName: string;
  jurisdiction: string;
  ledgerMemberFlag: boolean;
  status: "active" | "inactive";
}

export interface AssuranceCase {
  caseId: string;
  caseNumber: string;
  applicantOrgId: string;
  applicantOrgName: string;
  itemCategory: string;
  itemDescription: string;
  quantity: number;
  originJurisdiction: string;
  destinationJurisdiction: string;
  intendedUse: string;
  legalTreatyBasis?: string;
  currentState: WorkflowState;
  currentSubstate?: WorkflowState;
  priority: "routine" | "elevated" | "urgent";
  createdAt: string;
  createdBy: string;
  lastUpdatedAt: string;
  domesticRegulatorStatus: "not_started" | "in_review" | "endorsed" | "rejected";
  coordinationStatus: "not_started" | "queued" | "forwarded" | "completed";
  foreignRegulatorStatus: "not_started" | "in_review" | "approved" | "rejected";
  issuanceStatus: "not_issued" | "issued" | "superseded" | "revoked";
  currentAssuranceVersion: number;
  pendingAmendmentReviewMode: AmendmentReviewMode;
  amendmentBaseState?: AmendmentBaseState;
  amendmentFlag: boolean;
  revocationFlag: boolean;
  visibilityScope: string[];
  activeDocumentIds: string[];
  remarksSummary: string;
  auditSequenceNumber: number;
}

export interface DocumentReference {
  documentId: string;
  caseId: string;
  documentType: string;
  storageBucket: string;
  storageKey: string;
  sha256Hash: string;
  fileName: string;
  mimeType: string;
  version: number;
  uploadedBy: string;
  uploadedAt: string;
  classification: "public" | "internal" | "restricted" | "confidential";
  accessScope: string[];
  supersedesDocumentId?: string;
  isActive: boolean;
}

export interface WorkflowEventRecord {
  actionId: string;
  caseId: string;
  actorUserId: string;
  actorRole: UserRole;
  actorOrg: string;
  actorOrganizationType: OrganizationType;
  actionType: WorkflowActionType;
  previousState?: WorkflowState;
  newState: WorkflowState;
  timestamp: string;
  justification: string;
  relatedDocumentIds: string[];
  correlationId: string;
  invokedByGatewayOrg?: string;
  invokedByGatewayUserId?: string;
}

export interface CreateAssuranceCaseInput {
  caseId: string;
  caseNumber: string;
  applicantOrgId: string;
  applicantOrgName: string;
  itemCategory: string;
  itemDescription: string;
  quantity: number;
  originJurisdiction: string;
  destinationJurisdiction: string;
  intendedUse: string;
  legalTreatyBasis?: string;
  priority: AssuranceCase["priority"];
  remarksSummary?: string;
  visibilityScope?: string[];
}

export function buildDraftCase(
  input: CreateAssuranceCaseInput,
  actor: UserClaims,
  nowIso: string,
): AssuranceCase {
  return {
    caseId: input.caseId,
    caseNumber: input.caseNumber,
    applicantOrgId: input.applicantOrgId,
    applicantOrgName: input.applicantOrgName,
    itemCategory: input.itemCategory,
    itemDescription: input.itemDescription,
    quantity: input.quantity,
    originJurisdiction: input.originJurisdiction,
    destinationJurisdiction: input.destinationJurisdiction,
    intendedUse: input.intendedUse,
    legalTreatyBasis: input.legalTreatyBasis,
    currentState: "draft",
    priority: input.priority,
    createdAt: nowIso,
    createdBy: actor.userId,
    lastUpdatedAt: nowIso,
    domesticRegulatorStatus: "not_started",
    coordinationStatus: "not_started",
    foreignRegulatorStatus: "not_started",
    issuanceStatus: "not_issued",
    currentAssuranceVersion: 0,
    pendingAmendmentReviewMode: "none",
    amendmentFlag: false,
    revocationFlag: false,
    visibilityScope: input.visibilityScope ?? [
      "applicant_organization",
      "domestic_regulator",
      "coordinating_authority",
      "auditor_body",
    ],
    activeDocumentIds: [],
    remarksSummary: input.remarksSummary ?? "",
    auditSequenceNumber: 0,
  };
}
