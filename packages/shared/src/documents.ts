export const DOCUMENT_TYPES = [
  "assurance_application_form",
  "item_technical_specification",
  "end_use_declaration",
  "transport_authorization",
  "package_design_certificate",
  "safety_analysis_attachment",
  "supporting_correspondence",
  "request_for_information_notice",
  "response_to_information_package",
  "coordination_forwarding_package",
  "foreign_regulator_response",
  "assurance_instrument",
  "amendment_request_package",
  "revocation_notice",
  "inspection_or_audit_evidence",
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export interface DocumentBundleTemplate {
  bundleId: string;
  description: string;
  requiredDocumentTypes: DocumentType[];
}

export const DOCUMENT_BUNDLE_TEMPLATES: Record<string, DocumentBundleTemplate> = {
  submission_core: {
    bundleId: "submission_core",
    description:
      "Baseline submission bundle for cross-border nuclear assurance intake.",
    requiredDocumentTypes: [
      "assurance_application_form",
      "item_technical_specification",
      "end_use_declaration",
      "supporting_correspondence",
    ],
  },
  transport_sensitive_case: {
    bundleId: "transport_sensitive_case",
    description:
      "Adds transport and package-design evidence inspired by the local license and package certificate documents.",
    requiredDocumentTypes: [
      "transport_authorization",
      "package_design_certificate",
    ],
  },
  foreign_forwarding_packet: {
    bundleId: "foreign_forwarding_packet",
    description:
      "Minimum packet needed for cross-border forwarding to the foreign counterpart.",
    requiredDocumentTypes: [
      "coordination_forwarding_package",
      "supporting_correspondence",
    ],
  },
  issuance_packet: {
    bundleId: "issuance_packet",
    description:
      "Documents required to issue the final assurance instrument.",
    requiredDocumentTypes: [
      "foreign_regulator_response",
      "assurance_instrument",
    ],
  },
  response_loop: {
    bundleId: "response_loop",
    description:
      "Request-for-information loop artifacts for additional evidence exchange.",
    requiredDocumentTypes: [
      "request_for_information_notice",
      "response_to_information_package",
    ],
  },
  amendment_packet: {
    bundleId: "amendment_packet",
    description:
      "Amendment request plus updated assurance instrument and any changed supporting evidence.",
    requiredDocumentTypes: [
      "amendment_request_package",
      "assurance_instrument",
    ],
  },
  revocation_packet: {
    bundleId: "revocation_packet",
    description:
      "Revocation notice with supporting evidence and correspondence.",
    requiredDocumentTypes: [
      "revocation_notice",
      "supporting_correspondence",
    ],
  },
};
