import { type OrganizationType, type UserRole, WORKFLOW_ACTIONS } from "./domain.js";

export interface RolePermissionProfile {
  displayName: string;
  organizationType: OrganizationType;
  ledgerInvokeAllowed: boolean;
  allowedActions: (typeof WORKFLOW_ACTIONS)[number][];
  applicationCapabilities: string[];
}

export const ROLE_PERMISSION_MATRIX: Record<UserRole, RolePermissionProfile> = {
  domestic_regulator_officer: {
    displayName: "Domestic Regulator Officer",
    organizationType: "domestic_regulator",
    ledgerInvokeAllowed: true,
    allowedActions: [
      "record_domestic_review",
      "request_more_information",
      "forward_to_coordination",
      "reject_case",
      "initiate_non_substantive_amendment",
      "initiate_substantive_amendment",
      "reject_amendment",
      "amend_assurance",
      "revoke_assurance",
      "close_case",
    ],
    applicationCapabilities: [
      "review_cases",
      "view_audit_history",
      "export_audit_bundle",
      "manage_case_visibility",
    ],
  },
  coordination_officer: {
    displayName: "Coordinating Authority Officer",
    organizationType: "coordinating_authority",
    ledgerInvokeAllowed: true,
    allowedActions: [
      "request_more_information",
      "forward_to_foreign_authority",
      "initiate_non_substantive_amendment",
      "initiate_substantive_amendment",
      "issue_assurance",
      "amend_assurance",
      "reject_amendment",
      "revoke_assurance",
      "close_case",
    ],
    applicationCapabilities: [
      "coordinate_foreign_exchange",
      "track_interoperability_status",
      "issue_assurance_artifacts",
    ],
  },
  foreign_regulator_officer: {
    displayName: "Foreign Regulator Officer",
    organizationType: "foreign_regulator",
    ledgerInvokeAllowed: true,
    allowedActions: [
      "record_foreign_review",
      "request_more_information",
      "approve_case",
      "reject_case",
      "reject_amendment",
    ],
    applicationCapabilities: [
      "review_forwarded_cases",
      "return_decisions",
      "request_more_information",
    ],
  },
  applicant_case_manager: {
    displayName: "Applicant Case Manager",
    organizationType: "applicant_organization",
    ledgerInvokeAllowed: false,
    allowedActions: [
      "create_case",
      "submit_case",
      "respond_to_information_request",
    ],
    applicationCapabilities: [
      "create_draft",
      "upload_documents",
      "track_status",
      "respond_to_requests",
    ],
  },
  auditor: {
    displayName: "Auditor",
    organizationType: "auditor_body",
    ledgerInvokeAllowed: false,
    allowedActions: [],
    applicationCapabilities: [
      "view_audit_timeline",
      "verify_document_integrity",
      "export_case_history",
    ],
  },
  admin: {
    displayName: "Platform Administrator",
    organizationType: "platform_admin",
    ledgerInvokeAllowed: false,
    allowedActions: ["create_case", "submit_case", "close_case"],
    applicationCapabilities: [
      "manage_users",
      "manage_orgs",
      "manage_reference_data",
      "view_metrics",
    ],
  },
};
