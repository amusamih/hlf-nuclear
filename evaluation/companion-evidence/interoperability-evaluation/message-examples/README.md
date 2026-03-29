# Interoperability Message Examples

This folder contains compact JSON examples that show how the prototype accepts structured
domestic-side and foreign-side API messages and maps them into the platform's internal workflow
handling model.

Included examples:

- `domestic-intake-input.json`
  - representative domestic-side intake message in the external API format
- `domestic-intake-normalized.json`
  - canonical internal handling summary derived from that intake message
- `foreign-decision-input.json`
  - representative foreign-side decision message in the external API format
- `foreign-decision-normalized.json`
  - canonical internal handling summary derived from that decision message

Claim boundary:

- These files show schema-validated message handling and canonical workflow mapping.
- They do not show heterogeneous third-party formats or independently deployed counterpart systems.
