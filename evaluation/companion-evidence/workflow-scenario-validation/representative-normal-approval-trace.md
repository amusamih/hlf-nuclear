# Representative Workflow Trace: Normal Approval Path

This note documents one representative executed workflow trace that can be cited in the paper as
an example of the end-to-end approval path. The trace is derived from the
`normal-approval-fuel-shipment` record in `../functional-scenario-suite.json`.

## Scenario identity

- Scenario ID: `normal-approval-fuel-shipment`
- Case ID: `case-cf747c28-0e79-4f36-9e97-e91cfd38d82b`
- Expected terminal state: `issued`
- Observed terminal state: `issued`
- End-to-end duration: `35,448 ms`
- Audit event count: `8`
- Verified issued document count: `1`

## Executed step sequence

1. `create_draft` -> `draft`
2. Upload `assurance_application_form`
3. Upload `item_technical_specification`
4. Upload `end_use_declaration`
5. Upload `supporting_correspondence`
6. Upload `transport_authorization`
7. Upload `package_design_certificate`
8. `submit_case` -> `submitted`
9. `record_domestic_review` -> `under_domestic_review`
10. `forward_to_coordination` -> `awaiting_coordination`
11. Upload `coordination_forwarding_package`
12. `forward_to_foreign_authority` -> `forwarded_to_foreign_authority`
13. `record_foreign_review` -> `under_foreign_review`
14. Upload `foreign_regulator_response`
15. `approve_case` -> `approved`
16. Upload `assurance_instrument`
17. `issue_assurance` -> `issued`

## What this representative trace demonstrates

- draft creation, document anchoring, and submission on the same case record
- domestic review, coordination forwarding, and foreign review as distinct lifecycle stages
- issuance only after the final assurance instrument has been anchored
- an auditable trace with a verified issued document at the end of the workflow

## Claim boundary

This representative trace should be used as an illustrative example of one executed end-to-end
workflow path. It should not be described as the only executed scenario or as evidence of
exhaustive workflow validation. The full executed scenario set is summarized in
`executed-scenarios.md` and recorded in `../functional-scenario-suite.json`.
