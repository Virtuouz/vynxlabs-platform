import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { Config } from "./config.js";

/** The platform's file storage. Any S3-compatible store. */
export interface ObjectStore {
  /** Throws if the bucket cannot be reached. */
  check(): Promise<void>;
  /** Creates the bucket if it does not exist yet. */
  ensureBucket(): Promise<void>;
  put(key: string, body: string | Buffer, contentType: string): Promise<void>;
  /** Throws if there is no such object. */
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
  close(): void;
}

export class S3ObjectStore implements ObjectStore {
  readonly #client: S3Client;
  readonly #bucket: string;

  constructor(config: Config["s3"]) {
    this.#bucket = config.bucket;
    this.#client = new S3Client({
      region: config.region,
      forcePathStyle: config.forcePathStyle,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
      ...(config.endpoint ? { endpoint: config.endpoint } : {}),
    });
  }

  async check(): Promise<void> {
    await this.#client.send(new HeadBucketCommand({ Bucket: this.#bucket }));
  }

  async ensureBucket(): Promise<void> {
    try {
      await this.check();
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata
        ?.httpStatusCode;
      if (status !== 404) throw error;
      await this.#client.send(new CreateBucketCommand({ Bucket: this.#bucket }));
    }
  }

  async put(key: string, body: string | Buffer, contentType: string): Promise<void> {
    await this.#client.send(
      new PutObjectCommand({
        Bucket: this.#bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async get(key: string): Promise<Buffer> {
    const result = await this.#client.send(
      new GetObjectCommand({ Bucket: this.#bucket, Key: key }),
    );
    if (!result.Body) throw new Error(`The stored object ${key} is empty.`);
    return Buffer.from(await result.Body.transformToByteArray());
  }

  async remove(key: string): Promise<void> {
    await this.#client.send(new DeleteObjectCommand({ Bucket: this.#bucket, Key: key }));
  }

  close(): void {
    this.#client.destroy();
  }
}

/** An object store that lives in memory. For tests and for running scripts locally. */
export class MemoryObjectStore implements ObjectStore {
  readonly objects = new Map<string, Buffer>();
  async check() {}
  async ensureBucket() {}
  async put(key: string, body: string | Buffer) {
    this.objects.set(key, Buffer.from(body));
  }
  async get(key: string) {
    const found = this.objects.get(key);
    if (!found) throw new Error(`No stored object at ${key}.`);
    return found;
  }
  async remove(key: string) {
    this.objects.delete(key);
  }
  close() {}
}
