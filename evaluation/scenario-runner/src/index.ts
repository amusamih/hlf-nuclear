import { mkdir, readFile, writeFile } from "node:fs/promises";
import { BackendClient } from "./client.js";
import {
  EVALUATION_SCENARIOS,
  runScenarioById,
  type ScenarioRunResult,
} from "./scenarios.js";

interface ScenarioErrorRecord {
  scenarioId: string;
  error: string;
}

interface ScenarioSuiteOutput {
  scenarioCount: number;
  results: ScenarioRunResult[];
  errors: ScenarioErrorRecord[];
}

const RESULTS_DIR = new URL("../results/", import.meta.url);
const TRACE_DIR = new URL("../results/lifecycle-traces/", import.meta.url);

function escapeMarkdown(value: string): string {
  return value.replace(/\|/g, "\\|");
}

function csvCell(value: string | number): string {
  const text = String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

function buildScenarioMarkdown(result: ScenarioRunResult): string {
  const lines = [
    `# ${result.scenarioId}`,
    "",
    `- Case ID: \`${result.caseId}\``,
    `- Terminal state: \`${result.terminalState}\``,
    `- Case state after scenario: \`${result.caseStateAfterScenario}\``,
    `- Duration: ${result.durationMs} ms`,
    `- Audit event count: ${result.auditEventCount}`,
    `- Verified document count: ${result.verifiedDocuments.length}`,
    `- Step count: ${result.steps.length}`,
  ];

  if (result.expectedFailure) {
    lines.push(
      `- Expected failure evidence: \`${result.expectedFailure.step}\` -> ${result.expectedFailure.message}`,
    );
  }

  lines.push("", "## Steps", "", "| Step | Outcome | State | Transaction ID | Document ID | Message |", "| --- | --- | --- | --- | --- | --- |");

  for (const step of result.steps) {
    lines.push(
      `| ${escapeMarkdown(step.step)} | ${escapeMarkdown(step.outcome ?? "")} | ${escapeMarkdown(step.state ?? "")} | ${escapeMarkdown(step.transactionId ?? "")} | ${escapeMarkdown(step.documentId ?? "")} | ${escapeMarkdown(step.message ?? "")} |`,
    );
  }

  lines.push("", "## Metrics", "", "| Metric | Count | Avg | P95 |", "| --- | --- | --- | --- |");

  for (const metric of result.metricsSummary) {
    lines.push(
      `| ${escapeMarkdown(metric.metricId)} | ${metric.count} | ${metric.average} | ${metric.p95} |`,
    );
  }

  if (result.verifiedDocuments.length > 0) {
    lines.push("", "## Verified documents", "");
    for (const documentId of result.verifiedDocuments) {
      lines.push(`- \`${documentId}\``);
    }
  }

  lines.push("");
  return lines.join("\n");
}

function buildSuiteIndexMarkdown(output: ScenarioSuiteOutput): string {
  const lines = [
    "# Lifecycle trace archive",
    "",
    "This folder stores per-scenario lifecycle traces for all implemented evaluation scenarios executed through the scenario runner.",
    "",
    "These traces cover the implemented evaluation scenarios only. They should not be described as an exhaustive enumeration of every theoretical workflow permutation.",
    "",
    `- Scenario count: ${output.results.length}`,
    `- Error count: ${output.errors.length}`,
    "",
    "## Archived scenarios",
    "",
    "| Scenario | Terminal state | Duration (ms) | Audit events | Verified documents | Step count |",
    "| --- | --- | --- | --- | --- | --- |",
  ];

  for (const result of output.results) {
    lines.push(
      `| [${escapeMarkdown(result.scenarioId)}](./${result.scenarioId}.md) | ${escapeMarkdown(result.terminalState)} | ${result.durationMs} | ${result.auditEventCount} | ${result.verifiedDocuments.length} | ${result.steps.length} |`,
    );
  }

  if (output.errors.length > 0) {
    lines.push("", "## Errors", "", "| Scenario | Error |", "| --- | --- |");
    for (const error of output.errors) {
      lines.push(
        `| ${escapeMarkdown(error.scenarioId)} | ${escapeMarkdown(error.error)} |`,
      );
    }
  }

  lines.push("");
  return lines.join("\n");
}

function buildSuiteIndexCsv(output: ScenarioSuiteOutput): string {
  const rows = [
    [
      "scenario_id",
      "terminal_state",
      "case_state_after_scenario",
      "duration_ms",
      "audit_event_count",
      "verified_document_count",
      "step_count",
      "expected_failure_step",
    ].join(","),
  ];

  for (const result of output.results) {
    rows.push(
      [
        csvCell(result.scenarioId),
        csvCell(result.terminalState),
        csvCell(result.caseStateAfterScenario),
        csvCell(result.durationMs),
        csvCell(result.auditEventCount),
        csvCell(result.verifiedDocuments.length),
        csvCell(result.steps.length),
        csvCell(result.expectedFailure?.step ?? ""),
      ].join(","),
    );
  }

  return `${rows.join("\n")}\n`;
}

async function persistScenarioTrace(result: ScenarioRunResult): Promise<void> {
  await mkdir(TRACE_DIR, { recursive: true });
  await writeFile(
    new URL(`./${result.scenarioId}.json`, TRACE_DIR),
    JSON.stringify(result, null, 2),
    "utf8",
  );
  await writeFile(
    new URL(`./${result.scenarioId}.md`, TRACE_DIR),
    buildScenarioMarkdown(result),
    "utf8",
  );
}

async function persistSuiteOutput(output: ScenarioSuiteOutput): Promise<void> {
  await mkdir(RESULTS_DIR, { recursive: true });
  await mkdir(TRACE_DIR, { recursive: true });
  await writeFile(
    new URL("./full-functional-suite.json", RESULTS_DIR),
    JSON.stringify(output, null, 2),
    "utf8",
  );

  for (const result of output.results) {
    await persistScenarioTrace(result);
  }

  await writeFile(
    new URL("./README.md", TRACE_DIR),
    buildSuiteIndexMarkdown(output),
    "utf8",
  );
  await writeFile(
    new URL("./scenario-index.csv", TRACE_DIR),
    buildSuiteIndexCsv(output),
    "utf8",
  );
}

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

  if (scenarioId === "archive") {
    const raw = await readFile(
      new URL("./full-functional-suite.json", RESULTS_DIR),
      "utf8",
    );
    const parsed = JSON.parse(raw) as Partial<ScenarioSuiteOutput>;
    const output: ScenarioSuiteOutput = {
      scenarioCount:
        parsed.scenarioCount ??
        (Array.isArray(parsed.results) ? parsed.results.length : 0),
      results: parsed.results ?? [],
      errors: parsed.errors ?? [],
    };
    await persistSuiteOutput(output);
    console.log(
      JSON.stringify(
        {
          archivedScenarioCount: output.results.length,
          traceDirectory: "evaluation/scenario-runner/results/lifecycle-traces",
        },
        null,
        2,
      ),
    );
    return;
  }

  if (scenarioId === "all") {
    const client = new BackendClient();
    const results: ScenarioRunResult[] = [];
    const errors: ScenarioErrorRecord[] = [];
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
    const output: ScenarioSuiteOutput = {
      scenarioCount: results.length,
      results,
      errors,
    };
    await persistSuiteOutput(output);
    console.log(
      JSON.stringify(output, null, 2),
    );
    return;
  }

  const client = new BackendClient();
  const result = await runScenarioById(client, scenarioId);
  await persistScenarioTrace(result);
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
