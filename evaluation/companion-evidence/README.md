# Companion Evidence

This folder contains tracked evaluation artifacts that are intended to support paper-facing
claims without forcing the manuscript to reproduce long error payloads or validation traces inline.

Included files:

- `security-evidence-register.md`
  - maps compact paper security claims to concrete repository evidence
- `security-evidence-register.csv`
  - tabular form of the same register
- `defensive-validation.csv`
  - condensed proof for blocked unauthorized, invalid-transition, and incomplete-submission paths
- `functional-scenario-suite.json`
  - detailed scenario-runner output including successful and blocked workflow traces
- `interoperability-validation.json`
  - integration-path trace for the foreign exchange and issued-document verification flow

These artifacts are companion evidence for the paper. They are not required to run the system,
but they are kept in Git so the implementation repository retains the proof trail behind the
reported validation results.
