# Interoperability Message Mapping

This note summarizes how the executed interoperability validation path mapped domestic-side and
foreign-side exchange messages into the platform's canonical workflow and document model.

## Scope

The mapping below reflects the message contracts defined in
`packages/shared/src/integration.ts` and the executed validation path in
`evaluation/interoperability-runner/run-interoperability-validation.mjs`.

## Message-to-workflow mapping

| Exchange message | Source side | Canonical content | Internal handling | Observed result in executed run |
| --- | --- | --- | --- | --- |
| Domestic intake | Domestic-side inbound API | Applicant identity, case draft, intake document manifest, correlation ID | Validated against the intake contract; converted into draft creation, document uploads, and automatic submission | Case entered `submitted` state |
| Foreign forwarding | Platform outbound API | Case summary, forwarding-package manifest, response due date, correlation ID | Generated from the canonical case record and accessible document references after coordination forwarding | One forwarding payload generated successfully |
| Foreign acknowledgement | Foreign-side inbound API | Case ID, correlation ID, acknowledgement status | Validated against the acknowledgement contract and applied as foreign-review start | Case entered `under_foreign_review` state |
| Foreign decision | Foreign-side inbound API | Case ID, correlation ID, decision, justification | Validated against the decision contract; anchored returned decision evidence when applicable; applied as approval, rejection, or request-for-information transition | Executed run returned approval and case entered `approved` state |
| Domestic status sync | Platform outbound API | External case reference, current state, optional substate and reason code | Generated from the canonical workflow state after issuance | Final `issued` state synchronized to the domestic-side reference |

## Claim boundary

This mapping supports the claim that the prototype accepts structured domestic-side and foreign-side
API messages, validates them against explicit exchange contracts, and standardizes them into the
platform's internal workflow lifecycle. It should not be described as conformance testing against
multiple independently deployed external systems.
