import type {
  AssuranceCase,
  DocumentReference,
  WorkflowEventRecord,
} from "@prototype/shared";
import type {
  IntegrationExchangeRecord,
  IntegrationExchangeSummary,
  MetricSummaryRow,
} from "./types.js";
import {
  StateBadge,
  SummaryCard,
  formatDateTime,
  formatInteger,
  formatMetricValue,
  getMetricDescription,
  humanize,
  transitionLabel,
  type DetailTab,
} from "./frontend-helpers.js";

interface CaseDetailViewProps {
  selectedCase: AssuranceCase;
  detailTab: DetailTab;
  setDetailTab: (tab: DetailTab) => void;
  documents: DocumentReference[];
  verificationResults: Record<string, boolean>;
  onVerifyDocument: (documentId: string) => void;
  timeline: WorkflowEventRecord[];
  metrics: MetricSummaryRow[];
  exchangeSummary?: IntegrationExchangeSummary;
  exchanges: IntegrationExchangeRecord[];
}

export function CaseDetailView(props: CaseDetailViewProps) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="panel-kicker">Case view</p>
          <h2>Dossier and evidence</h2>
        </div>
      </div>

      <div className="tab-row">
        <button
          className={props.detailTab === "overview" ? "active" : ""}
          onClick={() => props.setDetailTab("overview")}
          type="button"
        >
          Overview
        </button>
        <button
          className={props.detailTab === "documents" ? "active" : ""}
          onClick={() => props.setDetailTab("documents")}
          type="button"
        >
          Documents
        </button>
        <button
          className={props.detailTab === "timeline" ? "active" : ""}
          onClick={() => props.setDetailTab("timeline")}
          type="button"
        >
          Timeline
        </button>
        <button
          className={props.detailTab === "evidence" ? "active" : ""}
          onClick={() => props.setDetailTab("evidence")}
          type="button"
        >
          Evidence
        </button>
      </div>

      {props.detailTab === "overview" ? (
        <div className="detail-grid">
          <article className="detail-card">
            <div className="mini-header">
              <h3>Case profile</h3>
              <StateBadge state={props.selectedCase.currentState} />
            </div>
            <dl>
              <div>
                <dt>Applicant</dt>
                <dd>{props.selectedCase.applicantOrgName}</dd>
              </div>
              <div>
                <dt>Item category</dt>
                <dd>{humanize(props.selectedCase.itemCategory)}</dd>
              </div>
              <div>
                <dt>Route</dt>
                <dd>
                  {props.selectedCase.originJurisdiction} to{" "}
                  {props.selectedCase.destinationJurisdiction}
                </dd>
              </div>
              <div>
                <dt>Intended use</dt>
                <dd>{props.selectedCase.intendedUse}</dd>
              </div>
              <div>
                <dt>Priority</dt>
                <dd>{humanize(props.selectedCase.priority)}</dd>
              </div>
              <div>
                <dt>Last updated</dt>
                <dd>{formatDateTime(props.selectedCase.lastUpdatedAt)}</dd>
              </div>
            </dl>
          </article>

          <article className="detail-card">
            <h3>Review lanes</h3>
            <dl>
              <div>
                <dt>Domestic review</dt>
                <dd>{humanize(props.selectedCase.domesticRegulatorStatus)}</dd>
              </div>
              <div>
                <dt>Coordination</dt>
                <dd>{humanize(props.selectedCase.coordinationStatus)}</dd>
              </div>
              <div>
                <dt>Foreign review</dt>
                <dd>{humanize(props.selectedCase.foreignRegulatorStatus)}</dd>
              </div>
              <div>
                <dt>Issuance</dt>
                <dd>{humanize(props.selectedCase.issuanceStatus)}</dd>
              </div>
              <div>
                <dt>Amendment mode</dt>
                <dd>{humanize(props.selectedCase.pendingAmendmentReviewMode)}</dd>
              </div>
              <div>
                <dt>Remarks</dt>
                <dd>{props.selectedCase.remarksSummary || "None recorded"}</dd>
              </div>
            </dl>
          </article>
        </div>
      ) : null}

      {props.detailTab === "documents" ? (
        props.documents.length === 0 ? (
          <p className="muted">No documents are anchored for this case yet.</p>
        ) : (
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
                {props.documents.map((documentReference) => (
                  <tr key={documentReference.documentId}>
                    <td>{humanize(documentReference.documentType)}</td>
                    <td>v{documentReference.version}</td>
                    <td>{documentReference.fileName}</td>
                    <td>{humanize(documentReference.classification)}</td>
                    <td>{documentReference.isActive ? "Active" : "Superseded"}</td>
                    <td>
                      <div className="integrity-cell">
                        <button
                          className="table-button"
                          onClick={() => props.onVerifyDocument(documentReference.documentId)}
                          type="button"
                        >
                          Verify
                        </button>
                        <span>
                          {props.verificationResults[documentReference.documentId] ===
                          true
                            ? "Verified"
                            : props.verificationResults[documentReference.documentId] ===
                                false
                              ? "Mismatch"
                              : "Not checked"}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : null}

      {props.detailTab === "timeline" ? (
        <div className="timeline-list">
          {props.timeline.length === 0 ? (
            <p className="muted">
              Timeline entries appear after the case starts moving through the
              workflow.
            </p>
          ) : (
            props.timeline.map((eventRecord) => (
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
            ))
          )}
        </div>
      ) : null}

      {props.detailTab === "evidence" ? (
        <div className="evidence-stack">
          <section className="subsection">
            <h3>Case metrics</h3>
            <div className="metric-stack">
              {props.metrics.length === 0 ? (
                <p className="muted">
                  Metrics appear after workflow actions or verification steps.
                </p>
              ) : (
                props.metrics.map((metric) => (
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
          </section>

          <section className="subsection">
            <h3>Integration evidence</h3>
            <div className="summary-grid compact">
              <SummaryCard
                label="Domestic exchanges"
                value={formatInteger(
                  props.exchangeSummary?.bySimulator?.domestic_emulator ?? 0,
                )}
                detail="Intake and status sync activity"
                accent="gold"
              />
              <SummaryCard
                label="Foreign exchanges"
                value={formatInteger(
                  props.exchangeSummary?.bySimulator?.foreign_simulator ?? 0,
                )}
                detail="Forwarding and decision activity"
                accent="teal"
              />
            </div>
            <div className="exchange-list">
              {props.exchanges.length === 0 ? (
                <p className="muted">
                  No exchange records have been generated in this backend process
                  yet.
                </p>
              ) : (
                props.exchanges.map((exchange) => (
                  <article className="exchange-card" key={exchange.exchangeId}>
                    <div className="exchange-top">
                      <strong>{humanize(exchange.messageType)}</strong>
                      <span>{formatDateTime(exchange.timestamp)}</span>
                    </div>
                    <p>
                      {humanize(exchange.simulator)} / {humanize(exchange.status)}
                    </p>
                    <p className="muted">Case {exchange.caseId}</p>
                  </article>
                ))
              )}
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
