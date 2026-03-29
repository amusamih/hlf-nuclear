# Interoperability Evaluation Companion

This folder reorganizes the recorded interoperability validation output into a paper-facing
companion package. It is intended for manuscript citation when only one representative
interoperability path can be summarized inline.

Scope and interpretation:

- The interoperability evidence in this folder comes from one executed end-to-end exchange run.
- The run covers domestic intake, coordination forwarding, foreign acknowledgement, foreign
  decision, issuance, and domestic status synchronization.
- The authoritative machine-readable source remains `../interoperability-validation.json`.
- The evidence supports a claim of demonstrated interoperability for the executed path, not a claim
  of exhaustive partner-system compatibility or repeated interoperability trials.

Included files:

- `executed-interoperability-summary.md`
  - narrative summary of the executed interoperability validation run
- `executed-interoperability-summary.csv`
  - compact machine-readable summary of the same run
- `representative-interoperability-trace.md`
  - paper-facing trace of the executed cross-system exchange path
- `message-mapping.md`
  - paper-facing mapping from exchanged API messages to canonical workflow handling

Recommended paper usage:

- Use one compact summary table or one representative exchange description in the manuscript.
- Refer readers to this folder for the full repository-side interoperability evidence.
- Keep workflow scenario validation separate and cite
  `../workflow-scenario-validation/` when discussing lifecycle validation.
