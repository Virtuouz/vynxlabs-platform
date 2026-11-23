/** A connection to a mail server, for the built-in `smtp` connector. */
export interface SmtpConfig {
  host: string;
  /** Default 587. */
  port?: number;
  /**
   * `tls` speaks TLS from the first byte, as port 465 expects. `starttls`
   * upgrades a plain connection and refuses to go on without it. `none` is for
   * a server inside the same network that offers neither. Default `starttls`.
   */
  security?: "tls" | "starttls" | "none";
  /** The address mail is sent from: `orders@example.com` or `Orders <orders@example.com>`. */
  from: string;
  /** The user to sign in as. The password is the connection's credential. */
  username?: string;
}

export interface MailMessage {
  /** One address or several. */
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
  subject: string;
  /** The message as plain text. Give this, `html`, or both. */
  text?: string;
  html?: string;
}

/** What a script is given for an `smtp` connection. */
export interface SmtpClient {
  /** Sends one message. Resolves once the server has taken it, with the ID the server gave it. */
  send(message: MailMessage): Promise<{ messageId: string }>;
}

/**
 * The configuration of an `smtp` connection, as a JSON Schema. The connector
 * itself is part of the worker, which is what speaks to the mail server: a
 * bundle carries none of it.
 */
export const smtpConfigSchema = {
  type: "object",
  properties: {
    host: {
      type: "string",
      minLength: 1,
      maxLength: 253,
      title: "Mail server",
      description: "The mail server's address, such as `smtp.example.com`.",
    },
    port: {
      type: "integer",
      minimum: 1,
      maximum: 65535,
      default: 587,
      title: "Port",
      description: "The port the server listens on. Port 465 expects `tls`.",
    },
    security: {
      enum: ["starttls", "tls", "none"],
      default: "starttls",
      title: "Security",
      description:
        "`tls` speaks TLS from the first byte. `starttls` upgrades a plain connection and refuses to go on without it. `none` is for a server inside the same network that offers neither.",
    },
    from: {
      type: "string",
      minLength: 3,
      maxLength: 320,
      title: "Sent from",
      description:
        "The address mail is sent from: `orders@example.com` or `Orders <orders@example.com>`.",
    },
    username: {
      type: "string",
      maxLength: 320,
      title: "User name",
      description: "The user to sign in as. The password is the connection's secret.",
    },
  },
  required: ["host", "from"],
  additionalProperties: false,
} as const;
