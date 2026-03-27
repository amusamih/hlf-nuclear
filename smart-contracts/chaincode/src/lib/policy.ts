import {
  ROLE_PERMISSION_MATRIX,
  evaluateTransition,
  type AssuranceCase,
  type DocumentType,
  type UserClaims,
  type WorkflowActionType,
} from "@prototype/shared";

const REGULATOR_DOCUMENT_OWNERS: Partial<
  Record<
    DocumentType,
    UserClaims["organizationType"][]
  >
> = {
  request_for_information_notice: [
    "domestic_regulator",
    "coordinating_authority",
    "foreign_regulator",
  ],
  response_to_information_package: ["applicant_organization", "platform_admin"],
  coordination_forwarding_package: ["coordinating_authority"],
  foreign_regulator_response: ["foreign_regulator"],
  assurance_instrument: ["coordinating_authority"],
  amendment_request_package: ["domestic_regulator", "coordinating_authority"],
  revocation_notice: ["domestic_regulator", "coordinating_authority"],
  inspection_or_audit_evidence: [
    "domestic_regulator",
    "coordinating_authority",
    "foreign_regulator",
  ],
};

export function assertCreateCaseAllowed(actor: UserClaims): void {
  const roleProfile = ROLE_PERMISSION_MATRIX[actor.role];

  if (!actor.activeFlag) {
    throw new Error(`Actor "${actor.userId}" is inactive.`);
  }

  if (roleProfile.organizationType !== actor.organizationType) {
    throw new Error(
      `Role "${actor.role}" must belong to organization type "${roleProfile.organizationType}".`,
    );
  }

  if (!roleProfile.allowedActions.includes("create_case")) {
    throw new Error(`Role "${actor.role}" cannot create cases.`);
  }
}

export function assertTransitionAllowed(
  caseRecord: AssuranceCase,
  action: WorkflowActionType,
  actor: UserClaims,
  availableDocumentTypes: DocumentType[],
  justification?: string,
): void {
  const evaluation = evaluateTransition(
    caseRecord,
    action,
    actor,
    availableDocumentTypes,
    justification,
  );

  if (!evaluation.allowed) {
    throw new Error(evaluation.reasons.join(" "));
  }
}

export function assertDocumentMutationAllowed(
  actor: UserClaims,
  documentType: DocumentType,
): void {
  const roleProfile = ROLE_PERMISSION_MATRIX[actor.role];

  if (!actor.activeFlag) {
    throw new Error(`Actor "${actor.userId}" is inactive.`);
  }

  if (roleProfile.organizationType !== actor.organizationType) {
    throw new Error(
      `Role "${actor.role}" must belong to organization type "${roleProfile.organizationType}".`,
    );
  }

  if (actor.role === "auditor") {
    throw new Error('Role "auditor" cannot mutate document references.');
  }

  const constrainedOwners = REGULATOR_DOCUMENT_OWNERS[documentType];
  if (
    constrainedOwners &&
    !constrainedOwners.includes(actor.organizationType)
  ) {
    throw new Error(
      `Document type "${documentType}" cannot be anchored by organization type "${actor.organizationType}".`,
    );
  }
}
