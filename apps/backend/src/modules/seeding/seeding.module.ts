import { Module } from "@nestjs/common";
import { CasesModule } from "../cases/cases.module.js";
import { DocumentsModule } from "../documents/documents.module.js";
import { BenchmarkSeedService } from "./benchmark-seed.service.js";

@Module({
  imports: [CasesModule, DocumentsModule],
  providers: [BenchmarkSeedService],
  exports: [BenchmarkSeedService],
})
export class SeedingModule {}
