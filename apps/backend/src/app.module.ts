import { Module } from "@nestjs/common";
import { CasesModule } from "./modules/cases/cases.module.js";
import { DocumentsModule } from "./modules/documents/documents.module.js";
import { MetricsModule } from "./modules/metrics/metrics.module.js";
import { SeedingModule } from "./modules/seeding/seeding.module.js";
import { SimulatorModule } from "./modules/simulator/simulator.module.js";

@Module({
  imports: [
    CasesModule,
    DocumentsModule,
    MetricsModule,
    SeedingModule,
    SimulatorModule,
  ],
})
export class AppModule {}
