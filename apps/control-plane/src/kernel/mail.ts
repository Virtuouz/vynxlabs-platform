import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { FastifyBaseLogger } from "fastify";
import { createTransport, type Transporter } from "nodemailer";
import type { Config } from "../config.js";

export interface Message {
  to: string;
  subject: string;
  text: string;
}

/**
 * Sends mail, when the operator has said where to. An instance without it works
 * all the same: whoever asked for a link is given the link to pass on.
 */
export class Mailer {
  readonly #transport: Transporter | undefined;
  readonly #from: string | undefined;
  readonly #log: FastifyBaseLogger;
  readonly #captureDir: string | undefined;
  /** Replaces sending. For tests. */
  deliver: ((message: Message) => Promise<void>) | undefined;

  constructor(config: Pick<Config, "mail" | "mailCaptureDir">, log: FastifyBaseLogger) {
    this.#log = log;
    this.#captureDir = config.mailCaptureDir;
    if (this.#captureDir) {
      log.warn(
        { dir: this.#captureDir },
        "MAIL_CAPTURE_DIR is set: mail is written to files there and nothing is sent. For development only",
      );
    }
    this.#from = config.mail?.from;
    this.#transport = config.mail ? createTransport(config.mail.url) : undefined;
  }

  get configured(): boolean {
    return (
      this.#transport !== undefined || this.deliver !== undefined || this.#captureDir !== undefined
    );
  }

  /** Sends a message. Returns false, and logs why, when it could not be sent. */
  async send(message: Message): Promise<boolean> {
    try {
      if (this.deliver) {
        await this.deliver(message);
        return true;
      }
      // For development: the message is kept as a file, and nothing is sent.
      if (this.#captureDir) {
        await mkdir(this.#captureDir, { recursive: true });
        const name = `${new Date().toISOString().replace(/[:.]/g, "-")}-${Math.random().toString(36).slice(2, 8)}.txt`;
        await writeFile(
          join(this.#captureDir, name),
          `To: ${message.to}\nSubject: ${message.subject}\n\n${message.text}\n`,
          // Read by whoever develops or tests against this instance, not only its own user.
          { mode: 0o644 },
        );
        return true;
      }
      if (!this.#transport) return false;
      await this.#transport.sendMail({ from: this.#from, ...message });
      return true;
    } catch (error) {
      // The address is the person's own. The body holds a one-time link and is never logged.
      this.#log.warn({ err: error, to: message.to }, "a message could not be sent");
      return false;
    }
  }

  close(): void {
    this.#transport?.close();
  }
}
