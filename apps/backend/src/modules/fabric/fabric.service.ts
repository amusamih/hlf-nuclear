import { createPrivateKey, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  OnModuleDestroy,
} from "@nestjs/common";
import * as grpc from "@grpc/grpc-js";
import {
  connect,
  hash,
  signers,
  type Contract,
  type Gateway,
} from "@hyperledger/fabric-gateway";
import {
  applyTransition,
  assertDocumentMutationAllowed,
  assertKnownDocumentType,
  createDraftTransition,
  type AssuranceCase,
  type CreateAssuranceCaseInput,
  type DocumentReference,
  type DocumentType,
  type UserClaims,
  type WorkflowActionType,
  type WorkflowEventRecord,
} from "@prototype/shared";
import { MetricsService } from "../metrics/metrics.service.js";
import { ProjectionStoreService } from "../projections/projections.service.js";
import {
  type FabricInvocationPlan,
  buildCreateCaseInvocationPlan,
  buildDocumentInvocationPlan,
  buildTransitionInvocationPlan,
} from "./fabric-invocation-plans.js";

export interface FabricRelayResult<T> {
  transactionId: string;
  invocationPlan: FabricInvocationPlan;
  payload: T;
}

interface FabricGatewayProfile {
  client?: {
    organization?: string;
  };
  organizations?: Record<
    string,
    {
      mspid?: string;
      peers?: string[];
    }
  >;
  peers?: Record<
    string,
    {
      url?: string;
      tlsCACerts?: {
        path?: string;
      };
      grpcOptions?: Record<string, string>;
    }
  >;
  "x-fabric-gateway"?: {
    peerEndpoint?: string;
    peerHostAlias?: string;
    tlsCertPath?: string;
    identity?: {
      certPath?: string;
      keyPath?: string;
    };
  };
}

interface ResolvedGatewayProfile {
  mspId: string;
  peerEndpoint: string;
  peerHostAlias: string;
  tlsCertPath: string;
  identityCertPath: string;
  identityKeyPath: string;
}

interface GatewaySession {
  gateway: Gateway;
  client: grpc.Client;
}

type FabricMode = "simulated" | "real";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(MODULE_DIR, "../../../../../");

@Injectable()
export class FabricRelayService implements OnModuleDestroy {
  private readonly sessions = new Map<string, GatewaySession>();

  constructor(
    private readonly projections: ProjectionStoreService,
    private readonly metrics: MetricsService,
  ) {}

  async createCase(
    input: CreateAssuranceCaseInput,
    actor: UserClaims,
  ): Promise<FabricRelayResult<{ caseRecord: AssuranceCase; event: WorkflowEventRecord }>> {
    const startedAt = performance.now();
    const correlationId = randomUUID();
    const nowIso = new Date().toISOString();

    try {
      const invocationPlan = buildCreateCaseInvocationPlan(
        input,
        actor,
        correlationId,
        nowIso,
      );
      const transactionId = this.isRealMode()
        ? undefined
        : this.buildTransactionId(invocationPlan);

      if (!this.isRealMode()) {
        if (await this.projections.hasCase(input.caseId)) {
          throw new Error(`Case "${input.caseId}" already exists.`);
        }

        const { caseRecord, event } = createDraftTransition(
          input,
          actor,
          correlationId,
          nowIso,
        );
        event.invokedByGatewayOrg = invocationPlan.gatewayOrganization;
        event.invokedByGatewayUserId = invocationPlan.gatewayUserId;

        this.recordSuccessMetrics(
          startedAt,
          input.caseId,
          "create_case",
          invocationPlan,
        );

        return {
          transactionId: transactionId ?? this.buildTransactionId(invocationPlan),
          invocationPlan,
          payload: { caseRecord, event },
        };
      }

      const submission = await this.submitJsonTransaction<{
        caseRecord: AssuranceCase;
        event: WorkflowEventRecord;
      }>(invocationPlan);
      this.recordSuccessMetrics(
        startedAt,
        input.caseId,
        "create_case",
        invocationPlan,
      );

      return {
        transactionId: submission.transactionId,
        invocationPlan,
        payload: submission.payload,
      };
    } catch (error) {
      const publicMessage = this.describeError(error);
      this.recordAuthorizationFailureIfNeeded(
        publicMessage,
        input.caseId,
        "create_case",
      );
      this.metrics.increment("transaction_failure_count", input.caseId, {
        action: "create_case",
        reason: publicMessage,
      });
      throw this.toPublicError(publicMessage);
    }
  }

  async anchorDocumentReference(
    documentReference: DocumentReference,
    actor: UserClaims,
  ): Promise<FabricRelayResult<DocumentReference>> {
    const startedAt = performance.now();
    try {
      const documentType = assertKnownDocumentType(
        documentReference.documentType,
      );
      assertDocumentMutationAllowed(actor, documentType);
      const invocationPlan = buildDocumentInvocationPlan(
        documentReference,
        actor,
      );

      if (!this.isRealMode()) {
        if (await this.projections.hasDocument(documentReference.documentId)) {
          throw new Error(
            `Document "${documentReference.documentId}" already exists in the anchored projection store.`,
          );
        }

        if (documentReference.supersedesDocumentId) {
          const superseded = await this.projections.getDocument(
            documentReference.supersedesDocumentId,
          );
          if (superseded.caseId !== documentReference.caseId) {
            throw new Error(
              "Superseding document must belong to the same case as the superseded version.",
            );
          }
          if (superseded.documentType !== documentReference.documentType) {
            throw new Error(
              "Superseding document must preserve the original document type.",
            );
          }
          if (documentReference.version !== superseded.version + 1) {
            throw new Error(
              `Document "${documentReference.documentId}" must increment version exactly from ${superseded.version} to ${superseded.version + 1}.`,
            );
          }
        } else if (documentReference.version !== 1) {
          throw new Error(
            `Initial document "${documentReference.documentId}" must start at version 1.`,
          );
        }

        const action = documentReference.supersedesDocumentId
          ? "update_document_version"
          : "add_document_reference";
        const transactionId = this.buildTransactionId(invocationPlan);
        this.recordSuccessMetrics(
          startedAt,
          documentReference.caseId,
          action,
          invocationPlan,
        );

        return {
          transactionId,
          invocationPlan,
          payload: documentReference,
        };
      }

      const action = documentReference.supersedesDocumentId
        ? "update_document_version"
        : "add_document_reference";
      const submission = await this.submitJsonTransaction<DocumentReference>(invocationPlan);
      this.recordSuccessMetrics(
        startedAt,
        documentReference.caseId,
        action,
        invocationPlan,
      );

      return {
        transactionId: submission.transactionId,
        invocationPlan,
        payload: submission.payload,
      };
    } catch (error) {
      const publicMessage = this.describeError(error);
      this.recordAuthorizationFailureIfNeeded(
        publicMessage,
        documentReference.caseId,
        documentReference.supersedesDocumentId
          ? "update_document_version"
          : "add_document_reference",
      );
      this.metrics.increment("transaction_failure_count", documentReference.caseId, {
        action: documentReference.supersedesDocumentId
          ? "update_document_version"
          : "add_document_reference",
        reason: publicMessage,
      });
      throw this.toPublicError(publicMessage);
    }
  }

  async transitionCase(
    caseRecord: AssuranceCase,
    action: Exclude<WorkflowActionType, "create_case">,
    actor: UserClaims,
    documentTypes: DocumentType[],
    relatedDocumentIds: string[],
    justification: string,
  ): Promise<FabricRelayResult<{ caseRecord: AssuranceCase; event: WorkflowEventRecord }>> {
    const startedAt = performance.now();
    try {
      const nowIso = new Date().toISOString();
      const correlationId = randomUUID();
      const invocationPlan = buildTransitionInvocationPlan(
        caseRecord,
        action,
        actor,
        documentTypes,
        relatedDocumentIds,
        justification,
        correlationId,
        nowIso,
      );

      if (!this.isRealMode()) {
        const { updatedCase, event } = applyTransition(
          caseRecord,
          action,
          actor,
          documentTypes,
          relatedDocumentIds,
          justification,
          correlationId,
          nowIso,
        );

        event.invokedByGatewayOrg = invocationPlan.gatewayOrganization;
        event.invokedByGatewayUserId = invocationPlan.gatewayUserId;

        const transactionId = this.buildTransactionId(invocationPlan);
        this.recordSuccessMetrics(
          startedAt,
          caseRecord.caseId,
          action,
          invocationPlan,
        );

        return {
          transactionId,
          invocationPlan,
          payload: {
            caseRecord: updatedCase,
            event,
          },
        };
      }

      const submission = await this.submitJsonTransaction<{
        caseRecord: AssuranceCase;
        event: WorkflowEventRecord;
      }>(invocationPlan);
      this.recordSuccessMetrics(
        startedAt,
        caseRecord.caseId,
        action,
        invocationPlan,
      );

      return {
        transactionId: submission.transactionId,
        invocationPlan,
        payload: submission.payload,
      };
    } catch (error) {
      const publicMessage = this.describeError(error);
      this.recordAuthorizationFailureIfNeeded(
        publicMessage,
        caseRecord.caseId,
        action,
      );
      this.metrics.increment("transaction_failure_count", caseRecord.caseId, {
        action,
        reason: publicMessage,
      });
      throw this.toPublicError(publicMessage);
    }
  }

  onModuleDestroy(): void {
    for (const session of this.sessions.values()) {
      session.gateway.close();
      session.client.close();
    }

    this.sessions.clear();
  }

  private isRealMode(): boolean {
    return this.resolveMode() === "real";
  }

  private resolveMode(): FabricMode {
    const mode = (process.env.FABRIC_MODE ?? "simulated").toLowerCase();
    return mode === "real" ? "real" : "simulated";
  }

  private async submitJsonTransaction<T>(
    invocationPlan: FabricInvocationPlan,
  ): Promise<{
    payload: T;
    transactionId: string;
  }> {
    const session = this.getGatewaySession(invocationPlan.gatewayOrganization);
    const network = session.gateway.getNetwork(invocationPlan.channelName);
    const contract = network.getContract(
      invocationPlan.chaincodeName,
      invocationPlan.contractName,
    );

    return this.submitWithContract<T>(contract, invocationPlan);
  }

  private async submitWithContract<T>(
    contract: Contract,
    invocationPlan: FabricInvocationPlan,
  ): Promise<{
    payload: T;
    transactionId: string;
  }> {
    const submitted = await contract.submitAsync(
      invocationPlan.transactionName,
      {
        arguments: invocationPlan.args,
        endorsingOrganizations: invocationPlan.endorsingOrganizations,
      },
    );
    const status = await submitted.getStatus();
    if (!status.successful) {
      throw new Error(
        `Fabric transaction "${submitted.getTransactionId()}" did not commit successfully.`,
      );
    }

    return {
      payload: JSON.parse(
        Buffer.from(submitted.getResult()).toString("utf8"),
      ) as T,
      transactionId: submitted.getTransactionId(),
    };
  }

  private getGatewaySession(gatewayOrganization: string): GatewaySession {
    const existingSession = this.sessions.get(gatewayOrganization);
    if (existingSession) {
      return existingSession;
    }

    const resolvedProfile = this.resolveGatewayProfile(gatewayOrganization);
    const tlsRootCert = readFileSync(resolvedProfile.tlsCertPath);
    const client = new grpc.Client(
      resolvedProfile.peerEndpoint,
      grpc.credentials.createSsl(tlsRootCert),
      {
        "grpc.ssl_target_name_override": resolvedProfile.peerHostAlias,
        "grpc.default_authority": resolvedProfile.peerHostAlias,
      },
    );

    const gateway = connect({
      client,
      identity: {
        mspId: resolvedProfile.mspId,
        credentials: readFileSync(resolvedProfile.identityCertPath),
      },
      signer: signers.newPrivateKeySigner(
        createPrivateKey(readFileSync(resolvedProfile.identityKeyPath)),
      ),
      hash: hash.sha256,
    });

    const session = { gateway, client };
    this.sessions.set(gatewayOrganization, session);
    return session;
  }

  private resolveGatewayProfile(
    gatewayOrganization: string,
  ): ResolvedGatewayProfile {
    const profilePath = this.resolveConnectionProfilePath(gatewayOrganization);
    if (!existsSync(profilePath)) {
      throw new Error(
        `Fabric connection profile for "${gatewayOrganization}" was not found at "${profilePath}".`,
      );
    }

    const profile = JSON.parse(
      readFileSync(profilePath, "utf8"),
    ) as FabricGatewayProfile;
    const clientOrganization = profile.client?.organization;
    if (!clientOrganization) {
      throw new Error(
        `Fabric connection profile "${profilePath}" is missing client.organization.`,
      );
    }

    const organization = profile.organizations?.[clientOrganization];
    if (!organization?.mspid) {
      throw new Error(
        `Fabric connection profile "${profilePath}" is missing organizations.${clientOrganization}.mspid.`,
      );
    }

    const gatewayConfig = profile["x-fabric-gateway"];
    if (!gatewayConfig?.peerEndpoint || !gatewayConfig.peerHostAlias) {
      throw new Error(
        `Fabric connection profile "${profilePath}" is missing x-fabric-gateway peer connection details.`,
      );
    }
    if (!gatewayConfig.tlsCertPath) {
      throw new Error(
        `Fabric connection profile "${profilePath}" is missing x-fabric-gateway.tlsCertPath.`,
      );
    }
    if (!gatewayConfig.identity?.certPath || !gatewayConfig.identity.keyPath) {
      throw new Error(
        `Fabric connection profile "${profilePath}" is missing x-fabric-gateway identity material paths.`,
      );
    }

    return {
      mspId: organization.mspid,
      peerEndpoint: gatewayConfig.peerEndpoint,
      peerHostAlias: gatewayConfig.peerHostAlias,
      tlsCertPath: this.resolveHostPath(gatewayConfig.tlsCertPath),
      identityCertPath: this.resolveHostPath(gatewayConfig.identity.certPath),
      identityKeyPath: this.resolveHostPath(gatewayConfig.identity.keyPath),
    };
  }

  private resolveConnectionProfilePath(gatewayOrganization: string): string {
    const envVarName = (() => {
      switch (gatewayOrganization) {
        case "DomesticNuclearRegulatorMSP":
          return "FABRIC_CONNECTION_PROFILE_DOMESTIC";
        case "CoordinatingAuthorityMSP":
          return "FABRIC_CONNECTION_PROFILE_COORDINATION";
        case "ForeignNuclearRegulatorMSP":
          return "FABRIC_CONNECTION_PROFILE_FOREIGN";
        default:
          return undefined;
      }
    })();

    const configuredPath = envVarName ? process.env[envVarName] : undefined;
    if (configuredPath) {
      return this.resolveHostPath(configuredPath);
    }

    switch (gatewayOrganization) {
      case "DomesticNuclearRegulatorMSP":
        return path.join(REPO_ROOT, "infra", "fabric", "connection-profiles", "domestic-gateway.json");
      case "CoordinatingAuthorityMSP":
        return path.join(REPO_ROOT, "infra", "fabric", "connection-profiles", "coordination-gateway.json");
      case "ForeignNuclearRegulatorMSP":
        return path.join(REPO_ROOT, "infra", "fabric", "connection-profiles", "foreign-gateway.json");
      default:
        throw new Error(
          `No Fabric connection profile mapping is defined for gateway organization "${gatewayOrganization}".`,
        );
    }
  }

  private resolveHostPath(pathValue: string): string {
    return path.isAbsolute(pathValue)
      ? pathValue
      : path.resolve(REPO_ROOT, pathValue);
  }

  private recordSuccessMetrics(
    startedAt: number,
    caseId: string,
    action: string,
    invocationPlan: FabricInvocationPlan,
  ): void {
    this.metrics.record(
      "fabric_invoke_latency_ms",
      performance.now() - startedAt,
      caseId,
      {
        action,
        contractName: invocationPlan.contractName,
        transactionName: invocationPlan.transactionName,
        gatewayOrg: invocationPlan.gatewayOrganization,
        channelName: invocationPlan.channelName,
        endorsers: invocationPlan.endorsingOrganizations.join(","),
        fabricMode: this.resolveMode(),
      },
    );
    this.metrics.increment("transaction_success_count", caseId, {
      action,
      transactionName: invocationPlan.transactionName,
      fabricMode: this.resolveMode(),
    });
  }

  private buildTransactionId(invocationPlan: FabricInvocationPlan): string {
    return `${invocationPlan.gatewayOrganization}:${randomUUID()}`;
  }

  private recordAuthorizationFailureIfNeeded(
    message: string,
    caseId: string,
    action: string,
  ): void {
    if (
      message.includes("not allowed") ||
      message.includes("not permitted") ||
      message.includes("inactive") ||
      message.includes("cannot")
    ) {
      this.metrics.increment("access_denied_count", caseId, { action });
    }
  }

  private describeError(error: unknown): string {
    if (!(error instanceof Error)) {
      return "unknown_error";
    }

    const details = (error as Error & {
      details?: Array<{ mspId?: string; message?: string }>;
    }).details;
    const detailMessages = Array.isArray(details)
      ? details
          .map((detail) =>
            detail.mspId && detail.message
              ? `${detail.mspId}: ${detail.message}`
              : detail.message ?? detail.mspId ?? undefined,
          )
          .filter((detail): detail is string => Boolean(detail))
      : [];

    if (detailMessages.length === 0) {
      return error.message;
    }

    return `${error.message} Details: ${detailMessages.join(" | ")}`;
  }

  private toPublicError(message: string): Error {
    if (
      message.includes("not allowed") ||
      message.includes("not permitted") ||
      message.includes("inactive") ||
      message.includes("cannot")
    ) {
      return new ForbiddenException(message);
    }

    return new BadRequestException(message);
  }
}
