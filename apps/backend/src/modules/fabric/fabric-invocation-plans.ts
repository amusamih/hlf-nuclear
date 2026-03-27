import type {
  AssuranceCase,
  CreateAssuranceCaseInput,
  DocumentReference,
  UserClaims,
  WorkflowActionType,
} from "@prototype/shared";

export interface FabricInvocationPlan {
  channelName: string;
  chaincodeName: string;
  contractName: "CaseContract" | "DocumentContract";
  transactionName: string;
  args: string[];
  endorsingOrganizations: string[];
  gatewayOrganization: string;
  gatewayUserId: string;
}

interface GatewayIdentityDescriptor {
  gatewayOrganization: string;
  gatewayUserId: string;
}

const DEFAULT_CHANNEL_NAME =
  process.env.FABRIC_CHANNEL_NAME ?? "regulatory-workflow-channel";
const DEFAULT_CHAINCODE_NAME =
  process.env.FABRIC_CHAINCODE_NAME ?? "nuclear-assurance";

const DOMESTIC_ENDORSERS = [
  "DomesticNuclearRegulatorMSP",
  "CoordinatingAuthorityMSP",
];
const FOREIGN_ENDORSERS = [
  "CoordinatingAuthorityMSP",
  "ForeignNuclearRegulatorMSP",
];

function resolveGatewayIdentity(
  organizationType: UserClaims["organizationType"],
): GatewayIdentityDescriptor {
  const gatewayOrganization = (() => {
    switch (organizationType) {
      case "applicant_organization":
      case "domestic_regulator":
        return "DomesticNuclearRegulatorMSP";
      case "coordinating_authority":
        return "CoordinatingAuthorityMSP";
      case "foreign_regulator":
        return "ForeignNuclearRegulatorMSP";
      case "platform_admin":
        return "PlatformAdminMSP";
      case "auditor_body":
        return "AuditorReadMSP";
      default:
        return "UnmappedGatewayMSP";
    }
  })();

  return {
    gatewayOrganization,
    gatewayUserId: `${gatewayOrganization}:service-account`,
  };
}

function resolveWorkflowEndorsers(
  action: WorkflowActionType,
  actor: UserClaims,
  caseRecord?: AssuranceCase,
): string[] {
  switch (action) {
    case "create_case":
    case "submit_case":
    case "record_domestic_review":
    case "respond_to_information_request":
    case "forward_to_coordination":
    case "issue_assurance":
    case "initiate_non_substantive_amendment":
    case "initiate_substantive_amendment":
    case "amend_assurance":
    case "revoke_assurance":
    case "close_case":
      return DOMESTIC_ENDORSERS;
    case "forward_to_foreign_authority":
    case "record_foreign_review":
    case "approve_case":
      return FOREIGN_ENDORSERS;
    case "request_more_information":
    case "reject_case":
    case "reject_amendment":
      if (
        actor.organizationType === "foreign_regulator" ||
        caseRecord?.currentState === "under_foreign_review"
      ) {
        return FOREIGN_ENDORSERS;
      }

      return DOMESTIC_ENDORSERS;
    default:
      return DOMESTIC_ENDORSERS;
  }
}

function resolveCaseTransactionName(
  action: WorkflowActionType,
): FabricInvocationPlan["transactionName"] {
  switch (action) {
    case "create_case":
      return "createCase";
    case "submit_case":
      return "submitCase";
    case "record_domestic_review":
      return "recordDomesticReview";
    case "request_more_information":
      return "requestMoreInformation";
    case "respond_to_information_request":
      return "respondToInformationRequest";
    case "forward_to_coordination":
      return "forwardToCoordination";
    case "forward_to_foreign_authority":
      return "forwardToForeignAuthority";
    case "record_foreign_review":
      return "recordForeignReview";
    case "approve_case":
      return "approveCase";
    case "reject_case":
      return "rejectCase";
    case "issue_assurance":
      return "issueAssurance";
    case "initiate_non_substantive_amendment":
      return "initiateNonSubstantiveAmendment";
    case "initiate_substantive_amendment":
      return "initiateSubstantiveAmendment";
    case "amend_assurance":
      return "amendAssurance";
    case "reject_amendment":
      return "rejectAmendment";
    case "revoke_assurance":
      return "revokeAssurance";
    case "close_case":
      return "closeCase";
    default:
      return "createCase";
  }
}

export function buildCreateCaseInvocationPlan(
  input: CreateAssuranceCaseInput,
  actor: UserClaims,
  correlationId: string,
  timestampIso: string,
): FabricInvocationPlan {
  const gateway = resolveGatewayIdentity(actor.organizationType);

  return {
    channelName: DEFAULT_CHANNEL_NAME,
    chaincodeName: DEFAULT_CHAINCODE_NAME,
    contractName: "CaseContract",
    transactionName: resolveCaseTransactionName("create_case"),
    args: [
      JSON.stringify(input),
      JSON.stringify(actor),
      correlationId,
      timestampIso,
    ],
    endorsingOrganizations: resolveWorkflowEndorsers("create_case", actor),
    gatewayOrganization: gateway.gatewayOrganization,
    gatewayUserId: gateway.gatewayUserId,
  };
}

export function buildTransitionInvocationPlan(
  caseRecord: AssuranceCase,
  action: Exclude<WorkflowActionType, "create_case">,
  actor: UserClaims,
  documentTypes: string[],
  relatedDocumentIds: string[],
  justification: string,
  correlationId: string,
  timestampIso: string,
): FabricInvocationPlan {
  const gateway = resolveGatewayIdentity(actor.organizationType);
  const actorJson = JSON.stringify(actor);
  const documentTypesJson = JSON.stringify(documentTypes);
  const relatedDocumentIdsJson = JSON.stringify(relatedDocumentIds);

  const args = (() => {
    switch (action) {
      case "record_domestic_review":
      case "forward_to_coordination":
      case "record_foreign_review":
      case "reject_amendment":
      case "close_case":
        return [
          caseRecord.caseId,
          actorJson,
          justification,
          correlationId,
          timestampIso,
        ];
      case "submit_case":
      case "request_more_information":
      case "respond_to_information_request":
      case "forward_to_foreign_authority":
      case "approve_case":
      case "reject_case":
      case "issue_assurance":
      case "initiate_non_substantive_amendment":
      case "initiate_substantive_amendment":
      case "amend_assurance":
      case "revoke_assurance":
        return [
          caseRecord.caseId,
          actorJson,
          documentTypesJson,
          relatedDocumentIdsJson,
          justification,
          correlationId,
          timestampIso,
        ];
      default:
        return [
          caseRecord.caseId,
          actorJson,
          documentTypesJson,
          relatedDocumentIdsJson,
          justification,
          correlationId,
          timestampIso,
        ];
    }
  })();

  return {
    channelName: DEFAULT_CHANNEL_NAME,
    chaincodeName: DEFAULT_CHAINCODE_NAME,
    contractName: "CaseContract",
    transactionName: resolveCaseTransactionName(action),
    args,
    endorsingOrganizations: resolveWorkflowEndorsers(action, actor, caseRecord),
    gatewayOrganization: gateway.gatewayOrganization,
    gatewayUserId: gateway.gatewayUserId,
  };
}

export function buildDocumentInvocationPlan(
  documentReference: DocumentReference,
  actor: UserClaims,
): FabricInvocationPlan {
  const gateway = resolveGatewayIdentity(actor.organizationType);
  const transactionName = documentReference.supersedesDocumentId
    ? "updateDocumentVersion"
    : "addDocumentReference";

  return {
    channelName: DEFAULT_CHANNEL_NAME,
    chaincodeName: DEFAULT_CHAINCODE_NAME,
    contractName: "DocumentContract",
    transactionName,
    args: [
      JSON.stringify(documentReference),
      JSON.stringify(actor),
      documentReference.uploadedAt,
    ],
    endorsingOrganizations:
      actor.organizationType === "foreign_regulator"
        ? FOREIGN_ENDORSERS
        : DOMESTIC_ENDORSERS,
    gatewayOrganization: gateway.gatewayOrganization,
    gatewayUserId: gateway.gatewayUserId,
  };
}
