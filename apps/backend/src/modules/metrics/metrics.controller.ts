import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { MetricsService } from "./metrics.service.js";

@Controller("metrics")
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Post()
  recordMetric(
    @Body()
    body: {
      metricId: string;
      value: number;
      caseId?: string;
      metadata?: Record<string, string | number | boolean>;
    },
  ) {
    return this.metricsService.record(
      body.metricId,
      body.value,
      body.caseId,
      body.metadata,
    );
  }

  @Get()
  listMetrics(
    @Query("caseId") caseId?: string,
    @Query("metricId") metricId?: string,
  ) {
    return this.metricsService.list({ caseId, metricId });
  }

  @Get("summary")
  getMetricSummary(
    @Query("caseId") caseId?: string,
    @Query("metricId") metricId?: string,
  ) {
    return this.metricsService.summarize({ caseId, metricId });
  }
}
