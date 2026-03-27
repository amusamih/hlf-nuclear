export const CASE_RECORD_PREFIX = "assurance-case";
export const CASE_EVENT_PREFIX = "case-event";
export const CASE_STATE_INDEX_PREFIX = "case-state";
export const DOCUMENT_RECORD_PREFIX = "document-ref";
export const CASE_DOCUMENT_INDEX_PREFIX = "case-document";

export function caseKey(caseId: string): string {
  return `${CASE_RECORD_PREFIX}:${caseId}`;
}

export function caseEventKey(caseId: string, actionId: string): string {
  return `${CASE_EVENT_PREFIX}:${caseId}:${actionId}`;
}

export function caseStateKey(state: string, caseId: string): string {
  return `${CASE_STATE_INDEX_PREFIX}:${state}:${caseId}`;
}

export function documentKey(documentId: string): string {
  return `${DOCUMENT_RECORD_PREFIX}:${documentId}`;
}

export function caseDocumentKey(caseId: string, documentId: string): string {
  return `${CASE_DOCUMENT_INDEX_PREFIX}:${caseId}:${documentId}`;
}
