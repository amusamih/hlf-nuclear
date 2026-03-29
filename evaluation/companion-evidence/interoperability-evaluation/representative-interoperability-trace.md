# Representative Interoperability Trace

This note documents the recorded interoperability path that can be cited in the paper as a
representative example of cross-system exchange through the implemented platform.

## Trace identity

- Case ID: `case-712595b3-cd8b-43cd-8650-0be20f329353`
- Case number: `NRA-2026-0401`
- Correlation ID: `interop-1774408572706`
- Terminal state: `issued`
- Issued document verification: `true`

## Executed exchange path

1. A domestic intake message was submitted through the domestic simulator and created a case that
   entered the platform workflow.
2. The case progressed through domestic review and coordination forwarding inside the platform.
3. The system generated a foreign forwarding message with case summary data and a forwarding-package
   document manifest.
4. The foreign simulator returned an acknowledgement, after which the case entered
   `under_foreign_review`.
5. The foreign simulator returned an approval decision, after which the case entered `approved`.
6. The coordinating authority issued the assurance instrument inside the workflow.
7. The domestic status-sync message reflected the final `issued` state for the external domestic
   reference.
8. The issued assurance document was retrieved and verified successfully against its anchored hash.

## Key observed outputs

- Foreign forwarding message generated with one forwarding-package document manifest
- Foreign acknowledgement applied successfully
- Foreign decision applied successfully
- Domestic status synchronization generated successfully after issuance
- Final issued document verified successfully against anchored metadata

## Claim boundary

This representative trace should be used as evidence that one complete interoperability path was
executed successfully across the prototype's domestic and foreign simulator interfaces. It should
not be described as exhaustive interoperability testing across multiple external systems or
production counterpart implementations.
