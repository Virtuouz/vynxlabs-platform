import { CreateBucketCommand, HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import type { Config } from "./config.js";

/** The platform's file storage. Any S3-compatible store. */
export interface ObjectStore {
  /** Throws if the bucket cannot be reached. */
  check(): Promise<void>;
  /** Creates the bucket if it does not exist yet. */
  ensureBucket(): Promise<void>;
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

  close(): void {
    this.#client.destroy();
  }
}
