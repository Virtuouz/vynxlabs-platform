import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { Type } from "typebox";
import { MIN_PASSWORD_LENGTH } from "../config.js";
import { ANONYMOUS, writeAudit } from "../kernel/audit.js";
import { access } from "../kernel/http.js";
import type { Kernel } from "../kernel/kernel.js";
import {
  makeMemberResetLink,
  readMemberResetToken,
  setMemberPasswordWithToken,
} from "../kernel/member-reset.js";
import { Id, NoContent, Time } from "./shared.js";

/** Counted per address: a token is long enough not to be guessed, and this keeps it so. */
const LINK_LIMIT = { max: 20, timeWindow: "1 minute" };
const Token = Type.Object({ token: Type.String({ minLength: 20, maxLength: 100 }) });

const MadeLink = Type.Object({
  url: Type.Union([Type.String(), Type.Null()], {
    description: "The link, to pass on. Null when it was emailed: nobody else is shown it.",
  }),
  expiresAt: Time,
  emailed: Type.Boolean({ description: "Whether it was sent to the member's address." }),
});

/**
 * A member's password is reset with a one-time link, made by an operator or by an admin of the
 * member's tenant, and mailed where the instance sends mail. Nobody learns the password.
 */
export function memberResetRoutes(kernel: Kernel): FastifyPluginAsyncTypebox {
  return async (app) => {
    /** Mails the link when the instance sends mail. Otherwise it is given to whoever made it. */
    async function deliver(made: Awaited<ReturnType<typeof makeMemberResetLink>>) {
      const url = new URL(`/reset-password/${made.token}`, kernel.hosts.mainOrigin).toString();
      const emailed =
        kernel.mail.configured &&
        (await kernel.mail.send({
          to: made.member.email,
          subject: "Choose a new password",
          text: `Open this link to choose a new password for your account:\n${url}\n\nThe link works once, until ${made.expiresAt.toUTCString()}. If you did not expect it, you can ignore this message.\n`,
        }));
      return { url: emailed ? null : url, expiresAt: made.expiresAt.toISOString(), emailed };
    }

    app.post(
      "/tenants/:t/members/:memberId/password-link",
      {
        config: { access: access.tenant("member:write") },
        schema: {
          summary: "Make a one-time link that sets a member's new password",
          description:
            "For a member who belongs to this tenant and no other, and holds nothing at the " +
            "instance: an operator makes the link for anyone else. Refused for a member who " +
            "signs in only through an identity provider. The link works once and runs out in " +
            "two hours; an earlier one stops working. It is emailed to the member where the " +
            "instance sends mail, and is in the answer only where it does not. Using it ends " +
            "the member's other sign-ins. Audited.",
          tags: ["identity"],
          params: Type.Object({ t: Id, memberId: Id }),
          body: Type.Object({}),
          response: { 201: MadeLink },
        },
      },
      async ({ ctx, params }, reply) => {
        const made = await ctx.mutate((trx, audit) =>
          makeMemberResetLink(trx, audit, {
            memberId: params.memberId,
            byMemberId: ctx.principal.id ?? "",
            tenantId: params.t,
          }),
        );
        return reply.code(201).send(await deliver(made));
      },
    );

    app.post(
      "/members/:memberId/password-link",
      {
        config: { access: access.instance("member:write") },
        schema: {
          summary: "Make a one-time link that sets any member's new password",
          description:
            "As for a tenant's admin, for any member of the instance. Refused for a member who " +
            "signs in only through an identity provider. The link is emailed where the instance " +
            "sends mail, and is in the answer only where it does not. Audited.",
          tags: ["identity"],
          params: Type.Object({ memberId: Id }),
          body: Type.Object({}),
          response: { 201: MadeLink },
        },
      },
      async ({ ctx, params }, reply) => {
        const made = await ctx.mutate((trx, audit) =>
          makeMemberResetLink(trx, audit, {
            memberId: params.memberId,
            byMemberId: ctx.principal.id ?? "",
          }),
        );
        return reply.code(201).send(await deliver(made));
      },
    );

    app.get(
      "/member-password-links/:token",
      {
        config: {
          access: access.publicWith("Needs the link's token, which is in the address."),
          rateLimit: LINK_LIMIT,
        },
        schema: {
          summary: "Whose a password link is",
          description:
            "For the page the link opens. Reading it uses nothing. A link that was used or ran " +
            "out answers 410.",
          tags: ["identity"],
          params: Token,
          response: {
            200: Type.Object({ email: Type.String(), name: Type.String(), expiresAt: Time }),
          },
        },
      },
      async ({ params }) => {
        const found = await readMemberResetToken(kernel.db, params.token);
        return {
          email: found.email,
          name: found.name,
          expiresAt: found.expires_at.toISOString(),
        };
      },
    );

    app.post(
      "/member-password-links/:token",
      {
        config: {
          access: access.publicWith("Needs the link's token, which is in the address."),
          rateLimit: LINK_LIMIT,
        },
        schema: {
          summary: "Set a member's new password with a link",
          description:
            "The link works once. Every sign-in the member had ends, and they sign in again " +
            "with the new password. Audited.",
          tags: ["identity"],
          params: Token,
          body: Type.Object({
            password: Type.String({ minLength: MIN_PASSWORD_LENGTH, maxLength: 200 }),
          }),
          response: { 204: NoContent },
        },
      },
      async (request, reply) => {
        await kernel.db.transaction().execute((trx) =>
          setMemberPasswordWithToken(
            kernel,
            trx,
            (input) =>
              writeAudit(
                trx,
                {
                  principal: ANONYMOUS,
                  ipAddress: request.ip,
                  userAgent: request.headers["user-agent"],
                  requestId: request.id,
                },
                input,
              ),
            { token: request.params.token, password: request.body.password },
          ),
        );
        return reply.code(204).send(null);
      },
    );
  };
}
