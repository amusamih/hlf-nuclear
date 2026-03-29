import {
  startTransition,
  useDeferredValue,
  useEffect,
  useState,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from "react";
import {
  DOCUMENT_TYPES,
  METRICS,
  TRANSITIONS,
  WORKFLOW_STATES,
  type AssuranceCase,
  type DocumentReference,
  type DocumentType,
  type TransitionDefinition,
  type WorkflowEventRecord,
} from "@prototype/shared";
import {
  ApiError,
  encodeTextContent,
  getJson,
  postJson,
  readFileAsBase64,
} from "./api.js";
import {
  DEFAULT_DRAFT_FORM,
  buildDefaultDocumentForm,
  formatDateTime,
  formatInteger,
  formatMetricValue,
  getAvailableTransitions,
  getMetricDescription,
  humanize,
  isCreateCaseAllowed,
  isUploadAllowed,
  parseScope,
  readInitialTextParam,
  readInitialWorkspaceKey,
  StateBadge,
  SummaryCard,
  summarizeVisibleCases,
  transitionLabel,
  type DocumentFormState,
  type DraftFormState,
  type FeedbackState,
  type QueueMode,
} from "./frontend-helpers.js";
import {
  WORKSPACE_PROFILES,
  getWorkspaceProfile,
  type WorkspaceKey,
} from "./session.js";
import type {
  CaseCommandResponse,
  IntegrationExchangeRecord,
  IntegrationExchangeSummary,
  MetricSummaryRow,
  UploadDocumentResponse,
  VerifyDocumentResponse,
} from "./types.js";

type AppView = "overview" | "workflow" | "documents" | "audit";

function readInitialView(): AppView {
  const value = new URLSearchParams(window.location.search).get("view");
  if (
    value === "overview" ||
    value === "workflow" ||
    value === "documents" ||
    value === "audit"
  ) {
    return value;
  }

  return "overview";
}

function getDefaultView(workspaceKey: WorkspaceKey): AppView {
  switch (workspaceKey) {
    case "domestic":
    case "coordination":
    case "foreign":
      return "workflow";
    case "auditor":
      return "audit";
    default:
      return "overview";
  }
}

const WORKFLOW_PROGRESS_STEPS = [
  { state: "draft", label: "Draft" },
  { state: "submitted", label: "Submitted" },
  { state: "under_domestic_review", label: "Domestic review" },
  { state: "awaiting_coordination", label: "Coordination" },
  { state: "forwarded_to_foreign_authority", label: "Forwarded" },
  { state: "under_foreign_review", label: "Foreign review" },
  { state: "approved", label: "Approved" },
  { state: "issued", label: "Issued" },
] as const;

function getProgressState(caseRecord?: AssuranceCase) {
  if (!caseRecord) {
    return undefined;
  }

  if (caseRecord.currentState === "more_information_requested") {
    return caseRecord.currentSubstate ?? "under_domestic_review";
  }

  if (
    caseRecord.currentState === "amended" ||
    caseRecord.currentState === "revoked" ||
    caseRecord.currentState === "closed_archived"
  ) {
    return "issued";
  }

  if (caseRecord.currentState === "rejected") {
    return "under_foreign_review";
  }

  return caseRecord.currentState;
}

function getProgressNote(caseRecord?: AssuranceCase) {
  if (!caseRecord) {
    return "Pick a case from the queue to inspect its stage and next valid action.";
  }

  switch (caseRecord.currentState) {
    case "more_information_requested":
      return "The case is paused pending a response package and will resume at the stored review context.";
    case "amended":
      return "An amended assurance is the current active baseline for the case.";
    case "revoked":
      return "The assurance has been revoked and remains available for post-issuance inspection.";
    case "rejected":
      return "The case ended in rejection and remains available for audit and closure.";
    case "closed_archived":
      return "The case is closed and retained as an archival record.";
    default:
      return "Completed stages are shown to the left of the current workflow position.";
  }
}

function getNextActionHint(
  caseRecord: AssuranceCase | undefined,
  availableTransitions: TransitionDefinition[],
) {
  if (availableTransitions.length > 0) {
    return `Next valid action: ${transitionLabel(availableTransitions[0].action)}.`;
  }

  if (!caseRecord) {
    return "Select a case to reveal the next valid workflow action.";
  }

  switch (caseRecord.currentState) {
    case "submitted":
      return "Awaiting domestic review intake.";
    case "under_domestic_review":
      return "Domestic review is active in the current regulatory lane.";
    case "awaiting_coordination":
      return "Awaiting coordination checks and foreign forwarding.";
    case "forwarded_to_foreign_authority":
      return "Awaiting foreign acknowledgement and review start.";
    case "under_foreign_review":
      return "Awaiting a foreign decision or additional-information request.";
    case "approved":
      return "Issuance is now available to the coordinating authority.";
    case "rejected":
      return "The case is terminal unless it is formally closed.";
    case "issued":
      return "The active assurance can be amended, revoked, or closed.";
    case "amended":
      return "The amended assurance is the active baseline.";
    case "revoked":
      return "The revoked assurance remains auditable until closure.";
    case "closed_archived":
      return "The case is archived and no further workflow action is expected.";
    default:
      return "Review the case details to determine the next operational step.";
  }
}

function describeProgressStatus(caseRecord?: AssuranceCase) {
  if (!caseRecord) {
    return "No case selected";
  }

  switch (caseRecord.currentState) {
    case "more_information_requested":
      return "Paused for applicant response";
    case "rejected":
      return "Terminated in rejection";
    case "revoked":
      return "Assurance revoked";
    case "closed_archived":
      return "Archive-only record";
    case "amended":
      return "Amended assurance active";
    default:
      return humanize(caseRecord.currentState);
  }
}

function getMetricDefinition(metricId: string) {
  return METRICS.find((metric) => metric.metricId === metricId);
}

function formatMetricTitle(metricId: string) {
  const definition = getMetricDefinition(metricId);
  switch (metricId) {
    case "fabric_invoke_latency_ms":
      return "Fabric invoke latency";
    case "transition_latency_ms":
      return "Workflow transition latency";
    case "document_anchor_latency_ms":
      return "Document anchoring time";
    case "document_integrity_verification_ms":
      return "Document verification time";
    case "audit_reconstruction_ms":
      return "Audit reconstruction time";
    case "transaction_success_count":
      return "Transaction success count";
    case "transaction_failure_count":
      return "Transaction failure count";
    case "integration_exchange_success_count":
      return "Exchange success count";
    case "integration_exchange_failure_count":
      return "Exchange failure count";
    case "domestic_intake_latency_ms":
      return "Domestic intake latency";
    case "foreign_simulator_exchange_latency_ms":
      return "Foreign exchange latency";
    case "status_sync_generation_ms":
      return "Status-sync generation time";
    default:
      return definition ? humanize(definition.metricId) : humanize(metricId);
  }
}

function formatMetricPrimary(metric: MetricSummaryRow) {
  const definition = getMetricDefinition(metric.metricId);
  if (definition?.unit === "count") {
    return {
      label: "Total",
      value: formatInteger(metric.count),
    };
  }

  return {
    label: "Avg",
    value: formatMetricValue(metric.average),
  };
}

function formatMetricSecondary(metric: MetricSummaryRow) {
  const definition = getMetricDefinition(metric.metricId);
  if (definition?.unit === "count") {
    return {
      label: "Observed",
      value: `${formatInteger(metric.count)} event${metric.count === 1 ? "" : "s"}`,
    };
  }

  return {
    label: "P95",
    value: formatMetricValue(metric.p95),
  };
}

function formatMetricCategory(metricId: string) {
  const definition = getMetricDefinition(metricId);
  return definition ? humanize(definition.category) : "Metric";
}

function truncateCaseReference(caseId: string) {
  if (caseId.length <= 22) {
    return caseId;
  }

  return `${caseId.slice(0, 8)}...${caseId.slice(-6)}`;
}

function CaseWorkspaceHeader(props: {
  selectedCase?: AssuranceCase;
  activeDocumentCount: number;
  availableTransitions: TransitionDefinition[];
  canCreateCase: boolean;
  isCreateFormOpen: boolean;
  setIsCreateFormOpen: (value: boolean) => void;
}) {
  if (!props.selectedCase) {
    return (
      <section className="panel workspace-header-card">
        <div className="workspace-header-top">
          <div>
            <p className="panel-kicker">Case workspace</p>
            <h2>No case selected</h2>
          </div>
          {props.canCreateCase ? (
            <button
              className="secondary-button calm-button"
              onClick={() => props.setIsCreateFormOpen(!props.isCreateFormOpen)}
              type="button"
            >
              {props.isCreateFormOpen ? "Hide creation form" : "New application"}
            </button>
          ) : null}
        </div>
        <p className="muted">
          Select a case from the queue to review its dossier, workflow stage, and
          next permitted action.
        </p>
      </section>
    );
  }

  return (
    <section className="panel workspace-header-card">
      <div className="workspace-header-top">
        <div>
          <p className="panel-kicker">Case workspace</p>
          <h2>{props.selectedCase.caseNumber}</h2>
          <p className="workspace-header-lead">
            {props.selectedCase.itemDescription}
          </p>
        </div>
        <div className="workspace-header-actions">
          <StateBadge state={props.selectedCase.currentState} />
          {props.canCreateCase ? (
            <button
              className="secondary-button calm-button"
              onClick={() => props.setIsCreateFormOpen(!props.isCreateFormOpen)}
              type="button"
            >
              {props.isCreateFormOpen ? "Hide creation form" : "New application"}
            </button>
          ) : null}
        </div>
      </div>
      <div className="workspace-header-meta">
        <div>
          <span className="meta-label">Applicant</span>
          <strong>{props.selectedCase.applicantOrgName}</strong>
        </div>
        <div>
          <span className="meta-label">Route</span>
          <strong>
            {props.selectedCase.originJurisdiction} to{" "}
            {props.selectedCase.destinationJurisdiction}
          </strong>
        </div>
        <div>
          <span className="meta-label">Priority</span>
          <strong>{humanize(props.selectedCase.priority)}</strong>
        </div>
        <div>
          <span className="meta-label">Last updated</span>
          <strong>{formatDateTime(props.selectedCase.lastUpdatedAt)}</strong>
        </div>
      </div>
      <div className="workspace-header-pills">
        <span className="soft-pill emphasis-pill">
          {getNextActionHint(props.selectedCase, props.availableTransitions)}
        </span>
        <span className="soft-pill">
          {formatInteger(props.activeDocumentCount)} active document
          {props.activeDocumentCount === 1 ? "" : "s"}
        </span>
        <span className="soft-pill">
          {formatInteger(props.availableTransitions.length)} available action
          {props.availableTransitions.length === 1 ? "" : "s"}
        </span>
        <span className="soft-pill">
          Assurance version v{props.selectedCase.currentAssuranceVersion}
        </span>
      </div>
    </section>
  );
}

function WorkflowProgressRail(props: { selectedCase?: AssuranceCase }) {
  const progressState = getProgressState(props.selectedCase);
  const currentIndex = progressState
    ? WORKFLOW_PROGRESS_STEPS.findIndex((step) => step.state === progressState)
    : -1;
  const completedCount = currentIndex >= 0 ? currentIndex : 0;

  return (
    <section className="panel workflow-progress-card">
      <div className="panel-header compact">
        <div>
          <p className="panel-kicker">Workflow</p>
          <h2>Lifecycle position</h2>
        </div>
        {props.selectedCase ? (
          <StateBadge state={props.selectedCase.currentState} />
        ) : null}
      </div>
      {props.selectedCase ? (
        <div className="workflow-status-strip">
          <article className="workflow-status-item">
            <span className="meta-label">Current stage</span>
            <strong>
              {humanize(
                currentIndex >= 0
                  ? WORKFLOW_PROGRESS_STEPS[currentIndex].state
                  : props.selectedCase.currentState,
              )}
            </strong>
          </article>
          <article className="workflow-status-item">
            <span className="meta-label">Progress</span>
            <strong>
              {formatInteger(completedCount)} of{" "}
              {formatInteger(WORKFLOW_PROGRESS_STEPS.length - 1)} transitions completed
            </strong>
          </article>
          <article className="workflow-status-item">
            <span className="meta-label">Workflow posture</span>
            <strong>{describeProgressStatus(props.selectedCase)}</strong>
          </article>
        </div>
      ) : null}
      <div className="workflow-stepper">
        {WORKFLOW_PROGRESS_STEPS.map((step, index) => {
          const status =
            currentIndex === -1
              ? "future"
              : index < currentIndex
                ? "complete"
                : index === currentIndex
                  ? "current"
                  : "future";

          return (
            <div className={`stepper-step ${status}`} key={step.state}>
              <span className="stepper-index">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className="stepper-bar" />
              <strong>{step.label}</strong>
              <span className="stepper-status">
                {status === "complete"
                  ? "Completed"
                  : status === "current"
                    ? "Current"
                    : "Upcoming"}
              </span>
            </div>
          );
        })}
      </div>
      <p className="muted">{getProgressNote(props.selectedCase)}</p>
    </section>
  );
}

function AppNavigation(props: {
  workspaceKey: WorkspaceKey;
  activeView: AppView;
  setActiveView: (view: AppView) => void;
}) {
  const views: Record<WorkspaceKey, Array<{ key: AppView; label: string }>> = {
    applicant: [
      { key: "overview", label: "Overview" },
      { key: "workflow", label: "My Cases" },
      { key: "documents", label: "Documents" },
      { key: "audit", label: "History" },
    ],
    domestic: [
      { key: "overview", label: "Overview" },
      { key: "workflow", label: "Review Queue" },
      { key: "documents", label: "Documents" },
      { key: "audit", label: "Audit Trail" },
    ],
    coordination: [
      { key: "overview", label: "Overview" },
      { key: "workflow", label: "Coordination" },
      { key: "documents", label: "Documents" },
      { key: "audit", label: "Audit Trail" },
    ],
    foreign: [
      { key: "overview", label: "Overview" },
      { key: "workflow", label: "Foreign Review" },
      { key: "documents", label: "Documents" },
      { key: "audit", label: "Audit Trail" },
    ],
    auditor: [
      { key: "overview", label: "Case Summary" },
      { key: "documents", label: "Documents" },
      { key: "audit", label: "Audit Trail" },
    ],
    admin: [
      { key: "overview", label: "Overview" },
      { key: "workflow", label: "Case Queue" },
      { key: "documents", label: "Documents" },
      { key: "audit", label: "Audit Trail" },
    ],
  };

  return (
    <nav className="app-nav sidebar-nav">
      {views[props.workspaceKey].map((view) => (
        <button
          className={`nav-button ${props.activeView === view.key ? "active" : ""}`}
          key={view.key}
          onClick={() => props.setActiveView(view.key)}
          type="button"
        >
          <strong>{view.label}</strong>
        </button>
      ))}
      </nav>
  );
}

interface QueuePanelProps {
  displayedEntries: Array<{
    caseRecord: AssuranceCase;
    roleActions: TransitionDefinition[];
  }>;
  queueMode: QueueMode;
  setQueueMode: (mode: QueueMode) => void;
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  stateFilter: string;
  setStateFilter: (value: string) => void;
  selectedCaseId: string;
  setSelectedCaseId: (caseId: string) => void;
}

function QueuePanelBody(props: QueuePanelProps) {
  return (
    <>
      <div className="panel-header">
        <div>
          <p className="panel-kicker">Queue</p>
          <h2>Cases</h2>
        </div>
      </div>
      <div className="queue-tools">
        <input
          placeholder="Search case, applicant, item, or route"
          value={props.searchQuery}
          onChange={(event) => props.setSearchQuery(event.target.value)}
        />
        <select
          value={props.stateFilter}
          onChange={(event) => props.setStateFilter(event.target.value)}
        >
          <option value="all">All states</option>
          {WORKFLOW_STATES.map((state) => (
            <option key={state} value={state}>
              {humanize(state)}
            </option>
          ))}
        </select>
        <div className="segmented-control">
          <button
            className={props.queueMode === "actionable" ? "active" : ""}
            onClick={() => props.setQueueMode("actionable")}
            type="button"
          >
            Needs my action
          </button>
          <button
            className={props.queueMode === "all" ? "active" : ""}
            onClick={() => props.setQueueMode("all")}
            type="button"
          >
            All visible
          </button>
        </div>
      </div>
      <div className="queue-list">
        {props.displayedEntries.length === 0 ? (
          <div className="queue-empty-state">
            <strong>No cases match the current queue view</strong>
            <p className="muted">
              Broaden the search or switch to the wider visibility filter to inspect
              more cases.
            </p>
          </div>
        ) : (
          props.displayedEntries.map(({ caseRecord, roleActions }) => (
            <button
              className={`queue-row ${
                caseRecord.caseId === props.selectedCaseId ? "selected" : ""
              }`}
              key={caseRecord.caseId}
              onClick={() => props.setSelectedCaseId(caseRecord.caseId)}
              type="button"
            >
              <div className="queue-row-main">
                <div className="queue-row-head">
                  <strong>{caseRecord.caseNumber}</strong>
                  <span className="queue-route">
                    {caseRecord.originJurisdiction} to{" "}
                    {caseRecord.destinationJurisdiction}
                  </span>
                </div>
                <p className="queue-row-title">{caseRecord.itemDescription}</p>
                <div className="queue-row-meta">
                  <span>{caseRecord.applicantOrgName}</span>
                  <span>{humanize(caseRecord.priority)}</span>
                  <span>{formatDateTime(caseRecord.lastUpdatedAt)}</span>
                </div>
              </div>
              <div className="queue-row-side">
                <StateBadge state={caseRecord.currentState} />
                <span className="queue-count">
                  {roleActions.length} action{roleActions.length === 1 ? "" : "s"}
                </span>
              </div>
            </button>
          ))
        )}
      </div>
    </>
  );
}

function CaseQueuePanel(props: QueuePanelProps & { embedded?: boolean }) {
  const { embedded, ...queueProps } = props;

  if (embedded) {
    return (
      <div className="queue-panel-body">
        <QueuePanelBody {...queueProps} />
      </div>
    );
  }

  return (
    <section className="panel queue-panel">
      <QueuePanelBody {...queueProps} />
    </section>
  );
}

function SelectedCaseSnapshot(props: {
  selectedCase?: AssuranceCase;
  availableTransitions: TransitionDefinition[];
}) {
  if (!props.selectedCase) {
    return (
      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="panel-kicker">Selected case</p>
            <h2>Nothing selected yet</h2>
          </div>
        </div>
        <p className="muted">
          Choose a case from the queue to see the dossier, next action, and
          evidence.
        </p>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="panel-kicker">Selected case</p>
          <h2>{props.selectedCase.caseNumber}</h2>
        </div>
        <StateBadge state={props.selectedCase.currentState} />
      </div>
      <div className="case-snapshot-grid">
        <article className="detail-card">
          <h3>Profile</h3>
          <dl>
            <div>
              <dt>Applicant</dt>
              <dd>{props.selectedCase.applicantOrgName}</dd>
            </div>
            <div>
              <dt>Item</dt>
              <dd>{props.selectedCase.itemDescription}</dd>
            </div>
            <div>
              <dt>Route</dt>
              <dd>
                {props.selectedCase.originJurisdiction} to{" "}
                {props.selectedCase.destinationJurisdiction}
              </dd>
            </div>
            <div>
              <dt>Priority</dt>
              <dd>{humanize(props.selectedCase.priority)}</dd>
            </div>
          </dl>
        </article>

        <article className="detail-card">
          <h3>What happens next</h3>
          {props.availableTransitions.length > 0 ? (
            <div className="subtle-list">
              {props.availableTransitions.slice(0, 3).map((transition) => (
                <div className="subtle-list-item" key={transition.action}>
                  <strong>{transitionLabel(transition.action)}</strong>
                  <span>
                    {transition.requiredDocumentTypes.length > 0
                      ? `${transition.requiredDocumentTypes.length} required document type(s)`
                      : "No mandatory document attachment"}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">
              No workflow action is available to this workspace for the current
              state.
            </p>
          )}
        </article>

        <article className="detail-card">
          <h3>Lane status</h3>
          <div className="lane-grid">
            <span>Domestic: {humanize(props.selectedCase.domesticRegulatorStatus)}</span>
            <span>Coordination: {humanize(props.selectedCase.coordinationStatus)}</span>
            <span>Foreign: {humanize(props.selectedCase.foreignRegulatorStatus)}</span>
            <span>Issuance: {humanize(props.selectedCase.issuanceStatus)}</span>
          </div>
        </article>
      </div>
    </section>
  );
}

function OperationalSummaryPanel(props: {
  selectedCase?: AssuranceCase;
  timeline: WorkflowEventRecord[];
  availableTransitions: TransitionDefinition[];
  missingRequiredDocumentTypes: DocumentType[];
  documents: DocumentReference[];
}) {
  if (!props.selectedCase) {
    return (
      <section className="panel operational-summary-panel">
        <div className="panel-header">
          <div>
            <p className="panel-kicker">Operational summary</p>
            <h2>Awaiting case selection</h2>
          </div>
        </div>
        <p className="muted">
          Choose a case from the queue to inspect its latest event, evidence
          posture, and next operational step.
        </p>
      </section>
    );
  }

  const latestEvent = props.timeline[0];
  const activeDocuments = props.documents.filter(
    (documentReference) => documentReference.isActive,
  );

  return (
    <section className="panel operational-summary-panel">
      <div className="panel-header">
        <div>
          <p className="panel-kicker">Operational summary</p>
          <h2>Selected case summary</h2>
        </div>
      </div>
      <div className="summary-stack">
        <article className="summary-spotlight">
          <span className="meta-label">Latest recorded event</span>
          <strong>
            {latestEvent
              ? transitionLabel(latestEvent.actionType)
              : "No recorded workflow event yet"}
          </strong>
          <p>
            {latestEvent
              ? formatDateTime(latestEvent.timestamp)
              : "The case has not produced a transition event yet."}
          </p>
        </article>
        <div className="operational-summary-grid">
          <article className="summary-cell">
            <span className="meta-label">Next operational step</span>
            <strong>
              {getNextActionHint(props.selectedCase, props.availableTransitions)}
            </strong>
          </article>
          <article className="summary-cell">
            <span className="meta-label">Evidence readiness</span>
            <strong>
              {props.missingRequiredDocumentTypes.length > 0
                ? `Missing ${props.missingRequiredDocumentTypes.length} required type(s)`
                : "Required evidence satisfied for the active action"}
            </strong>
          </article>
          <article className="summary-cell">
            <span className="meta-label">Audit position</span>
            <strong>
              Sequence {formatInteger(props.selectedCase.auditSequenceNumber)}
            </strong>
          </article>
          <article className="summary-cell">
            <span className="meta-label">Active dossier</span>
            <strong>
              {formatInteger(activeDocuments.length)} active document
              {activeDocuments.length === 1 ? "" : "s"}
            </strong>
          </article>
        </div>
        <article className="summary-cell wide">
          <span className="meta-label">Remarks</span>
          <strong>{props.selectedCase.remarksSummary || "No remarks recorded"}</strong>
        </article>
      </div>
    </section>
  );
}

function WorkflowActionPanel(props: {
  selectedCase?: AssuranceCase;
  documents: DocumentReference[];
  selectedAction: string;
  setSelectedAction: (value: string) => void;
  availableTransitions: TransitionDefinition[];
  selectedTransition?: TransitionDefinition;
  missingRequiredDocumentTypes: DocumentType[];
  selectedDocumentIds: string[];
  setSelectedDocumentIds: Dispatch<SetStateAction<string[]>>;
  justification: string;
  setJustification: (value: string) => void;
  handleExecuteAction: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  isBusy: boolean;
}) {
  if (!props.selectedCase) {
    return (
      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="panel-kicker">Workflow</p>
            <h2>Next action</h2>
          </div>
        </div>
        <p className="muted">Select a case to execute a workflow step.</p>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="panel-kicker">Workflow</p>
          <h2>Next action</h2>
        </div>
      </div>
      {props.availableTransitions.length === 0 ? (
        <div className="notice-card">
          <strong>No workflow action is available</strong>
          <p>
            This case is visible in the current workspace, but the next state
            change belongs to another role.
          </p>
        </div>
      ) : (
        <form className="form-stack" onSubmit={props.handleExecuteAction}>
          <label>
            Workflow action
            <select
              value={props.selectedAction}
              onChange={(event) => props.setSelectedAction(event.target.value)}
            >
              {props.availableTransitions.map((transition) => (
                <option key={transition.action} value={transition.action}>
                  {transitionLabel(transition.action)}
                </option>
              ))}
            </select>
          </label>

          {props.selectedTransition ? (
            <div className="transition-box">
              <div className="transition-group">
                <strong>Required document types</strong>
                <div className="pill-row">
                  {props.selectedTransition.requiredDocumentTypes.length > 0 ? (
                    props.selectedTransition.requiredDocumentTypes.map((documentType) => (
                      <span className="soft-pill" key={documentType}>
                        {humanize(documentType)}
                      </span>
                    ))
                  ) : (
                    <span className="soft-pill">No mandatory attachment</span>
                  )}
                </div>
              </div>
              <div className="transition-group">
                <strong>Status</strong>
                <p>
                  {props.missingRequiredDocumentTypes.length > 0
                    ? `Still missing: ${props.missingRequiredDocumentTypes
                        .map((documentType) => humanize(documentType))
                        .join(", ")}`
                    : "The active document set satisfies the required document types."}
                </p>
              </div>
              <details className="inline-drawer">
                <summary>Transition notes</summary>
                <p>
                  <strong>Preconditions:</strong>{" "}
                  {props.selectedTransition.preconditions.join("; ")}
                </p>
                <p>
                  <strong>Integration effects:</strong>{" "}
                  {props.selectedTransition.integrationEffects.length > 0
                    ? props.selectedTransition.integrationEffects.join(", ")
                    : "None"}
                </p>
              </details>
            </div>
          ) : null}

          <div className="document-selector">
            {props.documents.length === 0 ? (
              <p className="muted">
                No anchored documents yet. Use the Documents screen first.
              </p>
            ) : (
              props.documents.map((documentReference) => (
                <label className="selector-item" key={documentReference.documentId}>
                  <input
                    checked={props.selectedDocumentIds.includes(
                      documentReference.documentId,
                    )}
                    onChange={(event) => {
                      props.setSelectedDocumentIds((current) => {
                        if (event.target.checked) {
                          return current.concat(documentReference.documentId);
                        }

                        return current.filter(
                          (documentId) => documentId !== documentReference.documentId,
                        );
                      });
                    }}
                    type="checkbox"
                  />
                  <span>
                    {humanize(documentReference.documentType)} v
                    {documentReference.version}
                    {" - "}
                    {documentReference.fileName}
                  </span>
                </label>
              ))
            )}
          </div>

          <label>
            Justification
            <textarea
              rows={4}
              value={props.justification}
              onChange={(event) => props.setJustification(event.target.value)}
            />
          </label>

          <button
            className="primary-button"
            disabled={props.isBusy || !props.selectedAction}
            type="submit"
          >
            Execute action
          </button>
        </form>
      )}
    </section>
  );
}

export function App() {
  const [workspaceKey, setWorkspaceKey] =
    useState<WorkspaceKey>(readInitialWorkspaceKey);
  const [activeView, setActiveView] = useState<AppView>(readInitialView);
  const [cases, setCases] = useState<AssuranceCase[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState(() =>
    readInitialTextParam("caseId"),
  );
  const [selectedCase, setSelectedCase] = useState<AssuranceCase>();
  const [documents, setDocuments] = useState<DocumentReference[]>([]);
  const [timeline, setTimeline] = useState<WorkflowEventRecord[]>([]);
  const [metrics, setMetrics] = useState<MetricSummaryRow[]>([]);
  const [workflowModel, setWorkflowModel] =
    useState<TransitionDefinition[]>(TRANSITIONS);
  const [exchangeSummary, setExchangeSummary] =
    useState<IntegrationExchangeSummary>();
  const [exchanges, setExchanges] = useState<IntegrationExchangeRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState(() =>
    readInitialTextParam("search"),
  );
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [stateFilter, setStateFilter] = useState(
    () => readInitialTextParam("state") || "all",
  );
  const [queueMode, setQueueMode] = useState<QueueMode>("actionable");
  const [selectedAction, setSelectedAction] = useState("");
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const [verificationResults, setVerificationResults] = useState<
    Record<string, boolean>
  >({});
  const [draftForm, setDraftForm] = useState<DraftFormState>(DEFAULT_DRAFT_FORM);
  const activeWorkspace = getWorkspaceProfile(workspaceKey);
  const [documentForm, setDocumentForm] = useState<DocumentFormState>(
    buildDefaultDocumentForm(activeWorkspace.actor),
  );
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [justification, setJustification] = useState(
    "Workflow action executed by the authorized role.",
  );
  const [feedback, setFeedback] = useState<FeedbackState>({
    tone: "neutral",
    text: "Select a role and open a case to continue.",
  });
  const [isCreateFormOpen, setIsCreateFormOpen] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [backendReady, setBackendReady] = useState(true);

  useEffect(() => {
    void refreshOverview();
  }, []);

  useEffect(() => {
    if (!selectedCaseId) {
      startTransition(() => {
        setSelectedCase(undefined);
        setDocuments([]);
        setTimeline([]);
        setMetrics([]);
        setSelectedDocumentIds([]);
      });
      return;
    }

    void loadCaseDetails(selectedCaseId);
  }, [selectedCaseId]);

  useEffect(() => {
    setDocumentForm(buildDefaultDocumentForm(activeWorkspace.actor));
    setSelectedDocumentIds([]);
    setVerificationResults({});
    setQueueMode("actionable");
    setActiveView(getDefaultView(workspaceKey));
    setIsCreateFormOpen(false);
  }, [workspaceKey, activeWorkspace.actor]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    params.set("workspace", workspaceKey);
    params.set("view", activeView);
    if (selectedCaseId) {
      params.set("caseId", selectedCaseId);
    } else {
      params.delete("caseId");
    }
    if (stateFilter && stateFilter !== "all") {
      params.set("state", stateFilter);
    } else {
      params.delete("state");
    }
    if (searchQuery.trim().length > 0) {
      params.set("search", searchQuery.trim());
    } else {
      params.delete("search");
    }

    const nextQuery = params.toString();
    const nextUrl =
      nextQuery.length > 0 ? `?${nextQuery}` : window.location.pathname;
    window.history.replaceState({}, "", nextUrl);
  }, [workspaceKey, activeView, selectedCaseId, stateFilter, searchQuery]);

  useEffect(() => {
    const availableTransitions = getAvailableTransitions(
      workflowModel,
      selectedCase,
      activeWorkspace.actor,
    );
    if (availableTransitions.length === 0) {
      setSelectedAction("");
      return;
    }

    if (
      !availableTransitions.some(
        (transition) => transition.action === selectedAction,
      )
    ) {
      setSelectedAction(availableTransitions[0].action);
    }
  }, [workflowModel, selectedCase, selectedAction, activeWorkspace.actor]);

  async function refreshOverview(preferredCaseId?: string): Promise<void> {
    try {
      const [caseRecords, workflow, integrationSummary, exchangeLog] =
        await Promise.all([
          getJson<AssuranceCase[]>("/cases"),
          getJson<TransitionDefinition[]>("/cases/workflow/model"),
          getJson<IntegrationExchangeSummary>("/simulator/exchanges/summary"),
          getJson<IntegrationExchangeRecord[]>("/simulator/exchanges"),
        ]);

      startTransition(() => {
        setCases(caseRecords);
        setWorkflowModel(workflow);
        setExchangeSummary(integrationSummary);
        setExchanges(
          [...exchangeLog]
            .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
            .slice(0, 8),
        );
        const caseStillExists =
          selectedCaseId &&
          caseRecords.some((caseRecord) => caseRecord.caseId === selectedCaseId);
        const nextSelection =
          preferredCaseId ??
          (caseStillExists ? selectedCaseId : caseRecords[0]?.caseId ?? "");
        setSelectedCaseId(nextSelection);
        setBackendReady(true);
      });
    } catch (error) {
      handleError(error, "Unable to load the case queue.");
    }
  }

  async function loadCaseDetails(caseId: string): Promise<void> {
    try {
      const [caseRecord, caseDocuments, auditTimeline, metricSummary] =
        await Promise.all([
          getJson<AssuranceCase>(`/cases/${caseId}`),
          getJson<DocumentReference[]>(`/documents/case/${caseId}`),
          getJson<WorkflowEventRecord[]>(`/cases/${caseId}/audit-timeline`),
          getJson<MetricSummaryRow[]>(
            `/metrics/summary?caseId=${encodeURIComponent(caseId)}`,
          ),
        ]);

      startTransition(() => {
        setSelectedCase(caseRecord);
        setDocuments(
          [...caseDocuments].sort((left, right) => {
            if (left.documentType === right.documentType) {
              return right.version - left.version;
            }

            return left.documentType.localeCompare(right.documentType);
          }),
        );
        setTimeline(auditTimeline);
        setMetrics(metricSummary);
        setBackendReady(true);
      });
    } catch (error) {
      handleError(error, "Unable to load the selected case.");
    }
  }

  async function refreshAll(preferredCaseId?: string): Promise<void> {
    await refreshOverview(preferredCaseId);
    const targetCaseId = preferredCaseId || selectedCaseId;
    if (targetCaseId) {
      await loadCaseDetails(targetCaseId);
    }
  }

  function handleError(error: unknown, context: string): void {
    const message =
      error instanceof ApiError
        ? `${context} ${error.detail ?? error.message}`
        : error instanceof Error
          ? `${context} ${error.message}`
          : context;

    setFeedback({
      tone: "error",
      text: message,
    });
    setBackendReady(false);
  }

  async function handleCreateDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isCreateCaseAllowed(activeWorkspace.actor)) {
      setFeedback({
        tone: "error",
        text: "The selected workspace cannot create draft cases.",
      });
      return;
    }

    setIsBusy(true);
    try {
      const response = await postJson<CaseCommandResponse>("/cases", {
        actor: activeWorkspace.actor,
        payload: {
          applicantOrgId: draftForm.applicantOrgId,
          applicantOrgName: draftForm.applicantOrgName,
          itemCategory: draftForm.itemCategory,
          itemDescription: draftForm.itemDescription,
          quantity: Number(draftForm.quantity),
          originJurisdiction: draftForm.originJurisdiction,
          destinationJurisdiction: draftForm.destinationJurisdiction,
          intendedUse: draftForm.intendedUse,
          legalTreatyBasis: draftForm.legalTreatyBasis || undefined,
          priority: draftForm.priority,
          remarksSummary: draftForm.remarksSummary,
          visibilityScope: parseScope(draftForm.visibilityScopeText),
        },
      });

      await refreshAll(response.caseRecord.caseId);
      setFeedback({
        tone: "success",
        text: `Draft ${response.caseRecord.caseNumber} created on the live workflow path.`,
      });
      setIsCreateFormOpen(false);
      setActiveView("workflow");
    } catch (error) {
      handleError(error, "Unable to create the draft case.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleUploadDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCaseId) {
      setFeedback({
        tone: "error",
        text: "Select a case before attaching documents.",
      });
      return;
    }
    if (!isUploadAllowed(activeWorkspace.actor)) {
      setFeedback({
        tone: "error",
        text: "The selected workspace is read-only and cannot upload documents.",
      });
      return;
    }

    setIsBusy(true);
    try {
      const contentBase64 = documentFile
        ? await readFileAsBase64(documentFile)
        : encodeTextContent(documentForm.contentText);

      const fileName = documentFile
        ? documentFile.name
        : `${documentForm.documentType}.txt`;

      const mimeType = documentFile?.type || "text/plain";

      const response = await postJson<UploadDocumentResponse>("/documents", {
        actor: activeWorkspace.actor,
        caseId: selectedCaseId,
        documentType: documentForm.documentType,
        fileName,
        mimeType,
        classification: documentForm.classification,
        accessScope: parseScope(documentForm.accessScopeText),
        contentBase64,
        supersedesDocumentId: documentForm.supersedesDocumentId || undefined,
      });

      setDocumentForm(buildDefaultDocumentForm(activeWorkspace.actor));
      setDocumentFile(null);
      await refreshAll(selectedCaseId);
      setFeedback({
        tone: "success",
        text: `Document ${response.documentReference.fileName} anchored successfully.`,
      });
    } catch (error) {
      handleError(error, "Unable to upload and anchor the document.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleExecuteAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCaseId || !selectedAction) {
      setFeedback({
        tone: "error",
        text: "Select a case and workflow action before submitting.",
      });
      return;
    }

    setIsBusy(true);
    try {
      const response =
        selectedAction === "submit_case"
          ? await postJson<CaseCommandResponse>(
              `/cases/${selectedCaseId}/submit`,
              {
                actor: activeWorkspace.actor,
                justification,
                relatedDocumentIds: selectedDocumentIds,
              },
            )
          : await postJson<CaseCommandResponse>(`/cases/${selectedCaseId}/actions`, {
              actor: activeWorkspace.actor,
              action: selectedAction,
              justification,
              relatedDocumentIds: selectedDocumentIds,
            });

      await refreshAll(response.caseRecord.caseId);
      setSelectedDocumentIds([]);
      setFeedback({
        tone: "success",
        text: `Action ${transitionLabel(response.event.actionType)} completed for ${response.caseRecord.caseNumber}.`,
      });
      setActiveView("audit");
    } catch (error) {
      handleError(error, "Unable to execute the selected workflow action.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleVerifyDocument(documentId: string) {
    try {
      const response = await getJson<VerifyDocumentResponse>(
        `/documents/${documentId}/verify`,
      );
      setVerificationResults((current) => ({
        ...current,
        [documentId]: response.verified,
      }));
      setFeedback({
        tone: response.verified ? "success" : "error",
        text: response.verified
          ? `Document ${documentId} matches the anchored hash.`
          : `Document ${documentId} failed integrity verification.`,
      });
    } catch (error) {
      handleError(error, "Unable to verify the selected document.");
    }
  }

  const queueEntries = summarizeVisibleCases(
    cases,
    deferredSearchQuery,
    stateFilter,
  ).map((caseRecord) => ({
    caseRecord,
    roleActions: getAvailableTransitions(
      workflowModel,
      caseRecord,
      activeWorkspace.actor,
    ),
  }));

  const actionableEntries = queueEntries.filter(
    (entry) => entry.roleActions.length > 0,
  );
  const displayedEntries =
    queueMode === "actionable" ? actionableEntries : queueEntries;

  const availableTransitions = getAvailableTransitions(
    workflowModel,
    selectedCase,
    activeWorkspace.actor,
  );
  const selectedTransition = availableTransitions.find(
    (transition) => transition.action === selectedAction,
  );
  const activeDocumentTypes = documents
    .filter((documentReference) => documentReference.isActive)
    .map((documentReference) => documentReference.documentType);
  const missingRequiredDocumentTypes =
    selectedTransition?.requiredDocumentTypes.filter(
      (documentType) => !activeDocumentTypes.includes(documentType),
    ) ?? [];

  const canCreateCase = isCreateCaseAllowed(activeWorkspace.actor);
  const canUploadDocuments =
    Boolean(selectedCaseId) && isUploadAllowed(activeWorkspace.actor);
  const isReadOnlyWorkspace =
    activeWorkspace.actor.organizationType === "auditor_body";
  const activeDocumentCount = documents.filter(
    (documentReference) => documentReference.isActive,
  ).length;
  const relevantExchanges = selectedCaseId
    ? exchanges.filter((exchange) => exchange.caseId === selectedCaseId)
    : exchanges;
  const successfulExchanges = relevantExchanges.filter(
    (exchange) => exchange.status !== "rejected",
  ).length;
  const transitionLatencyMetric = metrics.find(
    (metric) => metric.metricId === "transition_latency_ms",
  );
  const lastExchange = relevantExchanges[0];

  return (
    <main className="pro-shell app-shell">
      <header className="shell-brand shell-brand-banner">
        <div className="shell-brand-main">
          <p className="eyebrow">Cross-Border Nuclear Regulatory Workflow Platform</p>
          <h1>Cross-Border Authorization Console</h1>
        </div>
        <div className="shell-brand-aside">
          <span className="meta-label">Operational focus</span>
          <p className="muted">{activeWorkspace.description}</p>
        </div>
      </header>

      <aside className="shell-sidebar">
        <section className="panel sidebar-hub">
          <div className="sidebar-hub-section">
            <p className="panel-kicker">Role</p>
            <div className="workspace-selector compact">
              {WORKSPACE_PROFILES.map((profile) => (
                <button
                  className={`workspace-chip ${
                    profile.key === workspaceKey ? "active" : ""
                  }`}
                  key={profile.key}
                  onClick={() => {
                    setWorkspaceKey(profile.key);
                    setActiveView(getDefaultView(profile.key));
                  }}
                  type="button"
                >
                  <strong>{profile.label}</strong>
                </button>
              ))}
            </div>
          </div>

          <div className="sidebar-hub-divider" />

          <div className="sidebar-hub-section">
            <p className="panel-kicker">Screens</p>
            <AppNavigation
              activeView={activeView}
              setActiveView={setActiveView}
              workspaceKey={workspaceKey}
            />
          </div>

          <div className="sidebar-hub-divider" />

          <div className="sidebar-hub-section queue-section">
            <CaseQueuePanel
              displayedEntries={displayedEntries}
              embedded
              queueMode={queueMode}
              searchQuery={searchQuery}
              selectedCaseId={selectedCaseId}
              setQueueMode={setQueueMode}
              setSearchQuery={setSearchQuery}
              setSelectedCaseId={setSelectedCaseId}
              setStateFilter={setStateFilter}
              stateFilter={stateFilter}
            />
          </div>
        </section>

      </aside>

      <section className="shell-main">
        <header className="content-header">
          <div>
            <p className="eyebrow">{activeWorkspace.label}</p>
            <h2>{humanize(activeView)} workspace</h2>
            <p className="muted">
              Select a case from the queue, inspect its stage, and act through the
              role-specific workspace.
            </p>
          </div>
          <div className={`status-banner status-${feedback.tone}`}>
            <strong>
              {backendReady ? "Backend connected" : "Backend attention needed"}
            </strong>
            <span>{feedback.text}</span>
          </div>
        </header>

        <section className="summary-grid compact">
          <SummaryCard
            label="Visible cases"
            value={formatInteger(queueEntries.length)}
            detail="Cases visible to this role"
            accent="slate"
          />
          <SummaryCard
            label="Needs action"
            value={formatInteger(actionableEntries.length)}
            detail="Cases this role can act on now"
            accent="rust"
          />
          <SummaryCard
            label="Selected case"
            value={selectedCase ? selectedCase.caseNumber : "None"}
            detail={
              selectedCase
                ? humanize(selectedCase.currentState)
                : "Choose a case from the queue"
            }
            accent="teal"
          />
          <SummaryCard
            label="External exchanges"
            value={formatInteger(exchangeSummary?.totalExchanges ?? 0)}
            detail="Recorded coordination activity in this session"
            accent="gold"
          />
        </section>

        <CaseWorkspaceHeader
          activeDocumentCount={activeDocumentCount}
          availableTransitions={availableTransitions}
          canCreateCase={canCreateCase}
          isCreateFormOpen={isCreateFormOpen}
          selectedCase={selectedCase}
          setIsCreateFormOpen={setIsCreateFormOpen}
        />

        <WorkflowProgressRail selectedCase={selectedCase} />

        {activeView === "overview" ? (
          <section className="overview-grid">
            <SelectedCaseSnapshot
              availableTransitions={availableTransitions}
              selectedCase={selectedCase}
            />

            {canCreateCase && isCreateFormOpen ? (
              <section className="panel">
                <div className="panel-header">
                  <div>
                    <p className="panel-kicker">Create</p>
                    <h2>New application</h2>
                  </div>
                </div>
                <form className="form-stack" onSubmit={handleCreateDraft}>
                  <div className="field-grid two-up">
                    <label>
                      Applicant organization
                      <input
                        value={draftForm.applicantOrgName}
                        onChange={(event) =>
                          setDraftForm((current) => ({
                            ...current,
                            applicantOrgName: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label>
                      Item category
                      <input
                        value={draftForm.itemCategory}
                        onChange={(event) =>
                          setDraftForm((current) => ({
                            ...current,
                            itemCategory: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label className="field-span">
                      Item description
                      <textarea
                        rows={3}
                        value={draftForm.itemDescription}
                        onChange={(event) =>
                          setDraftForm((current) => ({
                            ...current,
                            itemDescription: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label>
                      Quantity
                      <input
                        min="1"
                        type="number"
                        value={draftForm.quantity}
                        onChange={(event) =>
                          setDraftForm((current) => ({
                            ...current,
                            quantity: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label>
                      Priority
                      <select
                        value={draftForm.priority}
                        onChange={(event) =>
                          setDraftForm((current) => ({
                            ...current,
                            priority: event.target.value as AssuranceCase["priority"],
                          }))
                        }
                      >
                        <option value="routine">Routine</option>
                        <option value="urgent">Urgent</option>
                        <option value="elevated">Elevated</option>
                      </select>
                    </label>
                    <label>
                      Origin
                      <input
                        value={draftForm.originJurisdiction}
                        onChange={(event) =>
                          setDraftForm((current) => ({
                            ...current,
                            originJurisdiction: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label>
                      Destination
                      <input
                        value={draftForm.destinationJurisdiction}
                        onChange={(event) =>
                          setDraftForm((current) => ({
                            ...current,
                            destinationJurisdiction: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label className="field-span">
                      Intended use
                      <input
                        value={draftForm.intendedUse}
                        onChange={(event) =>
                          setDraftForm((current) => ({
                            ...current,
                            intendedUse: event.target.value,
                          }))
                        }
                      />
                    </label>
                  </div>
                  <button className="primary-button calm-button" disabled={isBusy} type="submit">
                    Create draft
                  </button>
                </form>
              </section>
            ) : (
              <OperationalSummaryPanel
                availableTransitions={availableTransitions}
                documents={documents}
                missingRequiredDocumentTypes={missingRequiredDocumentTypes}
                selectedCase={selectedCase}
                timeline={timeline}
              />
            )}
          </section>
        ) : null}

        {activeView === "workflow" ? (
          <section className="workflow-grid workspace-grid-single">
            <WorkflowActionPanel
              availableTransitions={availableTransitions}
              documents={documents}
              handleExecuteAction={handleExecuteAction}
              isBusy={isBusy}
              justification={justification}
              missingRequiredDocumentTypes={missingRequiredDocumentTypes}
              selectedAction={selectedAction}
              selectedCase={selectedCase}
              selectedDocumentIds={selectedDocumentIds}
              selectedTransition={selectedTransition}
              setJustification={setJustification}
              setSelectedAction={setSelectedAction}
              setSelectedDocumentIds={setSelectedDocumentIds}
            />
          </section>
        ) : null}

        {activeView === "documents" ? (
          <section className="workflow-grid">
            <SelectedCaseSnapshot
              availableTransitions={availableTransitions}
              selectedCase={selectedCase}
            />
            <section className="panel">
              <div className="panel-header">
                <div>
                  <p className="panel-kicker">Documents</p>
                  <h2>Upload and verification</h2>
                </div>
              </div>
              {!selectedCase ? (
                <p className="muted">
                  Choose a case first so documents can be attached to the right
                  dossier.
                </p>
              ) : !canUploadDocuments && !isReadOnlyWorkspace ? (
                <p className="muted">
                  This workspace cannot upload documents for the selected case.
                </p>
              ) : (
                <>
                  {canUploadDocuments ? (
                    <form className="form-stack" onSubmit={handleUploadDocument}>
                      <div className="field-grid two-up">
                        <label>
                          Document type
                          <select
                            value={documentForm.documentType}
                            onChange={(event) =>
                              setDocumentForm((current) => ({
                                ...current,
                                documentType: event.target.value as DocumentType,
                              }))
                            }
                          >
                            {DOCUMENT_TYPES.map((documentType) => (
                              <option key={documentType} value={documentType}>
                                {humanize(documentType)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Classification
                          <select
                            value={documentForm.classification}
                            onChange={(event) =>
                              setDocumentForm((current) => ({
                                ...current,
                                classification:
                                  event.target
                                    .value as DocumentReference["classification"],
                              }))
                            }
                          >
                            <option value="restricted">Restricted</option>
                            <option value="confidential">Confidential</option>
                            <option value="secret">Secret</option>
                          </select>
                        </label>
                        <label className="field-span">
                          Access scope
                          <input
                            value={documentForm.accessScopeText}
                            onChange={(event) =>
                              setDocumentForm((current) => ({
                                ...current,
                                accessScopeText: event.target.value,
                              }))
                            }
                          />
                        </label>
                        <label className="field-span">
                          Supersedes document ID
                          <input
                            placeholder="Optional for version replacement"
                            value={documentForm.supersedesDocumentId}
                            onChange={(event) =>
                              setDocumentForm((current) => ({
                                ...current,
                                supersedesDocumentId: event.target.value,
                              }))
                            }
                          />
                        </label>
                        <label className="field-span">
                          Upload file
                          <input
                            onChange={(event) =>
                              setDocumentFile(event.target.files?.[0] ?? null)
                            }
                            type="file"
                          />
                        </label>
                        <label className="field-span">
                          Fallback note content
                          <textarea
                            rows={4}
                            value={documentForm.contentText}
                            onChange={(event) =>
                              setDocumentForm((current) => ({
                                ...current,
                                contentText: event.target.value,
                              }))
                            }
                          />
                        </label>
                      </div>
                      <button className="primary-button" disabled={isBusy} type="submit">
                        Anchor document
                      </button>
                    </form>
                  ) : null}

                  <div className="table-shell">
                    <table>
                      <thead>
                        <tr>
                          <th>Type</th>
                          <th>Version</th>
                          <th>File</th>
                          <th>Classification</th>
                          <th>Status</th>
                          <th>Integrity</th>
                        </tr>
                      </thead>
                      <tbody>
                        {documents.length === 0 ? (
                          <tr>
                            <td colSpan={6}>No documents anchored for this case yet.</td>
                          </tr>
                        ) : (
                          documents.map((documentReference) => (
                            <tr key={documentReference.documentId}>
                              <td>{humanize(documentReference.documentType)}</td>
                              <td>v{documentReference.version}</td>
                              <td>{documentReference.fileName}</td>
                              <td>{humanize(documentReference.classification)}</td>
                              <td>
                                {documentReference.isActive ? "Active" : "Superseded"}
                              </td>
                              <td>
                                <div className="integrity-cell">
                                  <button
                                    className="table-button"
                                    onClick={() => {
                                      void handleVerifyDocument(
                                        documentReference.documentId,
                                      );
                                    }}
                                    type="button"
                                  >
                                    Verify
                                  </button>
                                  <span>
                                    {verificationResults[documentReference.documentId] ===
                                    true
                                      ? "Verified"
                                      : verificationResults[
                                            documentReference.documentId
                                          ] === false
                                        ? "Mismatch"
                                        : "Not checked"}
                                  </span>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </section>
          </section>
        ) : null}

        {activeView === "audit" ? (
          <section className="workflow-grid audit-grid">
            <section className="panel">
              <div className="panel-header">
                <div>
                  <p className="panel-kicker">Timeline</p>
                  <h2>Case reconstruction</h2>
                </div>
              </div>
              {timeline.length === 0 ? (
                <p className="muted">
                  Timeline entries appear after the case begins moving through the
                  workflow.
                </p>
              ) : (
                <div className="timeline-list">
                  {timeline.map((eventRecord) => (
                    <article className="timeline-item" key={eventRecord.actionId}>
                      <div className="timeline-marker" />
                      <div className="timeline-content">
                        <div className="timeline-top">
                          <strong>{transitionLabel(eventRecord.actionType)}</strong>
                          <span>{formatDateTime(eventRecord.timestamp)}</span>
                        </div>
                        <p>
                          {humanize(eventRecord.actorRole)} from {eventRecord.actorOrg}
                        </p>
                        <p className="muted">
                          {eventRecord.previousState
                            ? `${humanize(eventRecord.previousState)} to ${humanize(
                                eventRecord.newState,
                              )}`
                            : `Entered ${humanize(eventRecord.newState)}`}
                        </p>
                        <p className="timeline-justification">
                          {eventRecord.justification}
                        </p>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="panel">
              <div className="panel-header">
                <div>
                  <p className="panel-kicker">Evidence</p>
                  <h2>Metrics and exchanges</h2>
                </div>
              </div>
              <div className="evidence-kpi-strip">
                <article className="evidence-kpi-card">
                  <span className="meta-label">Total exchanges</span>
                  <strong>{formatInteger(relevantExchanges.length)}</strong>
                  <p className="muted">Recorded for the selected case context.</p>
                </article>
                <article className="evidence-kpi-card">
                  <span className="meta-label">Successful exchanges</span>
                  <strong>{formatInteger(successfulExchanges)}</strong>
                  <p className="muted">Accepted or applied counterpart events.</p>
                </article>
                <article className="evidence-kpi-card">
                  <span className="meta-label">Avg workflow latency</span>
                  <strong>
                    {transitionLatencyMetric
                      ? formatMetricValue(transitionLatencyMetric.average)
                      : "Not recorded"}
                  </strong>
                  <p className="muted">Mean transition processing time.</p>
                </article>
                <article className="evidence-kpi-card">
                  <span className="meta-label">Last counterpart event</span>
                  <strong>
                    {lastExchange ? humanize(lastExchange.messageType) : "No exchange yet"}
                  </strong>
                  <p className="muted">
                    {lastExchange
                      ? formatDateTime(lastExchange.timestamp)
                      : "No counterpart activity recorded for this case yet."}
                  </p>
                </article>
              </div>
              <div className="metric-stack">
                {metrics.length === 0 ? (
                  <p className="muted">
                    Metrics appear after workflow actions or verification steps.
                  </p>
                ) : (
                  metrics.map((metric) => {
                    const definition = getMetricDefinition(metric.metricId);
                    const primary = formatMetricPrimary(metric);
                    const secondary = formatMetricSecondary(metric);
                    const isCountMetric = definition?.unit === "count";

                    return (
                      <article
                        className={`metric-card metric-card-refined metric-category-${
                          definition?.category ?? "feasibility"
                        }`}
                        key={metric.metricId}
                        title={getMetricDescription(metric.metricId)}
                      >
                        <div className="metric-top refined">
                          <strong>{formatMetricTitle(metric.metricId)}</strong>
                          <div className="metric-badge-row">
                            <span className="metric-category-badge">
                              {formatMetricCategory(metric.metricId)}
                            </span>
                            <span className="metric-observation-badge">
                              {formatInteger(metric.count)} obs
                            </span>
                          </div>
                        </div>
                        <div className="metric-primary">
                          <span className="metric-primary-label">{primary.label}</span>
                          <strong>{primary.value}</strong>
                        </div>
                        <div className="metric-secondary-grid">
                          <div>
                            <span className="metric-secondary-label">
                              {secondary.label}
                            </span>
                            <strong>{secondary.value}</strong>
                          </div>
                          <div>
                            <span className="metric-secondary-label">
                              {isCountMetric ? "Peak" : "Min"}
                            </span>
                            <strong>
                              {isCountMetric
                                ? formatInteger(metric.max)
                                : formatMetricValue(metric.min)}
                            </strong>
                          </div>
                        </div>
                      </article>
                    );
                  })
                )}
              </div>

              <div className="subsection evidence-activity-section">
                <div className="subsection-heading">
                  <h3>Recent counterpart activity</h3>
                  <span className="metric-observation-badge">
                    {formatInteger(relevantExchanges.length)} events
                  </span>
                </div>
                <div className="activity-list">
                  {relevantExchanges.length === 0 ? (
                    <div className="activity-empty-state">
                      <strong>No counterpart activity recorded</strong>
                      <p className="muted">
                        This case has not yet produced a simulator exchange in the
                        current evaluation session. When domestic or foreign messages
                        are relayed, they will appear here with direction, status, and
                        timestamp.
                      </p>
                    </div>
                  ) : (
                    relevantExchanges.map((exchange) => (
                      <article className="activity-row" key={exchange.exchangeId}>
                        <div className="activity-row-main">
                          <div className="activity-row-top">
                            <strong>{humanize(exchange.messageType)}</strong>
                            <span className="activity-time">
                              {formatDateTime(exchange.timestamp)}
                            </span>
                          </div>
                          <div className="activity-badges">
                            <span
                              className={`activity-badge direction-${exchange.direction.toLowerCase()}`}
                            >
                              {humanize(exchange.direction)}
                            </span>
                            <span
                              className={`activity-badge status-${exchange.status.toLowerCase()}`}
                            >
                              {humanize(exchange.status)}
                            </span>
                            <span className="activity-badge neutral">
                              {humanize(exchange.simulator)}
                            </span>
                          </div>
                          <p className="activity-case-ref">
                            Case{" "}
                            <span title={exchange.caseId}>
                              {truncateCaseReference(exchange.caseId)}
                            </span>
                          </p>
                        </div>
                      </article>
                    ))
                  )}
                </div>
              </div>
            </section>
          </section>
        ) : null}
      </section>
    </main>
  );
}
