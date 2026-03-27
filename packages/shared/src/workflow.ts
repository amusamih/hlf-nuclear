import {
  buildDraftCase,
  type AssuranceCase,
  type CreateAssuranceCaseInput,
  type UserClaims,
  type WorkflowActionType,
  type WorkflowEventRecord,
  type WorkflowState,
} from "./domain.js";
import { type DocumentType } from "./documents.js";
import { ROLE_PERMISSION_MATRIX } from "./permissions.js";

export interface TransitionDefinition {
  action: WorkflowActionType;
  from: WorkflowState[];
  to:
    | WorkflowState
    | "resume_from_substate"
    | "resume_from_amendment_base";
  allowedRoles: UserClaims["role"][];
  allowedOrganizationTypes: UserClaims["organizationType"][];
  requiredDocumentTypes: DocumentType[];
  preconditions: string[];
  auditEventLabel: string;
  visibilityImplications: string;
  notifications: string[];
  integrationEffects: string[];
}

export interface TransitionEvaluation {
  allowed: boolean;
  nextState?: WorkflowState;
  reasons: string[];
  transition?: TransitionDefinition;
}

export const TRANSITIONS: TransitionDefinition[] = [
  {
    action: "submit_case",
    from: ["draft"],
    to: "submitted",
    allowedRoles: ["applicant_case_manager", "admin"],
    allowedOrganizationTypes: ["applicant_organization", "platform_admin"],
    requiredDocumentTypes: [
      "assurance_application_form",
      "item_technical_specification",
      "end_use_declaration",
    ],
    preconditions: [
      "case must exist in draft state",
      "applicant must still be active",
    ],
    auditEventLabel: "case.submitted",
    visibilityImplications:
      "Case becomes visible to domestic regulator and coordinating authority queues.",
    notifications: [
      "notify:domestic_regulator",
      "notify:coordination_officer",
    ],
    integrationEffects: ["domestic_emulator:intake_acknowledgement"],
  },
  {
    action: "record_domestic_review",
    from: ["submitted"],
    to: "under_domestic_review",
    allowedRoles: ["domestic_regulator_officer"],
    allowedOrganizationTypes: ["domestic_regulator"],
    requiredDocumentTypes: [],
    preconditions: [
      "submission package must be complete enough to begin review",
    ],
    auditEventLabel: "case.domestic_review_started",
    visibilityImplications:
      "Domestic regulator assumes primary review control; applicant retains status visibility only.",
    notifications: ["notify:applicant_status_change"],
    integrationEffects: [],
  },
  {
    action: "request_more_information",
    from: [
      "under_domestic_review",
      "awaiting_coordination",
      "under_foreign_review",
    ],
    to: "more_information_requested",
    allowedRoles: [
      "domestic_regulator_officer",
      "coordination_officer",
      "foreign_regulator_officer",
    ],
    allowedOrganizationTypes: [
      "domestic_regulator",
      "coordinating_authority",
      "foreign_regulator",
    ],
    requiredDocumentTypes: ["request_for_information_notice"],
    preconditions: ["justification must be recorded"],
    auditEventLabel: "case.more_information_requested",
    visibilityImplications:
      "Applicant portal displays action-required status while preserving the originating review lane in currentSubstate.",
    notifications: ["notify:applicant_action_required"],
    integrationEffects: [],
  },
  {
    action: "respond_to_information_request",
    from: ["more_information_requested"],
    to: "resume_from_substate",
    allowedRoles: ["applicant_case_manager", "admin"],
    allowedOrganizationTypes: ["applicant_organization", "platform_admin"],
    requiredDocumentTypes: ["response_to_information_package"],
    preconditions: ["case.currentSubstate must be populated"],
    auditEventLabel: "case.more_information_responded",
    visibilityImplications:
      "Case returns to the review lane that raised the information request.",
    notifications: ["notify:requesting_authority"],
    integrationEffects: ["domestic_emulator:status_sync"],
  },
  {
    action: "forward_to_coordination",
    from: ["under_domestic_review"],
    to: "awaiting_coordination",
    allowedRoles: ["domestic_regulator_officer"],
    allowedOrganizationTypes: ["domestic_regulator"],
    requiredDocumentTypes: [],
    preconditions: ["domestic review outcome must be favorable"],
    auditEventLabel: "case.forwarded_to_coordination",
    visibilityImplications:
      "Coordinating authority becomes the primary forwarding actor.",
    notifications: ["notify:coordination_officer"],
    integrationEffects: ["domestic_emulator:forwarded"],
  },
  {
    action: "forward_to_foreign_authority",
    from: ["awaiting_coordination"],
    to: "forwarded_to_foreign_authority",
    allowedRoles: ["coordination_officer"],
    allowedOrganizationTypes: ["coordinating_authority"],
    requiredDocumentTypes: ["coordination_forwarding_package"],
    preconditions: ["coordination checks complete"],
    auditEventLabel: "case.forwarded_to_foreign_authority",
    visibilityImplications:
      "Foreign regulator receives visibility to the case packet and current review status.",
    notifications: ["notify:foreign_regulator"],
    integrationEffects: ["foreign_simulator:send_case"],
  },
  {
    action: "record_foreign_review",
    from: ["forwarded_to_foreign_authority"],
    to: "under_foreign_review",
    allowedRoles: ["foreign_regulator_officer"],
    allowedOrganizationTypes: ["foreign_regulator"],
    requiredDocumentTypes: [],
    preconditions: ["foreign authority has acknowledged case receipt"],
    auditEventLabel: "case.foreign_review_started",
    visibilityImplications:
      "Foreign review is visible as a distinct state rather than a silent queue.",
    notifications: ["notify:coordination_officer"],
    integrationEffects: ["foreign_simulator:acknowledge_receipt"],
  },
  {
    action: "approve_case",
    from: ["under_foreign_review"],
    to: "approved",
    allowedRoles: ["foreign_regulator_officer"],
    allowedOrganizationTypes: ["foreign_regulator"],
    requiredDocumentTypes: ["foreign_regulator_response"],
    preconditions: [
      "domestic review must already have endorsed the case",
      "foreign response must be available",
    ],
    auditEventLabel: "case.approved",
    visibilityImplications:
      "Issuance becomes available to the coordinating authority; applicant sees approved-but-not-issued status.",
    notifications: [
      "notify:coordination_officer",
      "notify:domestic_regulator",
      "notify:applicant_status_change",
    ],
    integrationEffects: ["foreign_simulator:decision_sent"],
  },
  {
    action: "reject_case",
    from: [
      "under_domestic_review",
      "awaiting_coordination",
      "under_foreign_review",
    ],
    to: "rejected",
    allowedRoles: [
      "domestic_regulator_officer",
      "coordination_officer",
      "foreign_regulator_officer",
    ],
    allowedOrganizationTypes: [
      "domestic_regulator",
      "coordinating_authority",
      "foreign_regulator",
    ],
    requiredDocumentTypes: [],
    preconditions: ["rejection reason must be recorded"],
    auditEventLabel: "case.rejected",
    visibilityImplications:
      "Case becomes read-only except for closure and audit export.",
    notifications: ["notify:all_visible_parties"],
    integrationEffects: ["foreign_simulator:decision_sent"],
  },
  {
    action: "initiate_non_substantive_amendment",
    from: ["issued", "amended"],
    to: "awaiting_coordination",
    allowedRoles: ["domestic_regulator_officer", "coordination_officer"],
    allowedOrganizationTypes: ["domestic_regulator", "coordinating_authority"],
    requiredDocumentTypes: ["amendment_request_package"],
    preconditions: [
      "an active assurance instrument must already exist",
      "the amendment must be classified as non-substantive",
    ],
    auditEventLabel: "case.non_substantive_amendment_initiated",
    visibilityImplications:
      "Amendment review begins without foreign re-review; the currently active assurance remains the baseline until amendment finalization.",
    notifications: [
      "notify:coordination_officer",
      "notify:domestic_regulator",
    ],
    integrationEffects: ["domestic_emulator:amendment_initiated"],
  },
  {
    action: "initiate_substantive_amendment",
    from: ["issued", "amended"],
    to: "under_domestic_review",
    allowedRoles: ["domestic_regulator_officer", "coordination_officer"],
    allowedOrganizationTypes: ["domestic_regulator", "coordinating_authority"],
    requiredDocumentTypes: ["amendment_request_package"],
    preconditions: [
      "an active assurance instrument must already exist",
      "the amendment must be classified as substantive",
    ],
    auditEventLabel: "case.substantive_amendment_initiated",
    visibilityImplications:
      "The case re-enters domestic and potentially foreign review while the existing assurance remains the current active baseline.",
    notifications: [
      "notify:domestic_regulator",
      "notify:coordination_officer",
      "notify:applicant_status_change",
    ],
    integrationEffects: ["domestic_emulator:amendment_initiated"],
  },
  {
    action: "issue_assurance",
    from: ["approved"],
    to: "issued",
    allowedRoles: ["coordination_officer"],
    allowedOrganizationTypes: ["coordinating_authority"],
    requiredDocumentTypes: ["assurance_instrument"],
    preconditions: ["final issuance document must be anchored"],
    auditEventLabel: "case.issued",
    visibilityImplications:
      "Applicant and auditors can retrieve the issued assurance and verify it against on-chain metadata.",
    notifications: ["notify:all_visible_parties"],
    integrationEffects: ["domestic_emulator:issued_status_sync"],
  },
  {
    action: "amend_assurance",
    from: ["awaiting_coordination", "approved"],
    to: "amended",
    allowedRoles: ["coordination_officer"],
    allowedOrganizationTypes: ["coordinating_authority"],
    requiredDocumentTypes: ["amendment_request_package", "assurance_instrument"],
    preconditions: ["existing issuance must still be active"],
    auditEventLabel: "case.amended",
    visibilityImplications:
      "Superseded issuance references remain queryable and the latest active version is explicit.",
    notifications: ["notify:all_visible_parties"],
    integrationEffects: ["domestic_emulator:amendment_sync"],
  },
  {
    action: "reject_amendment",
    from: [
      "under_domestic_review",
      "awaiting_coordination",
      "under_foreign_review",
    ],
    to: "resume_from_amendment_base",
    allowedRoles: [
      "domestic_regulator_officer",
      "coordination_officer",
      "foreign_regulator_officer",
    ],
    allowedOrganizationTypes: [
      "domestic_regulator",
      "coordinating_authority",
      "foreign_regulator",
    ],
    requiredDocumentTypes: [],
    preconditions: [
      "an amendment review must currently be active",
      "the active assurance remains valid after rejection",
    ],
    auditEventLabel: "case.amendment_rejected",
    visibilityImplications:
      "The amendment request is denied while the previously active assurance remains in force and fully auditable.",
    notifications: ["notify:all_visible_parties"],
    integrationEffects: ["domestic_emulator:amendment_rejected"],
  },
  {
    action: "revoke_assurance",
    from: ["issued", "amended"],
    to: "revoked",
    allowedRoles: ["domestic_regulator_officer", "coordination_officer"],
    allowedOrganizationTypes: ["domestic_regulator", "coordinating_authority"],
    requiredDocumentTypes: ["revocation_notice"],
    preconditions: ["revocation basis must be documented"],
    auditEventLabel: "case.revoked",
    visibilityImplications:
      "All parties see the case as non-active and the revocation reason is auditable.",
    notifications: ["notify:all_visible_parties"],
    integrationEffects: ["domestic_emulator:revocation_sync"],
  },
  {
    action: "close_case",
    from: ["issued", "amended", "rejected", "revoked"],
    to: "closed_archived",
    allowedRoles: ["domestic_regulator_officer", "coordination_officer", "admin"],
    allowedOrganizationTypes: [
      "domestic_regulator",
      "coordinating_authority",
      "platform_admin",
    ],
    requiredDocumentTypes: [],
    preconditions: ["terminal state must already have been reached"],
    auditEventLabel: "case.closed",
    visibilityImplications:
      "Case becomes archive-only while full history remains exportable.",
    notifications: ["notify:auditor_body"],
    integrationEffects: [],
  },
];

export function createDraftTransition(
  input: CreateAssuranceCaseInput,
  actor: UserClaims,
  correlationId: string,
  nowIso: string,
): { caseRecord: AssuranceCase; event: WorkflowEventRecord } {
  const caseRecord = buildDraftCase(input, actor, nowIso);
  const event: WorkflowEventRecord = {
    actionId: `${input.caseId}:0001:create_case`,
    caseId: input.caseId,
    actorUserId: actor.userId,
    actorRole: actor.role,
    actorOrg: actor.organizationId,
    actorOrganizationType: actor.organizationType,
    actionType: "create_case",
    previousState: undefined,
    newState: "draft",
    timestamp: nowIso,
    justification: "Draft case created through applicant portal or admin intake.",
    relatedDocumentIds: [],
    correlationId,
  };
  caseRecord.auditSequenceNumber = 1;
  return { caseRecord, event };
}

function getMatchingTransition(
  caseRecord: AssuranceCase,
  action: WorkflowActionType,
): TransitionDefinition | undefined {
  return TRANSITIONS.find(
    (transition) =>
      transition.action === action &&
      transition.from.includes(caseRecord.currentState),
  );
}

function containsAllDocuments(
  availableDocumentTypes: DocumentType[],
  requiredDocumentTypes: DocumentType[],
): boolean {
  return requiredDocumentTypes.every((requiredType) =>
    availableDocumentTypes.includes(requiredType),
  );
}

export function evaluateTransition(
  caseRecord: AssuranceCase,
  action: WorkflowActionType,
  actor: UserClaims,
  availableDocumentTypes: DocumentType[],
  justification?: string,
): TransitionEvaluation {
  const transition = getMatchingTransition(caseRecord, action);
  const reasons: string[] = [];

  if (!transition) {
    return {
      allowed: false,
      reasons: [
        `No transition is defined for action "${action}" from state "${caseRecord.currentState}".`,
      ],
    };
  }

  const roleProfile = ROLE_PERMISSION_MATRIX[actor.role];
  if (!actor.activeFlag) {
    reasons.push(`Actor "${actor.userId}" is inactive.`);
  }

  if (roleProfile.organizationType !== actor.organizationType) {
    reasons.push(
      `Role "${actor.role}" must belong to organization type "${roleProfile.organizationType}", but received "${actor.organizationType}".`,
    );
  }

  if (!roleProfile.allowedActions.includes(action)) {
    reasons.push(`Role "${actor.role}" is not allowed to perform "${action}".`);
  }

  if (!transition.allowedRoles.includes(actor.role)) {
    reasons.push(
      `Transition "${action}" does not allow role "${actor.role}" for this state.`,
    );
  }

  if (!transition.allowedOrganizationTypes.includes(actor.organizationType)) {
    reasons.push(
      `Organization type "${actor.organizationType}" is not permitted for "${action}".`,
    );
  }

  if (
    transition.requiredDocumentTypes.length > 0 &&
    !containsAllDocuments(availableDocumentTypes, transition.requiredDocumentTypes)
  ) {
    reasons.push(
      `Missing required document types: ${transition.requiredDocumentTypes.join(", ")}.`,
    );
  }

  if (
    action === "respond_to_information_request" &&
    !caseRecord.currentSubstate
  ) {
    reasons.push(
      "More-information response requires case.currentSubstate so the case can resume correctly.",
    );
  }

  if (
    action === "approve_case" &&
    caseRecord.domesticRegulatorStatus !== "endorsed"
  ) {
    reasons.push(
      "Foreign approval requires domesticRegulatorStatus to be 'endorsed'.",
    );
  }

  if (
    [
      "initiate_non_substantive_amendment",
      "initiate_substantive_amendment",
    ].includes(action) &&
    (caseRecord.currentAssuranceVersion < 1 ||
      caseRecord.issuanceStatus !== "issued")
  ) {
    reasons.push(
      "Amendment initiation requires an active previously issued assurance instrument.",
    );
  }

  if (
    [
      "initiate_non_substantive_amendment",
      "initiate_substantive_amendment",
    ].includes(action) &&
    caseRecord.pendingAmendmentReviewMode !== "none"
  ) {
    reasons.push(
      "A new amendment workflow cannot start while another amendment review is already active.",
    );
  }

  if (
    action === "forward_to_foreign_authority" &&
    caseRecord.pendingAmendmentReviewMode === "non_substantive"
  ) {
    reasons.push(
      "Non-substantive amendments must not be forwarded into foreign review.",
    );
  }

  if (
    action === "issue_assurance" &&
    caseRecord.pendingAmendmentReviewMode !== "none"
  ) {
    reasons.push(
      "Use amend_assurance, not issue_assurance, when finalizing an active amendment workflow.",
    );
  }

  if (
    action === "reject_case" &&
    caseRecord.pendingAmendmentReviewMode !== "none"
  ) {
    reasons.push(
      "Use reject_amendment so the existing issued assurance remains active.",
    );
  }

  if (action === "reject_amendment") {
    if (caseRecord.pendingAmendmentReviewMode === "none") {
      reasons.push("No active amendment workflow exists to reject.");
    }
    if (!caseRecord.amendmentBaseState) {
      reasons.push(
        "Amendment rejection requires amendmentBaseState so the case can resume to the active assurance state.",
      );
    }
  }

  if (action === "amend_assurance") {
    if (caseRecord.pendingAmendmentReviewMode === "none") {
      reasons.push("No active amendment workflow exists to finalize.");
    }
    if (
      caseRecord.currentState === "awaiting_coordination" &&
      caseRecord.pendingAmendmentReviewMode !== "non_substantive"
    ) {
      reasons.push(
        "Only non-substantive amendments may finalize directly from awaiting_coordination.",
      );
    }
    if (
      caseRecord.currentState === "approved" &&
      caseRecord.pendingAmendmentReviewMode !== "substantive"
    ) {
      reasons.push(
        "Only substantive amendments may finalize from approved after renewed foreign review.",
      );
    }
  }

  if (
    [
      "request_more_information",
      "reject_case",
      "reject_amendment",
      "revoke_assurance",
    ].includes(action) &&
    (!justification || justification.trim().length === 0)
  ) {
    reasons.push(`Action "${action}" requires a non-empty justification.`);
  }

  if (reasons.length > 0) {
    return { allowed: false, reasons, transition };
  }

  return {
    allowed: true,
    nextState:
      transition.to === "resume_from_substate"
        ? (caseRecord.currentSubstate as WorkflowState)
        : transition.to === "resume_from_amendment_base"
          ? (caseRecord.amendmentBaseState as WorkflowState)
          : transition.to,
    reasons: [],
    transition,
  };
}

export function applyTransition(
  caseRecord: AssuranceCase,
  action: WorkflowActionType,
  actor: UserClaims,
  availableDocumentTypes: DocumentType[],
  relatedDocumentIds: string[],
  justification: string,
  correlationId: string,
  nowIso: string,
): { updatedCase: AssuranceCase; event: WorkflowEventRecord } {
  const evaluation = evaluateTransition(
    caseRecord,
    action,
    actor,
    availableDocumentTypes,
    justification,
  );

  if (!evaluation.allowed || !evaluation.nextState) {
    throw new Error(evaluation.reasons.join(" "));
  }

  const updatedCase: AssuranceCase = {
    ...caseRecord,
    currentState: evaluation.nextState,
    currentSubstate:
      action === "request_more_information"
        ? caseRecord.currentState
        : action === "respond_to_information_request"
          ? undefined
          : action === "reject_amendment"
            ? undefined
          : caseRecord.currentSubstate,
    lastUpdatedAt: nowIso,
    activeDocumentIds:
      relatedDocumentIds.length > 0
        ? Array.from(new Set([...caseRecord.activeDocumentIds, ...relatedDocumentIds]))
        : caseRecord.activeDocumentIds,
    auditSequenceNumber: caseRecord.auditSequenceNumber + 1,
  };

  if (action === "record_domestic_review") {
    updatedCase.domesticRegulatorStatus = "in_review";
  }
  if (action === "forward_to_coordination") {
    updatedCase.domesticRegulatorStatus = "endorsed";
    updatedCase.coordinationStatus = "queued";
  }
  if (action === "forward_to_foreign_authority") {
    updatedCase.coordinationStatus = "forwarded";
  }
  if (action === "record_foreign_review") {
    updatedCase.foreignRegulatorStatus = "in_review";
  }
  if (action === "approve_case") {
    updatedCase.foreignRegulatorStatus = "approved";
    updatedCase.coordinationStatus = "completed";
  }
  if (action === "reject_case") {
    if (actor.organizationType === "domestic_regulator") {
      updatedCase.domesticRegulatorStatus = "rejected";
    }
    if (actor.organizationType === "foreign_regulator") {
      updatedCase.foreignRegulatorStatus = "rejected";
    }
    if (actor.organizationType === "coordinating_authority") {
      updatedCase.coordinationStatus = "completed";
    }
  }
  if (action === "initiate_non_substantive_amendment") {
    updatedCase.amendmentFlag = true;
    updatedCase.pendingAmendmentReviewMode = "non_substantive";
    updatedCase.amendmentBaseState = caseRecord.currentState as "issued" | "amended";
    updatedCase.domesticRegulatorStatus = "endorsed";
    updatedCase.coordinationStatus = "queued";
    updatedCase.foreignRegulatorStatus = "approved";
  }
  if (action === "initiate_substantive_amendment") {
    updatedCase.amendmentFlag = true;
    updatedCase.pendingAmendmentReviewMode = "substantive";
    updatedCase.amendmentBaseState = caseRecord.currentState as "issued" | "amended";
    updatedCase.domesticRegulatorStatus = "in_review";
    updatedCase.coordinationStatus = "not_started";
    updatedCase.foreignRegulatorStatus = "not_started";
  }
  if (action === "issue_assurance") {
    updatedCase.issuanceStatus = "issued";
    updatedCase.currentAssuranceVersion =
      caseRecord.currentAssuranceVersion > 0
        ? caseRecord.currentAssuranceVersion
        : 1;
    updatedCase.coordinationStatus = "completed";
  }
  if (action === "amend_assurance") {
    updatedCase.amendmentFlag = true;
    updatedCase.pendingAmendmentReviewMode = "none";
    updatedCase.amendmentBaseState = undefined;
    updatedCase.issuanceStatus = "issued";
    updatedCase.currentAssuranceVersion = caseRecord.currentAssuranceVersion + 1;
    updatedCase.coordinationStatus = "completed";
    updatedCase.foreignRegulatorStatus = "approved";
    updatedCase.domesticRegulatorStatus = "endorsed";
  }
  if (action === "reject_amendment") {
    updatedCase.pendingAmendmentReviewMode = "none";
    updatedCase.amendmentBaseState = undefined;
    updatedCase.issuanceStatus = "issued";
    updatedCase.coordinationStatus = "completed";
    updatedCase.foreignRegulatorStatus = "approved";
    updatedCase.domesticRegulatorStatus = "endorsed";
  }
  if (action === "revoke_assurance") {
    updatedCase.revocationFlag = true;
    updatedCase.issuanceStatus = "revoked";
    updatedCase.pendingAmendmentReviewMode = "none";
    updatedCase.amendmentBaseState = undefined;
  }

  const event: WorkflowEventRecord = {
    actionId: `${caseRecord.caseId}:${String(updatedCase.auditSequenceNumber).padStart(4, "0")}:${action}`,
    caseId: caseRecord.caseId,
    actorUserId: actor.userId,
    actorRole: actor.role,
    actorOrg: actor.organizationId,
    actorOrganizationType: actor.organizationType,
    actionType: action,
    previousState: caseRecord.currentState,
    newState: updatedCase.currentState,
    timestamp: nowIso,
    justification,
    relatedDocumentIds,
    correlationId,
  };

  return { updatedCase, event };
}
