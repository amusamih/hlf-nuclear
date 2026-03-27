import { Injectable } from "@nestjs/common";

export interface MetricObservation {
  metricId: string;
  value: number;
  timestamp: string;
  caseId?: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface MetricSummary {
  metricId: string;
  count: number;
  min: number;
  max: number;
  average: number;
  p50: number;
  p95: number;
}

export interface MetricFilter {
  caseId?: string;
  metricId?: string;
}

@Injectable()
export class MetricsService {
  private readonly observations: MetricObservation[] = [];

  record(
    metricId: string,
    value: number,
    caseId?: string,
    metadata?: Record<string, string | number | boolean>,
  ): MetricObservation {
    const observation: MetricObservation = {
      metricId,
      value,
      timestamp: new Date().toISOString(),
      caseId,
      metadata,
    };
    this.observations.push(observation);
    return observation;
  }

  increment(
    metricId: string,
    caseId?: string,
    metadata?: Record<string, string | number | boolean>,
  ): MetricObservation {
    return this.record(metricId, 1, caseId, metadata);
  }

  list(filter: MetricFilter = {}): MetricObservation[] {
    return this.filterObservations(filter);
  }

  summarize(filter: MetricFilter = {}): MetricSummary[] {
    const grouped = new Map<string, number[]>();

    for (const observation of this.filterObservations(filter)) {
      const values = grouped.get(observation.metricId) ?? [];
      values.push(observation.value);
      grouped.set(observation.metricId, values);
    }

    return Array.from(grouped.entries()).map(([metricId, values]) => {
      const sortedValues = [...values].sort((left, right) => left - right);
      const total = sortedValues.reduce((sum, value) => sum + value, 0);

      return {
        metricId,
        count: sortedValues.length,
        min: sortedValues[0] ?? 0,
        max: sortedValues[sortedValues.length - 1] ?? 0,
        average: sortedValues.length > 0 ? total / sortedValues.length : 0,
        p50: this.percentile(sortedValues, 0.5),
        p95: this.percentile(sortedValues, 0.95),
      };
    });
  }

  private percentile(values: number[], quantile: number): number {
    if (values.length === 0) {
      return 0;
    }

    const index = Math.ceil(values.length * quantile) - 1;
    return values[Math.max(0, Math.min(index, values.length - 1))] ?? 0;
  }

  private filterObservations(filter: MetricFilter): MetricObservation[] {
    return this.observations.filter((observation) => {
      if (filter.caseId && observation.caseId !== filter.caseId) {
        return false;
      }

      if (filter.metricId && observation.metricId !== filter.metricId) {
        return false;
      }

      return true;
    });
  }
}
