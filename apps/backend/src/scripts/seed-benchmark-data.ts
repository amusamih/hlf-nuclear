import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module.js";
import { BenchmarkSeedService } from "../modules/seeding/benchmark-seed.service.js";

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn", "log"],
  });

  try {
    const seedService = app.get(BenchmarkSeedService);
    const report = await seedService.seedDefaultDataset();
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await app.close();
  }
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
