import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import type { IncomingMessage } from "node:http";
import { join } from "node:path";
import {
  buildApp,
  buildSearchIndex,
  type DocsApp,
  loadSearchIndex,
  type ResourceLike,
  urlOf,
} from "@volvel/docs-engine";
import { keyOf, readFormAnswer } from "@volvel/manifest";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { MIN_PASSWORD_LENGTH } from "../../config.js";
import { ANONYMOUS, type Db, type Principal, writeAudit } from "../audit.js";
import { check } from "../authorize.js";
import { describeTable, insertRows, withData } from "../data/rows.js";
import { consoleDirectory, productNames } from "../docs/product.js";
import { workingDocs } from "../docs/working.js";
import {
  checkEndUserPassword,
  createEndUser,
  createPasswordToken,
  endUserIdentity,
  readPasswordToken,
  setPasswordWithToken,
  signUpAllowed,
} from "../endusers.js";
import { HttpError } from "../errors.js";
import { loadBundle } from "../execution/bundles.js";
import { findForm, submitForm } from "../execution/triggers.js";
import type { Kernel } from "../kernel.js";
import { resolvePrincipal } from "../principal.js";
import { pathNow } from "../resolve.js";
import { answer, begin, finish, stateCookie } from "../sso/flow.js";
import { endUserPasswordRefusedBy, SsoRefusal } from "../sso/people.js";
import {
  addressesOf,
  findProvider,
  isLive,
  isSaml,
  listProviders,
  openSecrets,
} from "../sso/providers.js";
import { samlMetadata } from "../sso/saml.js";
import { appBasePath, portalPath, portalUrl } from "./address.js";
import { appFiles, readAsset } from "./assets.js";
import {
  DOCS_CSS,
  DOCS_POLICY,
  DOCS_SCRIPT,
  docPage,
  docsKept,
  docsOf,
  notFoundPage,
  pageAt,
  pageMarkdown,
  searchAnswer,
  searchPage,
} from "./docs.js";
import type { Place } from "./hosts.js";
import { Limiter } from "./limit.js";
import {
  forgotPage,
  formPage,
  homePage,
  injectContext,
  messagePage,
  type Notice,
  type PageFrame,
  PORTAL_CSS,
  setPasswordPage,
  signInPage,
  signUpPage,
} from "./pages.js";
import { actorOf, endAppSession, readCookie, signInEndUser } from "./sessions.js";

interface Tenant {
  id: string;
  slug: string;
  name: string;
}

/** What an app's page may load and do. No inline script, and nothing from another site. */
const APP_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  // Components set styles on elements, which a policy without this would refuse.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join("; ");
/** The platform's own pages have no script at all. */
const PAGE_POLICY = [
  "default-src 'none'",
  "style-src 'self'",
  "img-src 'self'",
  "form-action 'self'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join("; ");

/** Which pages a reader said whether they helped: short marks of them, kept in their own browser. */
const VOTE_COOKIE = "vd_said";

/** A file whose name carries a hash of its content never changes, so a browser may keep it. */
const HASHED_NAME = /[-.][A-Za-z0-9_-]{8,}\.[A-Za-z0-9]+$/;
const MAX_FORM_BYTES = 16 * 1024;
/** A SAML answer is a signed document with certificates in it, in a form. */
const MAX_SAML_BYTES = 512 * 1024;

async function readForm(
  raw: IncomingMessage,
  limit = MAX_FORM_BYTES,
): Promise<Record<string, string>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of raw) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new HttpError(413, "payload_too_large", "The form is too large.");
    chunks.push(chunk as Buffer);
  }
  return Object.fromEntries(new URLSearchParams(Buffer.concat(chunks).toString("utf8")));
}

/** A place to send someone back to. Only a path on this same address is accepted. */
function safeReturn(raw: string | undefined | null): string | undefined {
  if (!raw?.startsWith("/") || raw.startsWith("//") || /[\\\r\n]/.test(raw)) return undefined;
  return raw.length <= 2000 ? raw : undefined;
}

function decodeSegments(path: string): string[] | null {
  try {
    return path.split("/").map((segment) => decodeURIComponent(segment));
  } catch {
    return null;
  }
}

/**
 * Serves everything that is not the API and not the console: apps, at each
 * kind of address, and the platform's own sign-in pages for them.
 *
 * It runs before routing, because what an address means depends on the name
 * the request came to. At a hostname a tenant registered, every path belongs
 * to that tenant's app, including paths the console also has.
 */
export function installFrontDoor(app: FastifyInstance, kernel: Kernel): void {
  const { db } = kernel;
  /** How often someone who is not signed in may ask for pages and files, and send forms. */
  const guestPages = new Limiter(600, 60);
  const forms = new Limiter(20, 60);
  /** Readers' answers to whether a page helped: a reader answers a few at most in a minute. */
  const votes = new Limiter(30, 60);

  const tenantBy = (column: "slug" | "id", value: string) =>
    db
      .selectFrom("tenant")
      .select(["id", "slug", "name"])
      .where(column, "=", value)
      .executeTakeFirst();

  async function frame(tenant: Tenant, workspaceId?: string): Promise<PageFrame> {
    const portal = await db
      .selectFrom("tenant_portal")
      .select(["logo_key", "icons"])
      .where("tenant_id", "=", tenant.id)
      .executeTakeFirst();
    const base = `/api/v1/tenants/${tenant.id}`;
    return {
      tenantName: tenant.name,
      themeHref: workspaceId ? `${base}/workspaces/${workspaceId}/theme.css` : `${base}/theme.css`,
      logoHref: portal?.logo_key ? `${base}/portal/logo` : undefined,
      // The tenant's own icons, when its logo gave it any.
      iconsHref:
        portal?.icons && Object.keys(portal.icons).length > 0 ? `${base}/portal/icons` : undefined,
    };
  }

  const html = (reply: FastifyReply, status: number, body: string) =>
    reply
      .code(status)
      .header("content-type", "text/html; charset=utf-8")
      .header("content-security-policy", PAGE_POLICY)
      .header("x-content-type-options", "nosniff")
      .header("referrer-policy", "same-origin")
      .header("cache-control", "no-store")
      .send(body);
  const plain = (reply: FastifyReply, status: number, text: string) =>
    reply
      .code(status)
      .header("content-type", "text/plain; charset=utf-8")
      .header("x-content-type-options", "nosniff")
      .send(`${text}\n`);
  const redirect = (reply: FastifyReply, to: string, status = 303) =>
    reply.code(status).header("location", to).header("cache-control", "no-store").send();

  const drawings = new Map<string, { body: Buffer; encoding?: string } | undefined>();
  /**
   * The diagram script, read once from the console's files, compressed as asked when a
   * compressed copy is there. Nothing when the console was not built.
   */
  const diagramsScript = (encoding: "br" | "gzip" | undefined) => {
    const key = encoding ?? "identity";
    if (drawings.has(key)) return drawings.get(key);
    const directory = consoleDirectory(kernel.config);
    const file = directory ? join(directory, "_platform", "diagrams.js") : undefined;
    let found: { body: Buffer; encoding?: string } | undefined;
    if (file && existsSync(file)) {
      const packed = encoding ? `${file}.${encoding === "br" ? "br" : "gz"}` : undefined;
      found =
        packed && existsSync(packed)
          ? { body: readFileSync(packed), encoding: encoding as string }
          : { body: readFileSync(file) };
    }
    drawings.set(key, found);
    return found;
  };

  /** A form must come from a page of the address it is sent to. */
  const ownForm = (request: FastifyRequest) => {
    const origin = request.headers.origin;
    return origin === undefined || origin === kernel.hosts.originOf(request);
  };

  const who = (principal: Principal) => principal.email ?? principal.name ?? "a service account";

  // ----- The sign-in pages -----

  async function portal(
    request: FastifyRequest,
    reply: FastifyReply,
    place: Place,
    tenant: Tenant,
    sub: string,
    query: URLSearchParams,
  ) {
    const base = portalPath(place, tenant.slug);
    const home = place.kind === "domain" ? "/" : `${base}/`;
    const look = await frame(tenant);
    const isPost = request.method === "POST";
    const sso = /^\/sso\/([0-9a-f-]{36})\/(start|callback|acs|finish|metadata)$/.exec(sub);
    if (sso) {
      return singleSignOn(request, reply, place, tenant, {
        base,
        home,
        look,
        id: sso[1] as string,
        step: sso[2] as string,
        query,
      });
    }
    if (isPost) {
      if (!ownForm(request)) return plain(reply, 403, "This form was sent from another site.");
      if (!forms.allow(`${request.ip} ${tenant.id}`)) {
        return plain(reply, 429, "Too many attempts. Wait a minute and try again.");
      }
    }
    const form = isPost ? await readForm(request.raw) : {};
    const back = safeReturn(isPost ? form.return : query.get("return"));
    const signUp = await signUpAllowed(db, tenant.id);

    if (sub === "" || sub === "/") {
      if (place.kind === "domain" && place.domain.appPath !== "") return redirect(reply, "/");
      const principal = await resolvePrincipal(kernel, request, tenant.id);
      const apps =
        principal.type === "anonymous" ? [] : await openableApps(place, tenant, principal);
      return html(
        reply,
        200,
        homePage(look, {
          portal: base,
          who: principal.type === "anonymous" ? undefined : who(principal),
          apps,
        }),
      );
    }

    if (sub === "/sign-in") {
      const providers = (await listProviders(db, tenant.id)).filter(
        (provider) => provider.audience === "end_users" && isLive(provider),
      );
      // Required of everyone, so there is no password to ask for.
      const password = (await endUserPasswordRefusedBy(db, tenant.id, "")) === undefined;
      const at = { portal: base, back, signUp, providers, password };
      if (!isPost) return html(reply, 200, signInPage(look, at));
      const required = await endUserPasswordRefusedBy(db, tenant.id, form.email ?? "");
      if (required) {
        await writeAudit(db, actorOf(request, ANONYMOUS), {
          action: "sso.password_refused",
          targetType: "identity_provider",
          targetId: required.id,
          tenantId: tenant.id,
          details: {
            identityProvider: required.name,
            email: (form.email ?? "").trim().toLowerCase(),
          },
        });
        return html(
          reply,
          403,
          signInPage(
            look,
            { ...at, email: form.email ?? "" },
            {
              kind: "danger",
              text: `Sign in with ${required.name}. Passwords are turned off for your account.`,
            },
          ),
        );
      }
      const user = await checkEndUserPassword(
        kernel,
        tenant.id,
        form.email ?? "",
        form.password ?? "",
      );
      if (!user) {
        return html(
          reply,
          401,
          signInPage(
            look,
            { ...at, email: form.email ?? "" },
            { kind: "danger", text: "The email or the password is not right." },
          ),
        );
      }
      await signInEndUser(kernel, request, reply, tenant.id, user.id);
      return redirect(reply, back ?? home);
    }

    if (sub === "/sign-up") {
      if (!signUp) return html(reply, 404, messagePage(look, NO_SIGN_UP(base)));
      const at = { portal: base, back, minPassword: MIN_PASSWORD_LENGTH };
      if (!isPost) return html(reply, 200, signUpPage(look, at));
      try {
        const required = await endUserPasswordRefusedBy(db, tenant.id, form.email ?? "");
        if (required) {
          throw new HttpError(
            403,
            "sso_required",
            `Sign in with ${required.name}. Passwords are turned off for this email address.`,
          );
        }
        const user = await db.transaction().execute((trx) =>
          createEndUser(
            kernel,
            trx,
            (input) => writeAudit(trx, actorOf(request, ANONYMOUS), input),
            {
              tenantId: tenant.id,
              email: form.email ?? "",
              password: form.password ?? "",
              ...(form.name ? { name: form.name } : {}),
            },
            "signed_up",
          ),
        );
        await signInEndUser(kernel, request, reply, tenant.id, user.id);
        return redirect(reply, back ?? home);
      } catch (error) {
        if (!(error instanceof HttpError)) throw error;
        return html(
          reply,
          error.statusCode,
          signUpPage(
            look,
            { ...at, email: form.email ?? "", name: form.name ?? "" },
            {
              kind: "danger",
              text:
                error.statusCode === 409
                  ? "That email already has an account. Sign in, or ask for a new password."
                  : error.message,
            },
          ),
        );
      }
    }

    if (sub === "/set-password") {
      const token = (isPost ? form.token : query.get("token")) ?? "";
      const invited = token === "" ? undefined : await readPasswordToken(db, tenant.id, token);
      if (!invited) return html(reply, 410, messagePage(look, LINK_EXPIRED(base)));
      const at = {
        portal: base,
        token,
        email: invited.email,
        invitation: invited.purpose === "invite",
        minPassword: MIN_PASSWORD_LENGTH,
      };
      if (!isPost) return html(reply, 200, setPasswordPage(look, at));
      try {
        const user = await db
          .transaction()
          .execute((trx) =>
            setPasswordWithToken(
              kernel,
              trx,
              (input) => writeAudit(trx, actorOf(request, ANONYMOUS), input),
              { tenantId: tenant.id, token, password: form.password ?? "" },
            ),
          );
        await signInEndUser(kernel, request, reply, tenant.id, user.id);
        return redirect(reply, home);
      } catch (error) {
        if (!(error instanceof HttpError)) throw error;
        if (error.statusCode === 410)
          return html(reply, 410, messagePage(look, LINK_EXPIRED(base)));
        return html(
          reply,
          error.statusCode,
          setPasswordPage(look, at, { kind: "danger", text: error.message }),
        );
      }
    }

    if (sub === "/forgot") {
      const mail = kernel.mail.configured;
      if (!isPost || !mail) return html(reply, 200, forgotPage(look, { portal: base, mail }));
      const email = (form.email ?? "").trim().toLowerCase();
      const user = await db
        .selectFrom("end_user")
        .select(["id", "email"])
        .where("tenant_id", "=", tenant.id)
        .where("email", "=", email)
        .where("disabled_at", "is", null)
        .executeTakeFirst();
      if (user) {
        const made = await db.transaction().execute(async (trx) => {
          const token = await createPasswordToken(
            trx,
            { id: user.id, tenantId: tenant.id },
            "reset",
          );
          await writeAudit(trx, actorOf(request, ANONYMOUS), {
            action: "end_user.reset_requested",
            targetType: "end_user",
            targetId: user.id,
            tenantId: tenant.id,
          });
          return token;
        });
        const address = portalUrl(
          kernel,
          tenant.slug,
          place.kind === "domain" ? place.domain.hostname : undefined,
        );
        // Not awaited: how long sending takes must not tell an account from none.
        void kernel.mail.send({
          to: user.email,
          subject: `Reset your password at ${tenant.name}`,
          text: `Open this link to choose a new password for your account at ${tenant.name}:\n${address}/set-password?token=${made.token}\n\nThe link works once, until ${made.expiresAt.toUTCString()}. If you did not ask for it, you can ignore this message.\n`,
        });
      }
      return html(
        reply,
        200,
        forgotPage(
          look,
          { portal: base, mail },
          { kind: "success", text: "If that email has an account, a link is on its way." },
        ),
      );
    }

    const formAt = /^\/forms\/(vxf_[A-Za-z0-9_-]{10,80})$/.exec(sub);
    if (formAt) {
      const found = await findForm(kernel, tenant.id, formAt[1] as string);
      if (!found) {
        return html(
          reply,
          404,
          messagePage(look, {
            title: "This form is not here",
            text: "The address may be wrong, or the form may have been taken down.",
          }),
        );
      }
      const { form: asked } = found;
      const own = await frame(tenant, found.state.workspace_id);
      const action = `${base}/forms/${formAt[1]}`;
      let by: { type: string; id: string } | undefined;
      if (asked.access === "signed_in") {
        const principal = await resolvePrincipal(kernel, request, tenant.id);
        if (principal.type === "anonymous" || !principal.id) {
          return redirect(reply, `${base}/sign-in?return=${encodeURIComponent(action)}`);
        }
        by = { type: principal.type, id: principal.id };
      }
      if (found.paused) {
        return html(
          reply,
          503,
          messagePage(own, {
            title: asked.title,
            text: "This form is not taking answers at the moment. Try again later.",
          }),
        );
      }
      if (!isPost) {
        return html(reply, 200, formPage(own, { action, form: asked, key: randomUUID() }));
      }
      const thanks = () =>
        html(
          reply,
          200,
          messagePage(own, {
            title: asked.title,
            text: asked.success ?? "Thank you. Your answer was sent.",
          }),
        );
      // A field no person sees was filled in. Whatever sent this is told it worked, and nothing starts.
      if ((form.website ?? "") !== "") return thanks();
      const key = /^[0-9a-f-]{36}$/.test(form.key ?? "") ? (form.key as string) : randomUUID();
      const { input, problems } = readFormAnswer(asked, form);
      const again = (text: string, status = 400) =>
        html(
          reply,
          status,
          formPage(
            own,
            { action, form: asked, key, sent: form, problems },
            { kind: "danger", text },
          ),
        );
      if (Object.keys(problems).length > 0) return again("Some answers need another look.");
      try {
        await submitForm(kernel, found, input, by, key);
      } catch (error) {
        if (!(error instanceof HttpError)) throw error;
        kernel.log.warn(
          { form: found.state.path, reason: error.message },
          "a form's answer could not start what the form starts",
        );
        return again("This could not be sent. Try again later.", 502);
      }
      return thanks();
    }

    if (sub === "/sign-out" && isPost) {
      const principal = await resolvePrincipal(kernel, request, tenant.id);
      await db.transaction().execute(async (trx) => {
        const ended = await endAppSession(trx, request, reply, tenant.id);
        if (ended) {
          await writeAudit(trx, actorOf(request, principal), {
            action: "app_session.ended",
            targetType: ended.type,
            targetId: ended.id,
            tenantId: tenant.id,
          });
        }
      });
      return redirect(reply, `${base}/sign-in`);
    }

    if (sub === "/staff" && !isPost) {
      if (place.kind === "main") {
        const principal = await resolvePrincipal(kernel, request, tenant.id);
        if (principal.type === "member") return redirect(reply, back ?? home);
        // The console signs a member in, then sends them back here.
        return redirect(reply, `/?return=${encodeURIComponent(back ?? home)}`);
      }
      const handoff = new URL("/api/v1/app-handoffs/start", kernel.hosts.mainOrigin);
      handoff.searchParams.set("tenant", tenant.id);
      handoff.searchParams.set("to", kernel.hosts.originOf(request));
      handoff.searchParams.set("return", back ?? home);
      return redirect(reply, handoff.toString());
    }

    return html(reply, 404, messagePage(look, NOT_FOUND(home)));
  }

  // ----- Single sign-on for end users -----

  const starts = new Limiter(30, 60);
  /** Many people of one organization share an address, so this is generous. It is there to stop a flood. */
  const answers = new Limiter(300, 60);

  /**
   * An end user's single sign-on. It begins and ends at the address the person
   * is at, which may be a hostname the tenant registered. The provider answers
   * at one address only, the instance's own for apps, so that a provider is
   * given one address however many hostnames a tenant has.
   */
  async function singleSignOn(
    request: FastifyRequest,
    reply: FastifyReply,
    place: Place,
    tenant: Tenant,
    at: {
      base: string;
      home: string;
      look: PageFrame;
      id: string;
      step: string;
      query: URLSearchParams;
    },
  ) {
    const { look } = at;
    const isPost = request.method === "POST";
    const missing = () => html(reply, 404, messagePage(look, NOT_FOUND(at.home)));
    const provider = await findProvider(db, at.id, tenant.id);
    if (provider?.audience !== "end_users") return missing();
    const actor = actorOf(request, ANONYMOUS);
    const here = portalUrl(
      kernel,
      tenant.slug,
      place.kind === "domain" ? place.domain.hostname : undefined,
    );
    const canonical = portalUrl(kernel, tenant.slug);
    const refusedPage = (refusal: SsoRefusal) =>
      html(
        reply,
        403,
        messagePage(look, {
          title: "You could not be signed in",
          text: refusal.message,
          link: { href: `${at.base}/sign-in`, label: "Back to sign-in" },
        }),
      );
    const cookie = (name: string, value: string, maxAge: number) =>
      [
        `${name}=${value}`,
        "Path=/",
        "HttpOnly",
        "SameSite=Lax",
        `Max-Age=${maxAge}`,
        ...(request.protocol === "https" ? ["Secure"] : []),
      ].join("; ");

    if (at.step === "start" && !isPost) {
      if (!starts.allow(`${request.ip} ${tenant.id}`)) {
        return plain(reply, 429, "Too many attempts. Wait a minute and try again.");
      }
      try {
        const back = safeReturn(at.query.get("return"));
        const began = await begin(kernel, provider, {
          purpose: "sign_in",
          base: here,
          ...(back ? { returnTo: back } : {}),
        });
        reply.header("set-cookie", cookie(began.cookie.name, began.cookie.value, 600));
        return redirect(reply, began.url, 302);
      } catch (error) {
        if (!(error instanceof SsoRefusal)) throw error;
        await writeAudit(db, actor, {
          action: "sso.refused",
          targetType: "identity_provider",
          targetId: provider.id,
          tenantId: tenant.id,
          details: {
            identityProvider: provider.name,
            reason: error.reason,
            message: error.message,
          },
        });
        return refusedPage(error);
      }
    }

    if (at.step === "metadata" && !isPost) {
      if (!isSaml(provider)) return missing();
      return reply
        .code(200)
        .header("content-type", "application/samlmetadata+xml; charset=utf-8")
        .header("x-content-type-options", "nosniff")
        .send(
          samlMetadata(
            provider,
            await openSecrets(kernel, db, provider),
            addressesOf(kernel, provider, tenant.slug),
          ),
        );
    }

    if ((at.step === "callback" && !isPost) || (at.step === "acs" && isPost)) {
      // The provider was given the instance's own address for apps, and answers nowhere else.
      if (place.kind === "domain") return missing();
      if (!answers.allow(`${request.ip} ${tenant.id}`)) {
        return plain(reply, 429, "Too many attempts. Wait a minute and try again.");
      }
      try {
        const result = await answer(
          kernel,
          provider,
          isPost
            ? { protocol: "saml", body: await readForm(request.raw, MAX_SAML_BYTES) }
            : { protocol: "oidc", query: at.query },
          actor,
          canonical,
        );
        if (result.purpose === "test") {
          return html(
            reply,
            200,
            messagePage(look, {
              title: result.ok ? "The provider answered" : "The test did not pass",
              text: "Close this tab and look at the result in the console.",
            }),
          );
        }
        return redirect(reply, result.finishUrl, 302);
      } catch (error) {
        if (!(error instanceof SsoRefusal)) throw error;
        return refusedPage(error);
      }
    }

    if (at.step === "finish" && !isPost) {
      const done = await finish(
        db,
        {
          code: at.query.get("code") ?? "",
          base: here,
          audience: "end_users",
          cookie: (name) => readCookie(request, name),
        },
        actor,
      );
      if (!done || done.tenantId !== tenant.id) {
        return html(
          reply,
          410,
          messagePage(look, {
            title: "This sign-in did not finish",
            text: "It took too long, was already used, or was begun in another browser. Start again.",
            link: { href: `${at.base}/sign-in`, label: "Back to sign-in" },
          }),
        );
      }
      await signInEndUser(kernel, request, reply, tenant.id, done.principalId);
      reply.header("set-cookie", cookie(stateCookie(done.stateId), "", 0));
      return redirect(reply, safeReturn(done.returnTo) ?? at.home, 302);
    }

    return missing();
  }

  /** The apps of a tenant's production workspaces that a principal may open, with where each is. */
  async function openableApps(place: Place, tenant: Tenant, principal: Principal) {
    let query = db
      .selectFrom("resource")
      .innerJoin("workspace", "workspace.id", "resource.workspace_id")
      .select([
        "resource.id",
        "resource.path",
        "resource.body",
        "resource.workspace_id",
        "workspace.slug",
      ])
      .where("resource.tenant_id", "=", tenant.id)
      .where("resource.kind", "=", "app")
      .where("workspace.active_bundle_id", "is not", null);
    query =
      place.kind === "domain"
        ? // A hostname for the portal serves the apps of its own workspace.
          query.where("workspace.id", "=", place.domain.workspaceId)
        : // A dev workspace's copy of an app is for the people working on it, who have its address.
          query.where("workspace.type", "=", "production");
    const rows = await query
      .orderBy("workspace.slug")
      .orderBy("resource.path")
      .limit(100)
      .execute();
    const apps: { href: string; title: string; description: string | undefined }[] = [];
    for (const row of rows) {
      const decision = await check(db, principal, "app:read", {
        tenantId: tenant.id,
        workspaceId: row.workspace_id,
        resourceId: row.id,
      });
      if (!decision.allowed) continue;
      const body = row.body as { title?: string; description?: string; published?: boolean };
      if (body.published === false) continue;
      apps.push({
        href: appBasePath(place, {
          tenantSlug: tenant.slug,
          workspaceSlug: row.slug,
          path: row.path,
        }),
        title: body.title ?? row.path,
        description: body.description,
      });
    }
    return apps;
  }

  // ----- An app -----

  async function serveApp(
    request: FastifyRequest,
    reply: FastifyReply,
    place: Place,
    tenant: Tenant,
    workspace: { id: string; slug: string; active_bundle_id: string | null },
    /** The path under the workspace: the app's path, then the file's. */
    rest: string,
    /** Set at a registered hostname, where the app is known and `rest` is the file's path. */
    fixedApp?: string,
  ) {
    const look = await frame(tenant, workspace.id);
    const home = place.kind === "domain" ? "/" : `${portalPath(place, tenant.slug)}/`;
    const missing = () => html(reply, 404, messagePage(look, NOT_FOUND(home)));
    // A docs app with the workspace's drafts laid over it, under `_draft`: a preview for its
    // writers. It is looked for first, since an app that is only a draft is in no bundle.
    const preview =
      fixedApp !== undefined
        ? /^_draft(?:\/(.*))?$/.exec(rest)
        : /^(.+?)\/_draft(?:\/(.*))?$/.exec(rest);
    if (preview) {
      const appPath = fixedApp ?? (preview[1] as string);
      const file = (fixedApp !== undefined ? preview[1] : preview[2]) ?? "";
      return serveDraftDocs(request, reply, place, tenant, workspace, appPath, file, look, missing);
    }
    if (!workspace.active_bundle_id) return missing();
    const stored = await db
      .selectFrom("bundle")
      .select(["id", "storage_key"])
      .where("id", "=", workspace.active_bundle_id)
      .executeTakeFirst();
    if (!stored) return missing();
    const bundle = await loadBundle(kernel, stored);
    const manifest = bundle.manifests
      .filter((candidate) => candidate.kind === "app")
      .sort((a, b) => b.path.length - a.path.length)
      .find((candidate) =>
        fixedApp !== undefined
          ? candidate.path === fixedApp
          : rest === candidate.path || rest.startsWith(`${candidate.path}/`),
      );
    if (!manifest && fixedApp === undefined) {
      // An app that was renamed: its old address sends the browser to the new one, for good.
      const aliases = await db
        .selectFrom("resource_alias")
        .innerJoin("resource", "resource.id", "resource_alias.resource_id")
        .select(["resource_alias.path", "resource.path as now"])
        .where("resource_alias.workspace_id", "=", workspace.id)
        .where("resource_alias.kind", "=", "app")
        .where("resource_alias.expires_at", ">", new Date())
        .execute();
      const alias = aliases
        .sort((a, b) => b.path.length - a.path.length)
        .find((candidate) => rest === candidate.path || rest.startsWith(`${candidate.path}/`));
      const [address = "", query] = request.url.split("?", 2);
      if (alias && address.endsWith(rest)) {
        const moved = `${address.slice(0, address.length - rest.length)}${alias.now}${rest.slice(alias.path.length)}`;
        return reply.redirect(query === undefined ? moved : `${moved}?${query}`, 308);
      }
    }
    if (!manifest) return missing();
    const body = manifest.body as {
      title: string;
      entry?: string;
      /** Set on an app that serves an interface: its files are the platform's own. */
      interface?: string;
      /** Set on an app that serves documentation: its pages are drawn here, from the workspace's own. */
      docs?: string;
      /** Set on a docs app that asks its readers whether a page helped: where the answers go. */
      feedback?: { table?: unknown };
      /** False on a docs app that is switched off: its pages and the app are kept, and it is not served. */
      published?: boolean;
      fallback?: boolean;
    };
    const documents = typeof body.docs === "string";
    if (documents && body.published === false) return missing();
    // The one answer an app takes is a docs app's, from its readers.
    if (!(request.method === "GET" || request.method === "HEAD") && !documents) {
      return plain(reply, 405, "Method not allowed.");
    }
    // Neither runs anything a tenant wrote: an interface is drawn by the platform's own
    // files, and documentation is drawn here.
    const generated = typeof body.interface === "string" || documents;
    // An app written as code runs only at an address of its own, never where the console's
    // sign-in is, unless the operator knowingly allowed it (decision 0001).
    if (
      !generated &&
      place.kind === "main" &&
      !kernel.hosts.runsCodeApps(place)
    ) {
      return html(
        reply,
        503,
        messagePage(look, {
          title: "This app is not served at this address",
          text:
            "Apps written as code run at a separate address for apps, so that they never run " +
            "where the console's sign-in is. This instance has none yet: whoever runs it sets " +
            "APPS_URL.",
        }),
      );
    }
    const entry = generated ? "index.html" : (body.entry as string);
    const base = appBasePath(place, {
      tenantSlug: tenant.slug,
      workspaceSlug: workspace.slug,
      path: manifest.path,
    });
    const url = new URL(request.url, "http://app");
    if (fixedApp === undefined && rest === manifest.path) {
      // Without the slash, the page's own relative addresses would point beside the app.
      return redirect(reply, `${base}${url.search}`, 308);
    }
    const file = fixedApp !== undefined ? rest : rest.slice(manifest.path.length + 1);

    const principal = await resolvePrincipal(kernel, request, tenant.id);
    if (principal.type === "anonymous" && !guestPages.allow(request.ip)) {
      return plain(reply, 429, "Too many requests. Wait a minute and try again.");
    }
    const resource = await db
      .selectFrom("resource")
      .select("id")
      .where("workspace_id", "=", workspace.id)
      .where("kind", "=", "app")
      .where("path", "=", manifest.path)
      .executeTakeFirst();
    if (!resource) return missing();
    const decision = await check(db, principal, "app:read", {
      tenantId: tenant.id,
      workspaceId: workspace.id,
      resourceId: resource.id,
    });
    const portal = portalPath(place, tenant.slug);
    if (!decision.allowed) {
      if (principal.type === "anonymous") {
        return redirect(
          reply,
          `${portal}/sign-in?return=${encodeURIComponent(`${url.pathname}${url.search}`)}`,
        );
      }
      return html(reply, 403, messagePage(look, NOT_ALLOWED, { portal, who: who(principal) }));
    }

    if (documents) {
      // A picture kept beside the pages is one of the app's files, and is served as any app's file is.
      const pictures = appFiles(bundle, manifest.path);
      if (!pictures.has(file))
        return serveDocs(request, reply, {
          look,
          tenantId: tenant.id,
          workspaceId: workspace.id,
          bundleId: stored.id,
          resources: bundle.manifests,
          app: {
            path: manifest.path,
            key: keyOf(manifest),
            title: body.title,
            docs: body.docs as string,
            ...(typeof body.feedback?.table === "string" ? { feedback: body.feedback.table } : {}),
          },
          base,
          file,
          pictures,
        });
    }

    // The files that draw an interface. A docs app has none of them: what is left to serve
    // of one, past this point, is a picture of its own.
    const runtime = generated && !documents ? await kernel.screens.files() : undefined;
    if (runtime && runtime.size === 0) {
      return html(
        reply,
        503,
        messagePage(look, {
          title: "This app cannot be shown here",
          text: "This instance was started without the files that draw apps made in the console. Whoever runs it needs to set SCREENS_DIR.",
        }),
      );
    }
    const files: Map<string, { path: string; sha256: string; contentType: string }> =
      runtime ?? appFiles(bundle, manifest.path);
    let asset = file === "" ? undefined : files.get(file);
    // An address that names no file is a screen of the app, which the page itself draws.
    const isPage =
      !asset && (file === "" || (body.fallback !== false && !/\.[A-Za-z0-9]+$/.test(file)));
    if (isPage) asset = files.get(entry);
    if (!asset) return missing();

    reply
      .header("content-security-policy", APP_POLICY)
      .header("x-content-type-options", "nosniff")
      .header("referrer-policy", "same-origin");
    const content =
      runtime?.get(asset.path)?.content ?? (await readAsset(kernel, tenant.id, asset.sha256));
    if (isPage || asset.path === entry) {
      const page = injectContext(content.toString("utf8"), {
        base,
        themeHref: look.themeHref,
        iconsHref: look.iconsHref,
        data: {
          api: "/api/v1",
          tenant: {
            id: tenant.id,
            slug: tenant.slug,
            name: tenant.name,
            logo: look.logoHref !== undefined,
          },
          workspace: { id: workspace.id, slug: workspace.slug },
          app: {
            path: manifest.path,
            title: body.title,
            ...(generated ? { interface: body.interface } : {}),
          },
          base,
          portal,
          principal: {
            type: principal.type,
            id: principal.id,
            name: principal.name ?? null,
            email: principal.email ?? null,
            ...(await endUserIdentity(db, tenant.id, principal)),
            // A page made in the console shows some widgets only to some groups: a member's
            // groups come too, named and keyed as an end user's are.
            ...(generated && principal.type === "member" && principal.id
              ? await memberGroups(db, tenant.id, principal.id)
              : {}),
          },
        },
      });
      return reply
        .code(200)
        .header("content-type", "text/html; charset=utf-8")
        .header("cache-control", "no-store")
        .send(page);
    }
    const etag = `"${asset.sha256}"`;
    reply.header("etag", etag).header(
      "cache-control",
      // Private: the file was served to someone who may open the app, and to no cache for others.
      HASHED_NAME.test(asset.path) ? "private, max-age=31536000, immutable" : "private, no-cache",
    );
    if (request.headers["if-none-match"] === etag) return reply.code(304).send();
    return reply.code(200).header("content-type", asset.contentType).send(content);
  }

  /** A page's source among resources, by its path in the workspace. */
  function sourceIn(resources: readonly ResourceLike[], path: string): string | undefined {
    const found = resources.find((one) => one.kind === "doc" && one.path === path);
    const source = (found?.body as { source?: unknown } | undefined)?.source;
    return typeof source === "string" ? source : undefined;
  }

  /** What a docs app answers its own script with. Private, as the page it was asked from. */
  function sendJson(reply: FastifyReply, body: unknown, preview = false) {
    return reply
      .code(200)
      .header("content-type", "application/json; charset=utf-8")
      .header("x-content-type-options", "nosniff")
      .header("cache-control", preview ? "no-store" : "private, no-cache")
      .send(JSON.stringify(body));
  }

  /** A page's Markdown, for whoever may read the page. */
  function sendMarkdown(reply: FastifyReply, body: string, preview = false) {
    return reply
      .code(200)
      .header("content-type", "text/markdown; charset=utf-8")
      .header("x-content-type-options", "nosniff")
      .header("content-security-policy", "default-src 'none'; sandbox")
      .header("cache-control", preview ? "no-store" : "private, no-cache")
      .send(body);
  }

  /**
   * Answers an address under a docs app, for someone who may open the app:
   * a page, a search, or the page a renamed one moved to.
   */
  async function serveDocs(
    request: FastifyRequest,
    reply: FastifyReply,
    at: {
      look: PageFrame;
      tenantId: string;
      workspaceId: string;
      bundleId: string;
      resources: readonly ResourceLike[];
      app: DocsApp;
      base: string;
      /** What follows the app's own address. */
      file: string;
      /** The app's own files: the pictures its pages show. */
      pictures: ReadonlyMap<string, unknown>;
    },
  ) {
    // When each page last changed: read once for each deployed bundle, with its pages.
    const updated = docsKept(at.bundleId, at.app)
      ? undefined
      : new Map(
          (
            await db
              .selectFrom("resource")
              .select(["path", "updated_at"])
              .where("workspace_id", "=", at.workspaceId)
              .where("kind", "=", "doc")
              .where("path", "like", `${at.app.docs}/%`)
              .execute()
          ).map((row) => [row.path, row.updated_at] as const),
        );
    const docs = docsOf(at.bundleId, at.app, at.resources, productNames(kernel.config), updated);
    // The pages this reader said whether they helped, kept in their browser and nowhere else.
    const voted = new Set((readCookie(request, VOTE_COOKIE) ?? "").split(".").filter(Boolean));
    const voteOf = (page: string) =>
      createHash("sha256").update(`${at.app.path}:${page}`).digest("hex").slice(0, 10);
    const drawn = {
      frame: at.look,
      app: at.app,
      base: at.base,
      set: docs.built.set,
      asset: (file: string) => (at.pictures.has(file) ? `${at.base}${file}` : undefined),
      ...(at.app.feedback
        ? { feedback: { said: (page: string) => voted.has(voteOf(page)), recording: true } }
        : {}),
    };
    const send = (status: number, body: string) =>
      reply
        .code(status)
        .header("content-type", "text/html; charset=utf-8")
        .header("content-security-policy", DOCS_POLICY)
        .header("x-content-type-options", "nosniff")
        .header("referrer-policy", "same-origin")
        // Private: it was drawn for someone who may open the app. Checked again each time.
        .header("cache-control", "private, no-cache")
        .send(body);

    if (at.file === "_feedback") {
      if (request.method !== "POST" || !at.app.feedback) return send(404, notFoundPage(drawn));
      if (!ownForm(request)) return plain(reply, 403, "This form was sent from another site.");
      if (!votes.allow(`${request.ip} ${at.workspaceId}`)) {
        return plain(reply, 429, "Too many answers. Wait a minute and try again.");
      }
      const form = await readForm(request.raw, 2048);
      const page = pageAt(docs.built.set, String(form.page ?? ""));
      if (page === undefined || (form.helpful !== "yes" && form.helpful !== "no")) {
        return plain(reply, 400, "Say which page, and whether it helped.");
      }
      const id = voteOf(page);
      // A field no person sees, filled in, is a robot's: it is thanked, and nothing is kept.
      if (!form.website && !voted.has(id)) {
        try {
          const table = await pathNow(db, at.workspaceId, at.app.feedback, "table");
          const target = await describeTable(
            (await kernel.data.forTenant(at.tenantId)).owner,
            at.workspaceId,
            table,
          );
          // Kept as the workspace keeps a row its own code writes: nothing says who the reader is.
          const scope = { principalId: null, all: true };
          await withData(kernel, at.tenantId, scope, (data) =>
            insertRows(
              data,
              target,
              [
                {
                  // The app's key, which a rename keeps; and its name, for people to read.
                  site_key: at.app.key ?? at.app.path,
                  site: at.app.title,
                  page,
                  helpful: form.helpful === "yes",
                  version: at.bundleId,
                  at: new Date().toISOString(),
                },
              ],
              scope,
            ),
          );
        } catch (error) {
          request.log.warn({ err: error }, "A reader's answer could not be kept.");
          return plain(reply, 503, "Your answer could not be kept. Try again later.");
        }
      }
      const kept = [...voted, id].filter((one, at, all) => all.indexOf(one) === at).slice(-200);
      reply.header(
        "set-cookie",
        [
          `${VOTE_COOKIE}=${kept.join(".")}`,
          `Path=${at.base}`,
          "HttpOnly",
          "SameSite=Lax",
          `Max-Age=${60 * 60 * 24 * 365}`,
          ...(request.protocol === "https" ? ["Secure"] : []),
        ].join("; "),
      );
      if ((request.headers.accept ?? "").includes("application/json")) {
        return sendJson(reply, { kept: true });
      }
      return redirect(reply, `${at.base}${urlOf(page)}#feedback`);
    }
    const asked = request.query as { q?: unknown; in?: unknown } | undefined;
    const query = String(asked?.q ?? "").slice(0, 200);
    if (at.file === "_search") {
      return send(200, searchPage(drawn, query, docs.search.search(query, 30)));
    }
    if (at.file === "_search.json") {
      const collection = typeof asked?.in === "string" ? asked.in.slice(0, 255) : undefined;
      return sendJson(
        reply,
        searchAnswer(drawn, docs.search.grouped(query, collection ? { collection } : {})),
      );
    }
    const markdown = pageMarkdown(docs.built.set, at.file, (page) =>
      sourceIn(at.resources, `${at.app.docs}/${page}`),
    );
    if (markdown !== undefined) return sendMarkdown(reply, markdown);
    const path = pageAt(docs.built.set, at.file);
    if (path !== undefined) return send(200, docPage(drawn, path));

    // A page that was renamed: its old address sends the browser to the new one, for good.
    const wanted = `${at.app.docs}/${at.file.replace(/\/+$/, "")}`;
    const moved = await db
      .selectFrom("resource_alias")
      .innerJoin("resource", "resource.id", "resource_alias.resource_id")
      .select("resource.path as now")
      .where("resource_alias.workspace_id", "=", at.workspaceId)
      .where("resource_alias.kind", "=", "doc")
      .where("resource_alias.path", "in", [wanted, `${wanted}/index`])
      .where("resource_alias.expires_at", ">", new Date())
      .executeTakeFirst();
    if (moved?.now.startsWith(`${at.app.docs}/`)) {
      const now = moved.now.slice(at.app.docs.length + 1);
      if (docs.built.set.pages.has(now)) return redirect(reply, `${at.base}${urlOf(now)}`, 308);
    }
    return send(404, notFoundPage(drawn));
  }

  /**
   * A docs app as it would be if every draft of the workspace's documentation
   * were deployed now. Only a member who may read the workspace's
   * documentation in the console sees it, whoever the app itself is bound to:
   * a draft is not for the app's readers yet. To anyone else it is not there.
   */
  async function serveDraftDocs(
    request: FastifyRequest,
    reply: FastifyReply,
    place: Place,
    tenant: Tenant,
    workspace: { id: string; slug: string; active_bundle_id: string | null },
    appPath: string,
    file: string,
    look: PageFrame,
    missing: () => unknown,
  ) {
    const principal = await resolvePrincipal(kernel, request, tenant.id);
    if (principal.type !== "member") return missing();
    const at = { tenantId: tenant.id, workspaceId: workspace.id };
    const reads =
      (await check(db, principal, "doc:read", at)).allowed ||
      (await check(db, principal, "resource:read", at)).allowed;
    if (!reads) return missing();
    const { resources, apps } = await workingDocs(db, workspace.id);
    const app = apps.find((one) => one.path === appPath);
    if (!app) return missing();
    const { set } = buildApp(
      app,
      resources.filter((one) => one.state !== "removed"),
    );
    // Pictures are the deployed app's: a picture is not drafted in the console.
    const stored = workspace.active_bundle_id
      ? await db
          .selectFrom("bundle")
          .select(["id", "storage_key"])
          .where("id", "=", workspace.active_bundle_id)
          .executeTakeFirst()
      : undefined;
    const pictures = stored
      ? appFiles(await loadBundle(kernel, stored), app.path)
      : new Map<string, unknown>();
    const served = appBasePath(place, {
      tenantSlug: tenant.slug,
      workspaceSlug: workspace.slug,
      path: app.path,
    });
    const drawn = {
      frame: look,
      app,
      base: `${served}_draft/`,
      set,
      asset: (picture: string) => (pictures.has(picture) ? `${served}${picture}` : undefined),
      notice:
        "A preview, with the workspace's drafts. Only members who may read its documentation see this. Its readers see what is deployed.",
      // Readers are asked whether a page helped. Nothing said in a preview is kept.
      ...(app.feedback ? { feedback: { said: () => false, recording: false } } : {}),
    };
    const send = (status: number, body: string) =>
      reply
        .code(status)
        .header("content-type", "text/html; charset=utf-8")
        .header("content-security-policy", DOCS_POLICY)
        .header("x-content-type-options", "nosniff")
        .header("x-robots-tag", "noindex")
        .header("referrer-policy", "same-origin")
        .header("cache-control", "no-store")
        .send(body);
    const asked = request.query as { q?: unknown; in?: unknown } | undefined;
    const query = String(asked?.q ?? "").slice(0, 200);
    if (file === "_search" || file === "_search.json") {
      const index = loadSearchIndex(buildSearchIndex(set));
      if (file === "_search") return send(200, searchPage(drawn, query, index.search(query, 30)));
      const collection = typeof asked?.in === "string" ? asked.in.slice(0, 255) : undefined;
      return sendJson(
        reply,
        searchAnswer(drawn, index.grouped(query, collection ? { collection } : {})),
        true,
      );
    }
    const markdown = pageMarkdown(set, file, (page) => sourceIn(resources, `${app.docs}/${page}`));
    if (markdown !== undefined) return sendMarkdown(reply, markdown, true);
    const path = pageAt(set, file);
    return path === undefined ? send(404, notFoundPage(drawn)) : send(200, docPage(drawn, path));
  }

  // ----- Which is which -----

  app.addHook("onRequest", async (request, reply) => {
    const url = new URL(request.url, "http://app");
    const path = url.pathname;
    if (path === "/api" || path.startsWith("/api/")) return;
    const place = await kernel.hosts.place(request);
    const isPage = request.method === "GET" || request.method === "HEAD";
    if (!isPage && request.method !== "POST") {
      if (place.kind === "main" && !path.startsWith("/apps/") && !path.startsWith("/portal/"))
        return;
      return plain(reply, 405, "Method not allowed.");
    }

    if (path === "/_platform/docs.css" || path === "/_platform/docs.js") {
      const script = path.endsWith(".js");
      return reply
        .code(200)
        .header("content-type", `${script ? "text/javascript" : "text/css"}; charset=utf-8`)
        .header("x-content-type-options", "nosniff")
        .header("cache-control", "public, max-age=3600")
        .send(script ? DOCS_SCRIPT : DOCS_CSS);
    }

    // What draws a diagram on a page of documentation: Mermaid, and the instance's own pan and
    // zoom. It is built with the console and fetched only by a page that has a diagram.
    if (path === "/_platform/diagrams.js") {
      // The console's build writes compressed copies beside it: the best the browser takes is sent.
      const accepts = String(request.headers["accept-encoding"] ?? "");
      const encoding = /\bbr\b/.test(accepts)
        ? "br"
        : /\bgzip\b/.test(accepts)
          ? "gzip"
          : undefined;
      const drawing = diagramsScript(encoding);
      if (drawing === undefined) return plain(reply, 404, "Not found.");
      if (drawing.encoding) reply.header("content-encoding", drawing.encoding);
      return reply
        .code(200)
        .header("content-type", "text/javascript; charset=utf-8")
        .header("vary", "accept-encoding")
        .header("x-content-type-options", "nosniff")
        .header("cache-control", "public, max-age=3600")
        .send(drawing.body);
    }

    if (path === "/_platform/portal.css") {
      return reply
        .code(200)
        .header("content-type", "text/css; charset=utf-8")
        .header("x-content-type-options", "nosniff")
        .header("cache-control", "public, max-age=3600")
        .send(PORTAL_CSS);
    }

    if (place.kind === "domain") {
      const tenant = await tenantBy("id", place.domain.tenantId);
      const workspace = await db
        .selectFrom("workspace")
        .select(["id", "slug", "active_bundle_id"])
        .where("id", "=", place.domain.workspaceId)
        .executeTakeFirst();
      if (!tenant || !workspace) return plain(reply, 404, "Not found.");
      if (path === "/_" || path.startsWith("/_/")) {
        return portal(request, reply, place, tenant, path.slice(2), url.searchParams);
      }
      const everything = place.domain.appPath === "";
      // A hostname for the portal has the portal's home at its root.
      if (everything && path === "/") {
        return portal(request, reply, place, tenant, "", url.searchParams);
      }
      // A docs app takes one answer of its readers: whether a page helped.
      if (!isPage && !path.endsWith("/_feedback")) return plain(reply, 405, "Method not allowed.");
      const segments = decodeSegments(path.slice(1));
      if (!segments) return plain(reply, 400, "That address is not valid.");
      return serveApp(
        request,
        reply,
        place,
        tenant,
        workspace,
        segments.join("/"),
        everything ? undefined : place.domain.appPath,
      );
    }

    const isApps = path.startsWith("/apps/");
    const isPortal = path.startsWith("/portal/");
    if (!isApps && !isPortal) {
      // The second address has apps and the API. The console is not there.
      if (place.kind === "apps") return plain(reply, 404, "Not found.");
      return;
    }
    // With a second address configured, apps are served there and nowhere else.
    if (place.kind === "main" && kernel.hosts.hasAppsAddress) {
      return redirect(reply, `${kernel.hosts.appsOrigin}${path}${url.search}`, isPage ? 307 : 308);
    }
    const segments = decodeSegments(path.slice(1));
    if (!segments) return plain(reply, 400, "That address is not valid.");
    const tenant = segments[1] ? await tenantBy("slug", segments[1]) : undefined;
    if (!tenant) return plain(reply, 404, "Not found.");

    if (isPortal) {
      const sub = segments.slice(2).join("/");
      return portal(request, reply, place, tenant, sub === "" ? "" : `/${sub}`, url.searchParams);
    }
    if (!isPage && !path.endsWith("/_feedback")) return plain(reply, 405, "Method not allowed.");
    const workspace = segments[2]
      ? await db
          .selectFrom("workspace")
          .select(["id", "slug", "active_bundle_id"])
          .where("tenant_id", "=", tenant.id)
          .where("slug", "=", segments[2])
          .executeTakeFirst()
      : undefined;
    if (!workspace) {
      return html(
        reply,
        404,
        messagePage(await frame(tenant), NOT_FOUND(`${portalPath(place, tenant.slug)}/`)),
      );
    }
    return serveApp(request, reply, place, tenant, workspace, segments.slice(3).join("/"));
  });
}

const NOT_FOUND = (home: string) => ({
  title: "Nothing here",
  text: "There is no page at this address.",
  link: { href: home, label: "Go to the start" },
});
const NOT_ALLOWED = {
  title: "Not for this account",
  text: "This account may not open this app. If you think it should, ask the person who gave you the account.",
};
const LINK_EXPIRED = (portal: string) => ({
  title: "This link no longer works",
  text: "It has been used already, or it has run out. Ask for a new one.",
  link: { href: `${portal}/sign-in`, label: "Sign in" },
});
const NO_SIGN_UP = (portal: string) => ({
  title: "Accounts are by invitation",
  text: "You cannot create an account here yourself. Ask for an invitation.",
  link: { href: `${portal}/sign-in`, label: "Sign in" },
});

export type { Notice };

/** A member's groups in a tenant, by name and by key, as an end user's are given to an app. */
async function memberGroups(
  db: Db,
  tenantId: string,
  memberId: string,
): Promise<{ groups: string[]; groupKeys: string[] }> {
  const rows = await db
    .selectFrom("group_member")
    .innerJoin("principal_group", "principal_group.id", "group_member.group_id")
    .select(["principal_group.name", "principal_group.key"])
    .where("group_member.member_id", "=", memberId)
    .where("principal_group.tenant_id", "=", tenantId)
    .orderBy("principal_group.name")
    .execute();
  return { groups: rows.map((row) => row.name), groupKeys: rows.map((row) => row.key) };
}
