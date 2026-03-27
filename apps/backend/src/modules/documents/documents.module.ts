import { Module } from "@nestjs/common";
import { FabricModule } from "../fabric/fabric.module.js";
import { MetricsModule } from "../metrics/metrics.module.js";
import { ProjectionsModule } from "../projections/projections.module.js";
import { StorageModule } from "../storage/storage.module.js";
import { DocumentsController } from "./documents.controller.js";
import { DocumentsService } from "./documents.service.js";

@Module({
  imports: [FabricModule, MetricsModule, ProjectionsModule, StorageModule],
  controllers: [DocumentsController],
  providers: [DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}

