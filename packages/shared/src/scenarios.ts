import { DOCUMENT_BUNDLE_TEMPLATES } from "./documents.js";

export interface SyntheticScenario {
  scenarioId: string;
  label: string;
  expectedTerminalState: string;
  description: string;
  requiredBundles: string[];
  highlights: string[];
}

export const SYNTHETIC_SCENARIOS: SyntheticScenario[] = [
  {
    scenarioId: "normal-approval-fuel-shipment",
    label: "Normal approval path",
    expectedTerminalState: "issued",
    description:
      "Routine transport-sensitive case with domestic endorsement, coordination forwarding, foreign review, and final issuance.",
    requiredBundles: [
      DOCUMENT_BUNDLE_TEMPLATES.submission_core.bundleId,
      DOCUMENT_BUNDLE_TEMPLATES.transport_sensitive_case.bundleId,
      DOCUMENT_BUNDLE_TEMPLATES.foreign_forwarding_packet.bundleId,
      DOCUMENT_BUNDLE_TEMPLATES.issuance_packet.bundleId,
    ],
    highlights: [
      "baseline happy path",
      "transport-license evidence",
      "issuance timing",
    ],
  },
  {
    scenarioId: "more-info-loop",
    label: "More-information loop",
    expectedTerminalState: "issued",
    description:
      "Foreign review requests clarification or additional evidence and the applicant responds through the portal before final decision.",
    requiredBundles: [
      DOCUMENT_BUNDLE_TEMPLATES.submission_core.bundleId,
      "response_loop",
    ],
    highlights: [
      "state resumption via currentSubstate",
      "applicant remains off-ledger",
      "audit trace of repeated review",
    ],
  },
  {
    scenarioId: "rejection-missing-documents",
    label: "Missing-document rejection",
    expectedTerminalState: "rejected",
    description:
      "Case is rejected when required transport or package-design evidence is unavailable or unsatisfactory.",
    requiredBundles: [DOCUMENT_BUNDLE_TEMPLATES.submission_core.bundleId],
    highlights: [
      "negative path",
      "policy enforcement",
      "missing-document instrumentation",
    ],
  },
  {
    scenarioId: "substantive-amendment-post-issuance",
    label: "Substantive amendment path",
    expectedTerminalState: "amended",
    description:
      "Issued assurance is substantively amended due to quantity or destination change with renewed foreign review and full supersession trace.",
    requiredBundles: [
      DOCUMENT_BUNDLE_TEMPLATES.issuance_packet.bundleId,
      DOCUMENT_BUNDLE_TEMPLATES.amendment_packet.bundleId,
    ],
    highlights: [
      "renewed foreign review",
      "document supersession",
      "explicit versioning",
    ],
  },
  {
    scenarioId: "non-substantive-amendment-post-issuance",
    label: "Non-substantive amendment path",
    expectedTerminalState: "amended",
    description:
      "Issued assurance is amended for a clerical or formatting correction without re-entering foreign review.",
    requiredBundles: [
      DOCUMENT_BUNDLE_TEMPLATES.issuance_packet.bundleId,
      DOCUMENT_BUNDLE_TEMPLATES.amendment_packet.bundleId,
    ],
    highlights: [
      "domestic/coordinating concurrence",
      "no foreign re-review",
      "versioned assurance replacement",
    ],
  },
  {
    scenarioId: "revocation",
    label: "Revocation path",
    expectedTerminalState: "revoked",
    description:
      "Previously issued assurance is revoked following new adverse information and revocation notice exchange.",
    requiredBundles: [
      DOCUMENT_BUNDLE_TEMPLATES.issuance_packet.bundleId,
      DOCUMENT_BUNDLE_TEMPLATES.revocation_packet.bundleId,
    ],
    highlights: [
      "terminal governance action",
      "revocation latency",
      "auditor reconstruction",
    ],
  },
  {
    scenarioId: "unauthorized-attempt",
    label: "Unauthorized attempt",
    expectedTerminalState: "blocked",
    description:
      "Applicant or wrong regulator tries to trigger a transition not permitted by the workflow policy.",
    requiredBundles: [],
    highlights: [
      "chaincode denial",
      "backend denial",
      "security metric coverage",
    ],
  },
  {
    scenarioId: "missing-document-path",
    label: "Missing-document validation path",
    expectedTerminalState: "blocked",
    description:
      "Applicant attempts submission without the minimum mandatory submission bundle and the workflow blocks the transition before review begins.",
    requiredBundles: [],
    highlights: [
      "mandatory document enforcement",
      "pre-review validation",
      "blocked submission evidence",
    ],
  },
  {
    scenarioId: "invalid-transition-attempt",
    label: "Invalid transition attempt",
    expectedTerminalState: "blocked",
    description:
      "An otherwise legitimate actor attempts a workflow transition from the wrong state and the state machine rejects it.",
    requiredBundles: [],
    highlights: [
      "state-machine enforcement",
      "workflow legality",
      "deterministic rejection",
    ],
  },
];
