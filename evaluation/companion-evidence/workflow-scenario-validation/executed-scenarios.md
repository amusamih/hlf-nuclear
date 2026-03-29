# Executed Workflow Scenario Validation Set

This note summarizes the workflow scenarios that were actually executed and recorded in
`../functional-scenario-suite.json`.

## Positive lifecycle scenarios

The following end-to-end scenarios were executed successfully and reached the expected terminal
state.

| Scenario ID | Paper-facing description | Expected / observed terminal state | Duration (ms) | Audit events | Verified issued document |
| --- | --- | --- | ---: | ---: | ---: |
| `normal-approval-fuel-shipment` | Routine cross-border approval path with domestic review, coordination forwarding, foreign review, and issuance | `issued` / `issued` | 35,448 | 8 | 1 |
| `more-info-loop` | Additional-information path in which the applicant responds and the case resumes to the saved review context before issuance | `issued` / `issued` | 43,386 | 10 | 1 |
| `rejection-missing-documents` | Negative review path in which the case is rejected during review due to missing or unsatisfactory supporting evidence | `rejected` / `rejected` | 14,420 | 4 | 0 |
| `substantive-amendment-post-issuance` | Post-issuance substantive amendment with renewed review and document supersession trace | `amended` / `amended` | 55,771 | 14 | 1 |
| `non-substantive-amendment-post-issuance` | Post-issuance non-substantive amendment finalized without renewed foreign review | `amended` / `amended` | 43,357 | 10 | 1 |
| `revocation` | Post-issuance revocation path ending in terminal revocation state | `revoked` / `revoked` | 39,156 | 9 | 0 |

## Blocked-path policy-enforcement scenarios

The following scenarios were executed to confirm that invalid or unauthorized actions were blocked
while the case remained in the prior valid state.

| Scenario ID | Paper-facing description | Observed result | State after blocked attempt | Duration (ms) |
| --- | --- | --- | --- | ---: |
| `unauthorized-attempt` | Applicant attempts a regulator-only review transition | Blocked with `403` | `submitted` | 10,404 |
| `missing-document-path` | Submission attempted without the minimum mandatory submission bundle | Blocked with `400` | `draft` | 6,208 |
| `invalid-transition-attempt` | Legitimate actor attempts a transition from the wrong state | Blocked with `400` | `under_domestic_review` | 12,423 |

## Claim boundary

The executed suite supports the claim that the implementation was validated against:

- six representative end-to-end lifecycle scenarios
- three blocked-path policy-enforcement scenarios

It does not support a claim of exhaustive transition-permutation coverage or repeated statistical
workflow-scenario trials.
