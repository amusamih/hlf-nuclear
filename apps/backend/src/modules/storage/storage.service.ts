import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { Injectable, OnModuleInit } from "@nestjs/common";
import { Client as MinioClient } from "minio";

export interface StoreObjectRequest {
  bucket: string;
  contentBase64: string;
  objectKey?: string;
}

export interface StoredObjectDescriptor {
  bucket: string;
  objectKey: string;
  sha256Hash: string;
  sizeBytes: number;
}

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly root = path.resolve(
    process.cwd(),
    "infra/.data/object-store",
  );
  private minioClient?: MinioClient;

  async onModuleInit(): Promise<void> {
    if (!this.isMinioMode()) {
      return;
    }

    this.minioClient = new MinioClient({
      endPoint: process.env.MINIO_ENDPOINT ?? "127.0.0.1",
      port: Number(process.env.MINIO_PORT ?? "9000"),
      useSSL: (process.env.MINIO_USE_SSL ?? "false").toLowerCase() === "true",
      accessKey: process.env.MINIO_ACCESS_KEY ?? "prototype",
      secretKey: process.env.MINIO_SECRET_KEY ?? "prototype123",
    });
  }

  async storeObject(
    request: StoreObjectRequest,
  ): Promise<StoredObjectDescriptor> {
    const bytes = Buffer.from(request.contentBase64, "base64");
    const objectKey =
      request.objectKey ??
      `${new Date().toISOString().slice(0, 10)}/${randomUUID()}`;
    const sha256Hash = createHash("sha256").update(bytes).digest("hex");

    if (this.isMinioMode()) {
      const client = this.getMinioClient();
      const bucketExists = await client.bucketExists(request.bucket);
      if (!bucketExists) {
        await client.makeBucket(request.bucket);
      }
      await client.putObject(request.bucket, objectKey, bytes, bytes.byteLength);

      return {
        bucket: request.bucket,
        objectKey,
        sha256Hash,
        sizeBytes: bytes.byteLength,
      };
    }

    const targetPath = path.join(this.root, request.bucket, objectKey);

    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, bytes);

    return {
      bucket: request.bucket,
      objectKey,
      sha256Hash,
      sizeBytes: bytes.byteLength,
    };
  }

  async verifyObjectHash(
    bucket: string,
    objectKey: string,
    expectedSha256Hash: string,
  ): Promise<boolean> {
    if (this.isMinioMode()) {
      const client = this.getMinioClient();
      const stream = await client.getObject(bucket, objectKey);
      const bytes = await this.streamToBuffer(stream);
      const actualSha256Hash = createHash("sha256").update(bytes).digest("hex");
      return actualSha256Hash === expectedSha256Hash;
    }

    const targetPath = path.join(this.root, bucket, objectKey);
    const bytes = await readFile(targetPath);
    const actualSha256Hash = createHash("sha256").update(bytes).digest("hex");
    return actualSha256Hash === expectedSha256Hash;
  }

  async deleteObject(bucket: string, objectKey: string): Promise<void> {
    if (this.isMinioMode()) {
      const client = this.getMinioClient();
      await client.removeObject(bucket, objectKey);
      return;
    }

    const targetPath = path.join(this.root, bucket, objectKey);
    try {
      const { unlink } = await import("node:fs/promises");
      await unlink(targetPath);
    } catch {
      // Best-effort cleanup for failed document anchoring.
    }
  }

  private isMinioMode(): boolean {
    return (process.env.OBJECT_STORAGE_MODE ?? "filesystem").toLowerCase() === "minio";
  }

  private getMinioClient(): MinioClient {
    if (!this.minioClient) {
      throw new Error(
        "MinIO client is not initialized. Set OBJECT_STORAGE_MODE=minio and ensure the MinIO service is reachable before using object storage.",
      );
    }

    return this.minioClient;
  }

  private async streamToBuffer(stream: Readable): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
}
