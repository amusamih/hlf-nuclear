import { DOCUMENT_TYPES, type DocumentType } from "./documents.js";
import type { UserClaims } from "./domain.js";
import { ROLE_PERMISSION_MATRIX } from "./permissions.js";

const REGULATOR_DOCUMENT_OWNERS: Partial<
  Record<DocumentType, UserClaims["organizationType"][]>
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

export function assertKnownDocumentType(documentType: string): DocumentType {
  if (!DOCUMENT_TYPES.includes(documentType as DocumentType)) {
    throw new Error(`Unknown document type "${documentType}".`);
  }

  return documentType as DocumentType;
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
