import {
  METRICS,
  ROLE_PERMISSION_MATRIX,
  type AssuranceCase,
  type DocumentReference,
  type DocumentType,
  type TransitionDefinition,
  type UserClaims,
  type WorkflowActionType,
} from "@prototype/shared";
import type { WorkspaceKey } from "./session.js";

export type FeedbackState =
  | { tone: "neutral"; text: string }
  | { tone: "success"; text: string }
  | { tone: "error"; text: string };

export type QueueMode = "actionable" | "all";
export type DetailTab = "overview" | "documents" | "timeline" | "evidence";

export interface DraftFormState {
  applicantOrgId: string;
  applicantOrgName: string;
  itemCategory: string;
  itemDescription: string;
  quantity: string;
  originJurisdiction: string;
  destinationJurisdiction: string;
  intendedUse: string;
  legalTreatyBasis: string;
  priority: AssuranceCase["priority"];
  remarksSummary: string;
  visibilityScopeText: string;
}

export interface DocumentFormState {
  documentType: DocumentType;
  classification: DocumentReference["classification"];
  accessScopeText: string;
  contentText: string;
  supersedesDocumentId: string;
}

export const DEFAULT_DRAFT_FORM: DraftFormState = {
  applicantOrgId: "applicant-org-001",
  applicantOrgName: "Synthetic Applicant Organization",
  itemCategory: "fresh_fuel_component",
  itemDescription: "Unirradiated fuel assembly shipment request",
  quantity: "2",
  originJurisdiction: "United Arab Emirates",
  destinationJurisdiction: "Republic of Korea",
  intendedUse: "peaceful_nuclear_power_generation",
  legalTreatyBasis: "sandbox-bilateral-assurance-arrangement",
  priority: "routine",
  remarksSummary:
    "Sponsor-anonymous cross-border authorization evaluation case.",
  visibilityScopeText:
    "applicant_organization, domestic_regulator, coordinating_authority, auditor_body",
};

export const DEFAULT_DOCUMENT_TYPE: DocumentType = "supporting_correspondence";

export function readInitialWorkspaceKey(): WorkspaceKey {
  const value = new URLSearchParams(window.location.search).get("workspace");
  if (
    value === "applicant" ||
    value === "domestic" ||
    value === "coordination" ||
    value === "foreign" ||
    value === "auditor" ||
    value === "admin"
  ) {
    return value;
  }

  return "applicant";
}

export function readInitialTextParam(name: string): string {
  return new URLSearchParams(window.location.search).get(name) ?? "";
}

export function humanize(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function formatDateTime(value?: string): string {
  if (!value) {
    return "Not recorded";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

export function formatInteger(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatMetricValue(value: number): string {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(2)} s`;
  }

  return `${value.toFixed(2)} ms`;
}

export function summarizeVisibleCases(
  cases: AssuranceCase[],
  query: string,
  stateFilter: string,
): AssuranceCase[] {
  const normalizedQuery = query.trim().toLowerCase();

  return cases.filter((caseRecord) => {
    const matchesState =
      stateFilter === "all" || caseRecord.currentState === stateFilter;
    const searchableText = [
      caseRecord.caseNumber,
      caseRecord.applicantOrgName,
      caseRecord.itemCategory,
      caseRecord.itemDescription,
      caseRecord.originJurisdiction,
      caseRecord.destinationJurisdiction,
    ]
      .join(" ")
      .toLowerCase();

    const matchesQuery =
      normalizedQuery.length === 0 || searchableText.includes(normalizedQuery);

    return matchesState && matchesQuery;
  });
}

export function getMetricDescription(metricId: string): string {
  return (
    METRICS.find((metric) => metric.metricId === metricId)?.description ??
    "Recorded system metric."
  );
}

export function parseScope(scopeText: string): string[] {
  return scopeText
    .split(",")
    .map((scope) => scope.trim())
    .filter(Boolean);
}

export function defaultScopeForActor(actor: UserClaims): string[] {
  switch (actor.organizationType) {
    case "applicant_organization":
      return [
        "applicant_organization",
        "domestic_regulator",
        "coordinating_authority",
        "auditor_body",
      ];
    case "foreign_regulator":
      return [
        "domestic_regulator",
        "coordinating_authority",
        "foreign_regulator",
        "auditor_body",
      ];
    default:
      return [
        "applicant_organization",
        "domestic_regulator",
        "coordinating_authority",
        "foreign_regulator",
        "auditor_body",
      ];
  }
}

export function buildDefaultDocumentForm(actor: UserClaims): DocumentFormState {
  return {
    documentType: DEFAULT_DOCUMENT_TYPE,
    classification: "restricted",
    accessScopeText: defaultScopeForActor(actor).join(", "),
    contentText:
      "Synthetic placeholder content for sandbox validation and screenshot capture.",
    supersedesDocumentId: "",
  };
}

export function getAvailableTransitions(
  workflowModel: TransitionDefinition[],
  caseRecord: AssuranceCase | undefined,
  actor: UserClaims,
): TransitionDefinition[] {
  if (!caseRecord) {
    return [];
  }

  return workflowModel.filter(
    (transition) =>
      transition.from.includes(caseRecord.currentState) &&
      transition.allowedRoles.includes(actor.role) &&
      transition.allowedOrganizationTypes.includes(actor.organizationType),
  );
}

export function isCreateCaseAllowed(actor: UserClaims): boolean {
  return ROLE_PERMISSION_MATRIX[actor.role].allowedActions.includes("create_case");
}

export function isUploadAllowed(actor: UserClaims): boolean {
  return actor.organizationType !== "auditor_body";
}

export function transitionLabel(action: WorkflowActionType): string {
  return humanize(action);
}

export function getWorkspaceSteps(workspaceKey: WorkspaceKey): string[] {
  switch (workspaceKey) {
    case "applicant":
      return [
        "Create a draft and keep the case metadata concise and realistic.",
        "Attach the required submission documents before you try to submit.",
        "Respond only when the case returns in a more-information state.",
      ];
    case "domestic":
      return [
        "Pick a case from the action queue and start formal domestic review.",
        "Attach notices or evidence only when the workflow step needs them.",
        "Forward only after the dossier is complete enough to endorse.",
      ];
    case "coordination":
      return [
        "Use this lane for foreign forwarding, issuance, and amendment finalization.",
        "Watch the evidence tab when you need exchange or performance context.",
        "Treat Fabric as the authority and PostgreSQL as the fast read mirror.",
      ];
    case "foreign":
      return [
        "Review only forwarded cases that have entered the foreign lane.",
        "Record formal foreign review before approving or rejecting.",
        "Use document attachments for formal responses, not informal notes.",
      ];
    case "auditor":
      return [
        "This view is read-only and meant for reconstruction and verification.",
        "Use the document tab to verify file integrity against on-chain hashes.",
        "Use the timeline tab to explain who changed what and when.",
      ];
    case "admin":
      return [
        "Use this workspace sparingly for cross-cutting support and inspection.",
        "Prefer the evidence tab when you need metrics or simulator activity.",
        "Admin visibility never replaces chaincode policy enforcement.",
      ];
  }
}

export function getPrimaryPanelTitle(workspaceKey: WorkspaceKey): string {
  switch (workspaceKey) {
    case "applicant":
      return "Submission workspace";
    case "domestic":
      return "Domestic review workspace";
    case "coordination":
      return "Coordination workspace";
    case "foreign":
      return "Foreign review workspace";
    case "auditor":
      return "Audit workspace";
    case "admin":
      return "Operations workspace";
  }
}

export function StateBadge({ state }: { state: string }) {
  return <span className={`state-pill state-${state}`}>{humanize(state)}</span>;
}

export function SummaryCard(props: {
  label: string;
  value: string;
  detail: string;
  accent?: "rust" | "teal" | "slate" | "gold";
}) {
  return (
    <article className={`summary-card summary-${props.accent ?? "slate"}`}>
      <p className="summary-label">{props.label}</p>
      <strong className="summary-value">{props.value}</strong>
      <p className="summary-detail">{props.detail}</p>
    </article>
  );
}
