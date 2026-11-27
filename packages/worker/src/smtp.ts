import type { Connector, MailMessage, SmtpClient, SmtpConfig } from "@volvel/sdk";
import { smtpConfigSchema } from "@volvel/sdk";
import type { createTransport, Transporter } from "nodemailer";

/**
 * The built-in connector for a mail server. It is part of the worker, which
 * is what reaches the server: a tenant's mail goes out through the tenant's
 * own server, with the tenant's own credential, and never through the
 * instance's.
 */
export const smtpConnector: Connector<SmtpConfig, SmtpClient> = {
  name: "smtp",
  configSchema: smtpConfigSchema,
  create(config, credential, signal) {
    // The mail library is loaded when a script first sends: every script's process builds its
    // connectors, and loading it for each cost about 29 MB a script that sent nothing.
    let transport: Promise<Transporter> | undefined;
    signal.addEventListener("abort", () => void transport?.then((made) => made.close()), {
      once: true,
    });
    return client(config, () => {
      transport ??= transportFor(config, credential);
      return transport;
    });
  },
  /** Connects, says hello, and signs in, if the connection signs in. Sends nothing. */
  async test(config, credential, signal) {
    const transport = await transportFor(config, credential);
    signal.addEventListener("abort", () => transport.close(), { once: true });
    try {
      await transport.verify();
      return { message: `${config.host} accepted the connection.` };
    } finally {
      transport.close();
    }
  },
};

async function transportFor(config: SmtpConfig, credential: string | undefined) {
  const security = config.security ?? "starttls";
  const { createTransport: create } = (await import("nodemailer")) as {
    createTransport: typeof createTransport;
  };
  return create({
    host: config.host,
    port: config.port ?? 587,
    secure: security === "tls",
    // With STARTTLS asked for, a server that does not offer it is not sent anything.
    requireTLS: security === "starttls",
    ignoreTLS: security === "none",
    ...(config.username ? { auth: { user: config.username, pass: credential ?? "" } } : {}),
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 60_000,
  });
}

function client(config: SmtpConfig, transport: () => Promise<Transporter>): SmtpClient {
  return {
    async send(message: MailMessage) {
      if (message.text === undefined && message.html === undefined) {
        throw new Error("A message needs text or html.");
      }
      const sent = await (await transport()).sendMail({
        from: config.from,
        to: message.to,
        cc: message.cc,
        bcc: message.bcc,
        replyTo: message.replyTo,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
      return { messageId: sent.messageId };
    },
  };
}
