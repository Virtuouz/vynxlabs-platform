import type { Connector, MailMessage, SmtpClient, SmtpConfig } from "@vynxlabs/sdk";
import { smtpConfigSchema } from "@vynxlabs/sdk";
import { createTransport } from "nodemailer";

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
    const security = config.security ?? "starttls";
    const transport = createTransport({
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
    signal.addEventListener("abort", () => transport.close(), { once: true });
    return {
      async send(message: MailMessage) {
        if (message.text === undefined && message.html === undefined) {
          throw new Error("A message needs text or html.");
        }
        const sent = await transport.sendMail({
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
  },
};
