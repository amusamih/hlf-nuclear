# Workflow Scenario Validation Companion

This folder reorganizes the executed workflow validation runs into a paper-facing companion
package. It is intended for citation from the manuscript when only one representative scenario
can be shown inline while the remaining executed traces are made available in the repository.

Scope and interpretation:

- The workflow scenario suite was executed once for each listed scenario.
- The recorded outputs are scenario-level validation evidence, not repeated statistical trials.
- Positive lifecycle scenarios and blocked-path policy checks are both included, but they should
  be discussed separately in the paper.
- The authoritative machine-readable source remains `../functional-scenario-suite.json`.

Included files:

- `executed-scenarios.md`
  - narrative summary of the executed positive and blocked-path scenarios
- `executed-scenarios.csv`
  - compact tabular summary suitable for manuscript-side reuse
- `representative-normal-approval-trace.md`
  - paper-facing trace summary for one representative end-to-end approval scenario

Recommended paper usage:

- Present one representative scenario inline, typically the normal approval path.
- Refer readers to this folder for the complete set of executed workflow scenarios.
- Keep interoperability validation separate and cite `../interoperability-validation.json`
  when discussing cross-system exchange.
