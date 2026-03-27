import { Module } from "@nestjs/common";
import { CasesModule } from "../cases/cases.module.js";
import { DocumentsModule } from "../documents/documents.module.js";
import { MetricsModule } from "../metrics/metrics.module.js";
import { SimulatorController } from "./simulator.controller.js";
import { SimulatorService } from "./simulator.service.js";

@Module({
  imports: [CasesModule, DocumentsModule, MetricsModule],
  controllers: [SimulatorController],
  providers: [SimulatorService],
})
export class SimulatorModule {}
