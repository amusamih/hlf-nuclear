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
    <nav className="tab-row app-nav">
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

function CaseQueuePanel(props: {
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
}) {
  return (
    <section className="panel">
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
          <p className="muted">
            No cases match the current queue view. Try widening the filters.
          </p>
        ) : (
          props.displayedEntries.map(({ caseRecord, roleActions }) => (
            <button
              className={`case-card ${
                caseRecord.caseId === props.selectedCaseId ? "selected" : ""
              }`}
              key={caseRecord.caseId}
              onClick={() => props.setSelectedCaseId(caseRecord.caseId)}
              type="button"
            >
              <div className="case-card-top">
                <strong>{caseRecord.caseNumber}</strong>
                <StateBadge state={caseRecord.currentState} />
              </div>
              <p>{caseRecord.itemDescription}</p>
              <div className="case-meta">
                <span>{caseRecord.applicantOrgName}</span>
                <span>
                  {caseRecord.originJurisdiction} to{" "}
                  {caseRecord.destinationJurisdiction}
                </span>
                <span>{humanize(caseRecord.priority)}</span>
                <span>{roleActions.length} available actions</span>
              </div>
            </button>
          ))
        )}
      </div>
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

  return (
    <main className="pro-shell">
      <aside className="shell-sidebar">
        <div className="shell-brand">
          <p className="eyebrow">Cross-Border Nuclear Regulatory Workflow Platform</p>
          <h1>Regulatory Workflow Console</h1>
          <p className="muted">
            Permissioned workflow platform for cross-border regulatory authorization.
          </p>
        </div>

        <section className="sidebar-section">
          <p className="panel-kicker">Role</p>
          <div className="workspace-selector">
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
        </section>

        <section className="sidebar-section">
          <p className="panel-kicker">Screens</p>
          <AppNavigation
            activeView={activeView}
            setActiveView={setActiveView}
            workspaceKey={workspaceKey}
          />
        </section>

      </aside>

      <section className="shell-main">
        <header className="content-header">
          <div>
            <p className="eyebrow">{activeWorkspace.label}</p>
            <h2>{humanize(activeView)}</h2>
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

        {activeView === "overview" ? (
          <section className="overview-grid">
            <SelectedCaseSnapshot
              availableTransitions={availableTransitions}
              selectedCase={selectedCase}
            />

            {canCreateCase ? (
              <section className="panel">
                <div className="panel-header">
                  <div>
                    <p className="panel-kicker">Create</p>
                    <h2>New application</h2>
                  </div>
                </div>
                <details className="drawer">
                  <summary>Create a new draft</summary>
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
                          <option value="critical">Critical</option>
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
                    <button className="primary-button" disabled={isBusy} type="submit">
                      Create draft
                    </button>
                  </form>
                </details>
              </section>
            ) : (
              <section className="panel">
                <div className="panel-header">
                  <div>
                    <p className="panel-kicker">Current record</p>
                    <h2>Selected case summary</h2>
                  </div>
                </div>
                {selectedCase ? (
                  <div className="subtle-list">
                    <div className="subtle-list-item">
                      <strong>Current assurance version</strong>
                      <span>{selectedCase.currentAssuranceVersion}</span>
                    </div>
                    <div className="subtle-list-item">
                      <strong>Audit sequence</strong>
                      <span>{selectedCase.auditSequenceNumber}</span>
                    </div>
                    <div className="subtle-list-item">
                      <strong>Remarks</strong>
                      <span>{selectedCase.remarksSummary || "None recorded"}</span>
                    </div>
                  </div>
                ) : (
                  <p className="muted">Choose a case to inspect its current record.</p>
                )}
              </section>
            )}
          </section>
        ) : null}

        {activeView === "workflow" ? (
          <section className="workflow-grid">
            <CaseQueuePanel
              displayedEntries={displayedEntries}
              queueMode={queueMode}
              searchQuery={searchQuery}
              selectedCaseId={selectedCaseId}
              setQueueMode={setQueueMode}
              setSearchQuery={setSearchQuery}
              setSelectedCaseId={setSelectedCaseId}
              setStateFilter={setStateFilter}
              stateFilter={stateFilter}
            />
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
          <section className="workflow-grid">
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
              <div className="metric-stack">
                {metrics.length === 0 ? (
                  <p className="muted">
                    Metrics appear after workflow actions or verification steps.
                  </p>
                ) : (
                  metrics.map((metric) => (
                    <article className="metric-card" key={metric.metricId}>
                      <div className="metric-top">
                        <strong>{humanize(metric.metricId)}</strong>
                        <span>{formatInteger(metric.count)} observations</span>
                      </div>
                      <p>{getMetricDescription(metric.metricId)}</p>
                      <div className="metric-values">
                        <span>Avg {formatMetricValue(metric.average)}</span>
                        <span>P95 {formatMetricValue(metric.p95)}</span>
                      </div>
                    </article>
                  ))
                )}
              </div>

              <div className="subsection">
                <h3>Recent counterpart activity</h3>
                <div className="exchange-list">
                  {exchanges.length === 0 ? (
                    <p className="muted">
                      No exchange records have been generated in this backend
                      process yet.
                    </p>
                  ) : (
                    exchanges.map((exchange) => (
                      <article className="exchange-card" key={exchange.exchangeId}>
                        <div className="exchange-top">
                          <strong>{humanize(exchange.messageType)}</strong>
                          <span>{formatDateTime(exchange.timestamp)}</span>
                        </div>
                        <p>
                          {humanize(exchange.direction)} / {humanize(exchange.status)}
                        </p>
                        <p className="muted">Case {exchange.caseId}</p>
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
