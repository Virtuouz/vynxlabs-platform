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
  /** Replaces sending. For tests. */
  deliver: ((message: Message) => Promise<void>) | undefined;

  constructor(config: Pick<Config, "mail">, log: FastifyBaseLogger) {
    this.#log = log;
    this.#from = config.mail?.from;
    this.#transport = config.mail ? createTransport(config.mail.url) : undefined;
  }

  get configured(): boolean {
    return this.#transport !== undefined || this.deliver !== undefined;
  }

  /** Sends a message. Returns false, and logs why, when it could not be sent. */
  async send(message: Message): Promise<boolean> {
    try {
      if (this.deliver) {
        await this.deliver(message);
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
