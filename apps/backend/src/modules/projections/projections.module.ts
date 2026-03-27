import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module.js";
import { ProjectionStoreService } from "./projections.service.js";

@Module({
  imports: [DatabaseModule],
  providers: [ProjectionStoreService],
  exports: [ProjectionStoreService],
})
export class ProjectionsModule {}
