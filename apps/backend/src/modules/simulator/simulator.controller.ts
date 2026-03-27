import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import type {
  DomesticIntakeMessage,
  ForeignAcknowledgementMessage,
  ForeignDecisionMessage,
} from "@prototype/shared/dist/integration.js";
import { SimulatorService } from "./simulator.service.js";

@Controller("simulator")
export class SimulatorController {
  constructor(private readonly simulatorService: SimulatorService) {}

  @Get("scenarios")
  getScenarioCatalog() {
    return this.simulatorService.getScenarioCatalog();
  }

  @Get("metrics")
  getMetricCatalog() {
    return this.simulatorService.getMetricCatalog();
  }

  @Get("exchanges")
  listExchanges() {
    return this.simulatorService.listExchanges();
  }

  @Get("exchanges/summary")
  getExchangeSummary() {
    return this.simulatorService.getExchangeSummary();
  }

  @Post("domestic/intake")
  submitDomesticIntake(@Body() message: DomesticIntakeMessage) {
    return this.simulatorService.submitDomesticIntake(message);
  }

  @Get("domestic/status-sync/:caseId")
  getDomesticStatusSync(
    @Param("caseId") caseId: string,
    @Query("externalCaseRef") externalCaseRef?: string,
  ) {
    return this.simulatorService.buildDomesticStatusSync(caseId, externalCaseRef);
  }

  @Get("foreign/outbound/:caseId")
  getForeignForwarding(
    @Param("caseId") caseId: string,
    @Query("responseDueAt") responseDueAt?: string,
  ) {
    return this.simulatorService.buildForeignForwarding(caseId, responseDueAt);
  }

  @Post("foreign/acknowledge")
  acknowledgeForeignReceipt(@Body() message: ForeignAcknowledgementMessage) {
    return this.simulatorService.acknowledgeForeignReceipt(message);
  }

  @Post("foreign/decision")
  applyForeignDecision(@Body() message: ForeignDecisionMessage) {
    return this.simulatorService.applyForeignDecision(message);
  }
}
