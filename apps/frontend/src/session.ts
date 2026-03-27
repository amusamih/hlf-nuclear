import {
  ROLE_PERMISSION_MATRIX,
  type UserClaims,
  type UserRole,
} from "@prototype/shared";

export type WorkspaceKey =
  | "applicant"
  | "domestic"
  | "coordination"
  | "foreign"
  | "auditor"
  | "admin";

export interface WorkspaceProfile {
  key: WorkspaceKey;
  label: string;
  description: string;
  actor: UserClaims;
  emphasis: string;
}

function buildActor(
  role: UserRole,
  userId: string,
  username: string,
  organizationId: string,
): UserClaims {
  const profile = ROLE_PERMISSION_MATRIX[role];
  return {
    userId,
    username,
    role,
    organizationId,
    organizationType: profile.organizationType,
    permissions: [
      ...profile.allowedActions,
      ...profile.applicationCapabilities,
    ] as string[],
    activeFlag: true,
  };
}

export const WORKSPACE_PROFILES: WorkspaceProfile[] = [
  {
    key: "applicant",
    label: "Applicant Organization",
    description:
      "Create requests, attach documents, submit cases, and respond to information requests.",
    actor: buildActor(
      "applicant_case_manager",
      "frontend-applicant-manager",
      "applicant.manager",
      "applicant-org-001",
    ),
    emphasis:
      "Applicant submissions move through the portal and are committed through the regulatory workflow platform.",
  },
  {
    key: "domestic",
    label: "Domestic Regulator",
    description:
      "Review submitted cases, request more information, endorse cases, and manage revocation.",
    actor: buildActor(
      "domestic_regulator_officer",
      "frontend-domestic-officer",
      "domestic.officer",
      "domestic-regulator-001",
    ),
    emphasis:
      "Domestic review is the first formal regulatory lane in the workflow.",
  },
  {
    key: "coordination",
    label: "Coordinating Authority",
    description:
      "Coordinate cross-border forwarding, issuance, amendment finalization, and counterpart exchange.",
    actor: buildActor(
      "coordination_officer",
      "frontend-coordination-officer",
      "coordination.officer",
      "coordination-authority-001",
    ),
    emphasis:
      "The coordinating authority issues the final assurance after approval is in place.",
  },
  {
    key: "foreign",
    label: "Foreign Regulator",
    description:
      "Review forwarded cases, acknowledge receipt, approve or reject, and request more information.",
    actor: buildActor(
      "foreign_regulator_officer",
      "frontend-foreign-officer",
      "foreign.officer",
      "foreign-regulator-001",
    ),
    emphasis:
      "Foreign review is treated as an explicit regulatory lane with its own actions and trace.",
  },
  {
    key: "auditor",
    label: "Auditor",
    description:
      "Reconstruct the case history, inspect traceability, and verify document integrity.",
    actor: buildActor(
      "auditor",
      "frontend-auditor",
      "auditor.user",
      "auditor-body-001",
    ),
    emphasis:
      "Auditors inspect the trace and verify evidence without changing workflow state.",
  },
  {
    key: "admin",
    label: "Platform Administration",
    description:
      "Support operational visibility, metrics monitoring, and administrative closure actions.",
    actor: buildActor(
      "admin",
      "frontend-admin",
      "platform.admin",
      "platform-admin-001",
    ),
    emphasis:
      "Administrative visibility does not replace policy enforcement on the ledger.",
  },
];

export function getWorkspaceProfile(key: WorkspaceKey): WorkspaceProfile {
  const match = WORKSPACE_PROFILES.find((profile) => profile.key === key);
  if (!match) {
    return WORKSPACE_PROFILES[0];
  }

  return match;
}
