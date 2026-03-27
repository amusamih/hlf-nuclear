import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import {
  type CreateDraftRequest,
  CasesService,
  type SubmitCaseRequest,
  type TransitionCaseRequest,
} from "./cases.service.js";

@Controller("cases")
export class CasesController {
  constructor(private readonly casesService: CasesService) {}

  @Get("workflow/model")
  getWorkflowModel() {
    return this.casesService.getWorkflowModel();
  }

  @Get()
  listCases() {
    return this.casesService.listCases();
  }

  @Get(":caseId")
  getCase(@Param("caseId") caseId: string) {
    return this.casesService.getCase(caseId);
  }

  @Get(":caseId/history")
  listEvents(@Param("caseId") caseId: string) {
    return this.casesService.listEvents(caseId);
  }

  @Get(":caseId/audit-timeline")
  getAuditTimeline(@Param("caseId") caseId: string) {
    return this.casesService.reconstructAuditTimeline(caseId);
  }

  @Post()
  createDraft(@Body() request: CreateDraftRequest) {
    return this.casesService.createDraft(request);
  }

  @Post(":caseId/submit")
  submitCase(
    @Param("caseId") caseId: string,
    @Body() request: SubmitCaseRequest,
  ) {
    return this.casesService.submitCase(caseId, request);
  }

  @Post(":caseId/actions")
  transitionCase(
    @Param("caseId") caseId: string,
    @Body() request: TransitionCaseRequest,
  ) {
    return this.casesService.transitionCase(caseId, request);
  }
}
