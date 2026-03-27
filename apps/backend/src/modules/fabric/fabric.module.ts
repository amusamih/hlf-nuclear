import { Module } from "@nestjs/common";
import { MetricsModule } from "../metrics/metrics.module.js";
import { ProjectionsModule } from "../projections/projections.module.js";
import { FabricRelayService } from "./fabric.service.js";

@Module({
  imports: [ProjectionsModule, MetricsModule],
  providers: [FabricRelayService],
  exports: [FabricRelayService],
})
export class FabricModule {}
