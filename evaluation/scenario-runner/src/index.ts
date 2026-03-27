import { BackendClient } from "./client.js";
import { EVALUATION_SCENARIOS, runScenarioById } from "./scenarios.js";

async function main(): Promise<void> {
  const scenarioId = process.argv[2] ?? "normal-approval-fuel-shipment";

  if (scenarioId === "list") {
    console.log(
      JSON.stringify(
        EVALUATION_SCENARIOS.map((scenario) => ({
          scenarioId: scenario.scenarioId,
          label: scenario.label,
        })),
        null,
        2,
      ),
    );
    return;
  }

  if (scenarioId === "all") {
    const client = new BackendClient();
    const results = [];
    const errors = [];
    for (const scenario of EVALUATION_SCENARIOS) {
      try {
        results.push(await runScenarioById(client, scenario.scenarioId));
      } catch (error) {
        errors.push({
          scenarioId: scenario.scenarioId,
          error: error instanceof Error ? error.message : "unknown_error",
        });
      }
    }
    console.log(
      JSON.stringify(
        {
          scenarioCount: results.length,
          results,
          errors,
        },
        null,
        2,
      ),
    );
    return;
  }

  const client = new BackendClient();
  const result = await runScenarioById(client, scenarioId);
  console.log(JSON.stringify(result, null, 2));
}

void main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        error: error instanceof Error ? error.message : "unknown_error",
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
});
