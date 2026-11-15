import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from "node:crypto";

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

/** A tenant's key as it travels in an export: wrapped with a key derived from a passphrase. */
export interface PassphraseWrappedKey {
  kdf: "scrypt";
  /** scrypt's cost settings, so that a later version can raise them and still open old exports. */
  n: number;
  r: number;
  p: number;
  salt: string;
  cipher: "aes-256-gcm";
  /** Version byte, nonce, tag and ciphertext, base64. */
  wrapped: string;
}

const SCRYPT = { n: 2 ** 15, r: 8, p: 1 };

function fromPassphrase(
  passphrase: string,
  salt: Buffer,
  cost: { n: number; r: number; p: number },
) {
  return scryptSync(passphrase.normalize("NFKC"), salt, 32, {
    N: cost.n,
    r: cost.r,
    p: cost.p,
    maxmem: 256 * 1024 * 1024,
  });
}

export interface SecretName {
  tenantId: string;
  workspaceId: string;
  name: string;
}

/** Names a key in logs and status without saying anything about it: 16 hex characters of its hash. */
export function fingerprint(key: Buffer): string {
  return createHash("sha256").update(key).digest("hex").slice(0, 16);
}

/** Which of the instance's keys sealed a value. */
export type SealedWith = "current" | "secondary";

/**
 * Envelope encryption for tenant secrets. The instance master key wraps one
 * data key per tenant, and the data key encrypts that tenant's secret values.
 *
 * The vault may know a second master key, during a rotation. It opens with
 * either and always seals with the first: what is sealed now is sealed with
 * `MASTER_KEY`, and `rewrap` moves what is not.
 */
export class Vault {
  readonly #keys: Buffer[];

  constructor(masterKey: Buffer, secondary?: Buffer) {
    for (const key of [masterKey, secondary]) {
      if (key && key.length !== 32) throw new Error("The master key must be 32 bytes.");
    }
    this.#keys = secondary ? [masterKey, secondary] : [masterKey];
  }

  /** The fingerprints of the master key and of the secondary one, if any. */
  get fingerprints(): { current: string; secondary: string | null } {
    return {
      current: fingerprint(this.#keys[0] as Buffer),
      secondary: this.#keys[1] ? fingerprint(this.#keys[1]) : null,
    };
  }

  /** Opens with whichever key sealed it, and says which. Throws when neither did. */
  #open(sealed: Buffer, context: string): { plain: Buffer; with: SealedWith } {
    let failure: unknown;
    for (const [index, key] of this.#keys.entries()) {
      try {
        return { plain: open(key, sealed, context), with: index === 0 ? "current" : "secondary" };
      } catch (error) {
        failure = error;
      }
    }
    throw failure;
  }

  #seal(plain: Buffer, context: string): Buffer {
    return seal(this.#keys[0] as Buffer, plain, context);
  }

  /**
   * A value sealed directly with a master key, under `context` (as `tenant-key:<id>`
   * or `instance:<what>`), sealed again with the current key. Undefined when it is
   * already. Throws when no key the instance has opens it.
   */
  rewrap(context: string, sealed: Buffer): Buffer | undefined {
    const opened = this.#open(sealed, context);
    return opened.with === "current" ? undefined : this.#seal(opened.plain, context);
  }

  newTenantKey(tenantId: string): { key: Buffer; wrapped: Buffer } {
    const key = randomBytes(32);
    return { key, wrapped: this.#seal(key, `tenant-key:${tenantId}`) };
  }

  unwrapTenantKey(tenantId: string, wrapped: Buffer): Buffer {
    return this.#open(wrapped, `tenant-key:${tenantId}`).plain;
  }

  /**
   * A tenant's key, taken out from under this instance's master key and
   * wrapped with a passphrase instead, to travel in an export. The master key
   * itself never leaves the instance.
   */
  exportTenantKey(tenantId: string, wrapped: Buffer, passphrase: string): PassphraseWrappedKey {
    const key = this.unwrapTenantKey(tenantId, wrapped);
    const salt = randomBytes(16);
    return {
      kdf: "scrypt",
      ...SCRYPT,
      salt: salt.toString("base64"),
      cipher: "aes-256-gcm",
      wrapped: seal(
        fromPassphrase(passphrase, salt, SCRYPT),
        key,
        `tenant-export:${tenantId}`,
      ).toString("base64"),
    };
  }

  /** The reverse: opens an exported key with its passphrase and wraps it for this instance. Throws on a wrong passphrase. */
  importTenantKey(tenantId: string, exported: PassphraseWrappedKey, passphrase: string): Buffer {
    if (exported.kdf !== "scrypt" || exported.cipher !== "aes-256-gcm") {
      throw new Error("Unrecognized key wrapping.");
    }
    const key = open(
      fromPassphrase(passphrase, Buffer.from(exported.salt, "base64"), exported),
      Buffer.from(exported.wrapped, "base64"),
      `tenant-export:${tenantId}`,
    );
    return this.#seal(key, `tenant-key:${tenantId}`);
  }

  /** Encrypts something that belongs to the instance itself, such as the address of a database. */
  sealForInstance(context: string, value: string): Buffer {
    return this.#seal(Buffer.from(value, "utf8"), `instance:${context}`);
  }

  openForInstance(context: string, sealed: Buffer): string {
    return this.#open(sealed, `instance:${context}`).plain.toString("utf8");
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
