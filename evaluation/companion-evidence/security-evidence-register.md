# Security Evidence Register

This file links each paper-facing security claim to a concrete evaluation artifact in the repository.

| ID | Security property | Artifact source | Concrete proof | Intended paper claim |
| --- | --- | --- | --- | --- |
| E1 | Access control | `evaluation/paper-assets/raw/defensive-validation.csv` | `unauthorized-attempt` returned `403`; evidence states that `applicant_case_manager` is not allowed to perform `record_domestic_review` | Applicant-side actors cannot trigger regulator-only workflow steps |
| E2 | Transition integrity | `evaluation/paper-assets/raw/defensive-validation.csv` | `invalid-transition-attempt` returned `400`; evidence states no transition is defined for `forward_to_foreign_authority` from `under_domestic_review` | Out-of-order workflow advancement is rejected before commit |
| E3 | Submission completeness | `evaluation/paper-assets/raw/defensive-validation.csv` | `missing-document-path` returned `400`; evidence lists the missing required types | Incomplete case packages cannot enter formal review |
| E4 | Document integrity | `evaluation/paper-assets/raw/interoperability-summary.csv` | `final_issued_document_verification=true` | Off-chain files remain verifiable against anchored references |
| E5 | Audit traceability | `evaluation/paper-assets/raw/interoperability-summary.csv` and `evaluation/paper-assets/raw/backend-end-to-end-metrics.csv` | `audit_event_count=8` and `audit_reconstruction_ms avg=9.45` | Case history can be reconstructed quickly from recorded evidence |

Recommended paper use:

- Keep the manuscript table compact.
- Cite the companion repository for the detailed evidence register.
- Use the IDs `E1`-`E5` in notes or drafting if you want explicit traceability while writing.
