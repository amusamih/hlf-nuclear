# Executed Interoperability Validation Summary

This note summarizes the interoperability validation run recorded in
`../interoperability-validation.json`.

## Executed run overview

| Validation artifact | Value |
| --- | --- |
| Case ID | `case-712595b3-cd8b-43cd-8650-0be20f329353` |
| Case number | `NRA-2026-0401` |
| Correlation ID | `interop-1774408572706` |
| Terminal state | `issued` |
| Intake state after domestic handoff | `submitted` |
| Foreign acknowledgement state | `under_foreign_review` |
| Foreign decision state | `approved` |
| Exchange count | `6` |
| Audit event count | `8` |
| Issued document verified | `true` |

## Executed exchange coverage

The recorded run covers the following cross-system exchange elements:

- domestic intake message generation and application
- generation of the foreign forwarding message and document manifest
- foreign acknowledgement handling
- foreign decision handling
- domestic status synchronization after issuance
- issued-document integrity verification after workflow completion

## Exchange summary

| Dimension | Observed value |
| --- | --- |
| Total exchanges | `6` |
| By simulator | `domestic_emulator: 3`, `foreign_simulator: 3` |
| By status | `generated: 3`, `applied: 3` |
| By message type | `domestic_intake: 1`, `domestic_status_sync: 2`, `foreign_forwarding: 1`, `foreign_acknowledgement: 1`, `foreign_decision: 1` |

## Key measured outputs

| Metric | Observed value |
| --- | ---: |
| Domestic intake latency | 11,137.84 ms |
| Foreign simulator exchange latency average | 3,105.05 ms |
| Audit reconstruction time | 5.33 ms |
| Issued document verification | `true` |

## Claim boundary

This evidence supports the claim that the prototype executed one complete interoperability path
across domestic intake, coordination forwarding, foreign acknowledgement and decision exchange,
issuance, and domestic status synchronization. It does not support a claim of repeated-run
statistical interoperability analysis or broad conformance testing against multiple real external
systems.
