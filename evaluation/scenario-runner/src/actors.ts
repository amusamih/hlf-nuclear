import type { UserClaims } from "@prototype/shared";

export const APPLICANT_ACTOR: UserClaims = {
  userId: "applicant-user-001",
  username: "applicant.case.manager",
  role: "applicant_case_manager",
  organizationId: "applicant-org-001",
  organizationType: "applicant_organization",
  permissions: ["create_draft", "upload_documents", "track_status"],
  activeFlag: true,
};

export const DOMESTIC_ACTOR: UserClaims = {
  userId: "domestic-officer-001",
  username: "domestic.regulator.officer",
  role: "domestic_regulator_officer",
  organizationId: "domestic-regulator-001",
  organizationType: "domestic_regulator",
  permissions: ["review_cases", "forward_cases", "revoke_cases"],
  activeFlag: true,
};

export const COORDINATION_ACTOR: UserClaims = {
  userId: "coordination-officer-001",
  username: "coordination.officer",
  role: "coordination_officer",
  organizationId: "coordination-authority-001",
  organizationType: "coordinating_authority",
  permissions: ["coordinate_foreign_exchange", "issue_assurance_artifacts"],
  activeFlag: true,
};

export const FOREIGN_ACTOR: UserClaims = {
  userId: "foreign-officer-001",
  username: "foreign.regulator.officer",
  role: "foreign_regulator_officer",
  organizationId: "foreign-regulator-001",
  organizationType: "foreign_regulator",
  permissions: ["review_forwarded_cases", "return_decisions"],
  activeFlag: true,
};
