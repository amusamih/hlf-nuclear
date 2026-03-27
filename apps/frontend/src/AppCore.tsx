import {
  startTransition,
  useDeferredValue,
  useEffect,
  useState,
  type FormEvent,
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
import { CaseDetailView } from "./CaseDetailView.js";
import {
  DEFAULT_DRAFT_FORM,
  buildDefaultDocumentForm,
  formatInteger,
  getAvailableTransitions,
  getPrimaryPanelTitle,
  getWorkspaceSteps,
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
  type DetailTab,
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

export function App() {
  const [workspaceKey, setWorkspaceKey] =
    useState<WorkspaceKey>(readInitialWorkspaceKey);
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
  const [detailTab, setDetailTab] = useState<DetailTab>("overview");
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
    "Workflow action executed through the sandbox operator workspace.",
  );
  const [feedback, setFeedback] = useState<FeedbackState>({
    tone: "neutral",
    text: "Pick a role, open a case, and follow one workflow step at a time.",
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
    setDetailTab(workspaceKey === "auditor" ? "timeline" : "overview");
  }, [workspaceKey, activeWorkspace.actor]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    params.set("workspace", workspaceKey);
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
  }, [workspaceKey, selectedCaseId, stateFilter, searchQuery]);

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
      setDetailTab("documents");
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
      setDetailTab("timeline");
      setFeedback({
        tone: "success",
        text: `Action ${transitionLabel(response.event.actionType)} completed for ${response.caseRecord.caseNumber}.`,
      });
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
    <main className="simple-shell">
      <header className="hero-strip">
        <div className="hero-copy">
          <p className="eyebrow">Sandbox operator console</p>
          <h1>{activeWorkspace.label}</h1>
          <p>
            {activeWorkspace.description} This simplified view is organized
            around one role, one queue, and one case at a time.
          </p>
          <p className="workspace-note">{activeWorkspace.emphasis}</p>
        </div>
        <div className={`status-banner status-${feedback.tone}`}>
          <strong>{backendReady ? "Backend connected" : "Backend attention needed"}</strong>
          <span>{feedback.text}</span>
        </div>
      </header>

      <section className="top-grid">
        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">Workspace</p>
              <h2>Choose a role</h2>
            </div>
          </div>
          <div className="workspace-selector">
            {WORKSPACE_PROFILES.map((profile) => (
              <button
                className={`workspace-chip ${
                  profile.key === workspaceKey ? "active" : ""
                }`}
                key={profile.key}
                onClick={() => setWorkspaceKey(profile.key)}
                type="button"
              >
                <strong>{profile.label}</strong>
                <span>{profile.description}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="summary-grid">
          <SummaryCard
            label="Visible cases"
            value={formatInteger(queueEntries.length)}
            detail="Cases currently visible in this workspace"
            accent="slate"
          />
          <SummaryCard
            label="Needs action"
            value={formatInteger(actionableEntries.length)}
            detail="Cases where this role can act right now"
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
            label="Recent exchanges"
            value={formatInteger(exchangeSummary?.totalExchanges ?? 0)}
            detail="Simulator and emulator activity in this backend session"
            accent="gold"
          />
        </section>
      </section>

      <section className="content-grid">
        <aside className="sidebar-stack">
          <section className="panel">
            <div className="panel-header">
              <div>
                <p className="panel-kicker">Guide</p>
                <h2>How this role works</h2>
              </div>
            </div>
            <ol className="step-list">
              {getWorkspaceSteps(workspaceKey).map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <p className="panel-kicker">Queue</p>
                <h2>Visible cases</h2>
              </div>
            </div>
            <div className="queue-tools">
              <input
                placeholder="Search case, applicant, item, or route"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
              <select
                value={stateFilter}
                onChange={(event) => setStateFilter(event.target.value)}
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
                  className={queueMode === "actionable" ? "active" : ""}
                  onClick={() => setQueueMode("actionable")}
                  type="button"
                >
                  Needs my action
                </button>
                <button
                  className={queueMode === "all" ? "active" : ""}
                  onClick={() => setQueueMode("all")}
                  type="button"
                >
                  All visible
                </button>
              </div>
            </div>
            <div className="queue-list">
              {displayedEntries.length === 0 ? (
                <p className="muted">
                  No cases match the current queue view. Try widening the filters
                  or switch to all visible cases.
                </p>
              ) : (
                displayedEntries.map(({ caseRecord, roleActions }) => (
                  <button
                    className={`case-card ${
                      caseRecord.caseId === selectedCaseId ? "selected" : ""
                    }`}
                    key={caseRecord.caseId}
                    onClick={() => {
                      setSelectedCaseId(caseRecord.caseId);
                      setDetailTab(workspaceKey === "auditor" ? "timeline" : "overview");
                    }}
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
        </aside>

        <section className="main-stack">
          {canCreateCase ? (
            <section className="panel">
              <div className="panel-header">
                <div>
                  <p className="panel-kicker">Create</p>
                  <h2>Start a new draft</h2>
                </div>
              </div>
              <details
                className="drawer"
                open={!selectedCase || selectedCase.currentState === "draft"}
              >
                <summary>Draft intake form</summary>
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
          ) : null}

          <section className="panel">
            <div className="panel-header">
              <div>
                <p className="panel-kicker">Current task</p>
                <h2>{getPrimaryPanelTitle(workspaceKey)}</h2>
              </div>
              {selectedCase ? <StateBadge state={selectedCase.currentState} /> : null}
            </div>

            {!selectedCase ? (
              <p className="muted">
                Select a case from the queue to focus the workspace on one dossier.
              </p>
            ) : (
              <div className="focus-stack">
                <div className="case-focus">
                  <div>
                    <h3>{selectedCase.caseNumber}</h3>
                    <p>{selectedCase.itemDescription}</p>
                  </div>
                  <div className="focus-meta">
                    <span>{selectedCase.applicantOrgName}</span>
                    <span>
                      {selectedCase.originJurisdiction} to{" "}
                      {selectedCase.destinationJurisdiction}
                    </span>
                    <span>Version {selectedCase.currentAssuranceVersion}</span>
                    <span>{selectedCase.activeDocumentIds.length} active docs</span>
                  </div>
                </div>

                {isReadOnlyWorkspace ? (
                  <div className="notice-card">
                    <strong>Read-only workspace</strong>
                    <p>
                      This role cannot change workflow state. Use the tabs below
                      to inspect documents, verify integrity, and reconstruct the
                      audit trail.
                    </p>
                  </div>
                ) : (
                  <div className="workbench-stack">
                    <div className="notice-card">
                      <strong>
                        {availableTransitions.length > 0
                          ? `Next available action: ${transitionLabel(
                              availableTransitions[0].action,
                            )}`
                          : "No workflow action is available right now"}
                      </strong>
                      <p>
                        {availableTransitions.length > 0
                          ? "Use the action form below only after the supporting documents are anchored."
                          : "This case is visible, but this workspace does not currently own the next state change."}
                      </p>
                    </div>

                    {availableTransitions.length > 0 ? (
                      <form className="form-stack" onSubmit={handleExecuteAction}>
                        <label>
                          Workflow action
                          <select
                            value={selectedAction}
                            onChange={(event) => setSelectedAction(event.target.value)}
                          >
                            {availableTransitions.map((transition) => (
                              <option key={transition.action} value={transition.action}>
                                {transitionLabel(transition.action)}
                              </option>
                            ))}
                          </select>
                        </label>

                        {selectedTransition ? (
                          <div className="transition-box">
                            <div className="transition-group">
                              <strong>Required document types</strong>
                              <div className="pill-row">
                                {selectedTransition.requiredDocumentTypes.length > 0 ? (
                                  selectedTransition.requiredDocumentTypes.map(
                                    (documentType) => (
                                      <span className="soft-pill" key={documentType}>
                                        {humanize(documentType)}
                                      </span>
                                    ),
                                  )
                                ) : (
                                  <span className="soft-pill">
                                    No mandatory attachment
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="transition-group">
                              <strong>Status</strong>
                              <p>
                                {missingRequiredDocumentTypes.length > 0
                                  ? `Still missing: ${missingRequiredDocumentTypes
                                      .map((documentType) => humanize(documentType))
                                      .join(", ")}`
                                  : "The active document set satisfies the mandatory types for this action."}
                              </p>
                            </div>
                            <details className="inline-drawer">
                              <summary>Transition notes</summary>
                              <p>
                                <strong>Preconditions:</strong>{" "}
                                {selectedTransition.preconditions.join("; ")}
                              </p>
                              <p>
                                <strong>Integration effects:</strong>{" "}
                                {selectedTransition.integrationEffects.length > 0
                                  ? selectedTransition.integrationEffects.join(", ")
                                  : "None"}
                              </p>
                            </details>
                          </div>
                        ) : null}

                        <div className="document-selector">
                          {documents.length === 0 ? (
                            <p className="muted">
                              No anchored documents yet. Attach documents before
                              executing a workflow action.
                            </p>
                          ) : (
                            documents.map((documentReference) => (
                              <label
                                className="selector-item"
                                key={documentReference.documentId}
                              >
                                <input
                                  checked={selectedDocumentIds.includes(
                                    documentReference.documentId,
                                  )}
                                  onChange={(event) => {
                                    setSelectedDocumentIds((current) => {
                                      if (event.target.checked) {
                                        return current.concat(
                                          documentReference.documentId,
                                        );
                                      }

                                      return current.filter(
                                        (documentId) =>
                                          documentId !== documentReference.documentId,
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
                            value={justification}
                            onChange={(event) => setJustification(event.target.value)}
                          />
                        </label>

                        <button
                          className="primary-button"
                          disabled={isBusy || !selectedAction}
                          type="submit"
                        >
                          Execute action
                        </button>
                      </form>
                    ) : null}

                    {canUploadDocuments ? (
                      <details
                        className="drawer"
                        open={
                          documents.length === 0 ||
                          selectedCase.currentState === "draft" ||
                          missingRequiredDocumentTypes.length > 0
                        }
                      >
                        <summary>Attach or update documents</summary>
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
                          <button className="secondary-button" disabled={isBusy} type="submit">
                            Anchor document
                          </button>
                        </form>
                      </details>
                    ) : null}
                  </div>
                )}
              </div>
            )}
          </section>

          {selectedCase ? (
            <CaseDetailView
              detailTab={detailTab}
              documents={documents}
              exchangeSummary={exchangeSummary}
              exchanges={exchanges}
              metrics={metrics}
              onVerifyDocument={(documentId) => {
                void handleVerifyDocument(documentId);
              }}
              selectedCase={selectedCase}
              setDetailTab={setDetailTab}
              timeline={timeline}
              verificationResults={verificationResults}
            />
          ) : null}
        </section>
      </section>
    </main>
  );
}
