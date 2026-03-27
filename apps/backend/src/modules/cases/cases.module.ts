import { Module } from "@nestjs/common";
import { FabricModule } from "../fabric/fabric.module.js";
import { MetricsModule } from "../metrics/metrics.module.js";
import { ProjectionsModule } from "../projections/projections.module.js";
import { CasesController } from "./cases.controller.js";
import { CasesService } from "./cases.service.js";

@Module({
  imports: [FabricModule, MetricsModule, ProjectionsModule],
  controllers: [CasesController],
  providers: [CasesService],
  exports: [CasesService],
})
export class CasesModule {}
