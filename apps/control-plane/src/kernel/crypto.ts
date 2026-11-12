import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = 1;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

/** AES-256-GCM. Output: version byte, nonce, tag, ciphertext. */
function seal(key: Buffer, plaintext: Buffer, context: string): Buffer {
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(Buffer.from(context, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([Buffer.from([VERSION]), nonce, cipher.getAuthTag(), ciphertext]);
}

function open(key: Buffer, sealed: Buffer, context: string): Buffer {
  if (sealed[0] !== VERSION || sealed.length < 1 + NONCE_BYTES + TAG_BYTES) {
    throw new Error("Unrecognized ciphertext format.");
  }
  const nonce = sealed.subarray(1, 1 + NONCE_BYTES);
  const tag = sealed.subarray(1 + NONCE_BYTES, 1 + NONCE_BYTES + TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAAD(Buffer.from(context, "utf8"));
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(sealed.subarray(1 + NONCE_BYTES + TAG_BYTES)),
    decipher.final(),
  ]);
}

export interface SecretName {
  tenantId: string;
  workspaceId: string;
  name: string;
}

/**
 * Envelope encryption for tenant secrets. The instance master key wraps one
 * data key per tenant, and the data key encrypts that tenant's secret values.
 */
export class Vault {
  readonly #masterKey: Buffer;

  constructor(masterKey: Buffer) {
    if (masterKey.length !== 32) throw new Error("The master key must be 32 bytes.");
    this.#masterKey = masterKey;
  }

  newTenantKey(tenantId: string): { key: Buffer; wrapped: Buffer } {
    const key = randomBytes(32);
    return { key, wrapped: seal(this.#masterKey, key, `tenant-key:${tenantId}`) };
  }

  unwrapTenantKey(tenantId: string, wrapped: Buffer): Buffer {
    return open(this.#masterKey, wrapped, `tenant-key:${tenantId}`);
  }

  /** Encrypts something that belongs to the instance itself, such as the address of a database. */
  sealForInstance(context: string, value: string): Buffer {
    return seal(this.#masterKey, Buffer.from(value, "utf8"), `instance:${context}`);
  }

  openForInstance(context: string, sealed: Buffer): string {
    return open(this.#masterKey, sealed, `instance:${context}`).toString("utf8");
  }

  /** The tenant, workspace and name are bound in, so a ciphertext cannot be moved elsewhere. */
  encrypt(tenantKey: Buffer, id: SecretName, value: string): Buffer {
    return seal(tenantKey, Buffer.from(value, "utf8"), context(id));
  }

  decrypt(tenantKey: Buffer, id: SecretName, ciphertext: Buffer): string {
    return open(tenantKey, ciphertext, context(id)).toString("utf8");
  }
}

function context(id: SecretName): string {
  return `secret:${id.tenantId}:${id.workspaceId}:${id.name}`;
}
