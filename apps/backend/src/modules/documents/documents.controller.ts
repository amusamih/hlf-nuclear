import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import {
  DocumentsService,
  type UploadDocumentRequest,
} from "./documents.service.js";

@Controller("documents")
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post()
  uploadDocument(@Body() request: UploadDocumentRequest) {
    return this.documentsService.uploadDocument(request);
  }

  @Get("case/:caseId")
  listCaseDocuments(@Param("caseId") caseId: string) {
    return this.documentsService.listCaseDocuments(caseId);
  }

  @Get(":documentId/verify")
  verifyDocument(@Param("documentId") documentId: string) {
    return this.documentsService.verifyDocument(documentId);
  }
}

