import { grants } from "@volvel/manifest";
import { Notice } from "@volvel/ui";
import { type ReactNode, useEffect, useState } from "react";
import { api, askForAccess, type Me, useLoad } from "../api.ts";

interface Held {
  permissions: { permission: string; sources?: string[] }[];
  /** What gives them, and where: a tenant's permission is held by a source at the tenant alone. */
  sources?: { id: string; scope?: { type?: string }; counts?: boolean }[];
}

/** Other ways to be let in, which the server counts as the permission itself. */
export interface Options {
  /**
   * Permissions that are enough alone, where the server lets them stand in for `permission` on
   * their own kinds: `interface:write` for an app, `doc:write` for a page of documentation.
   */
  alone?: string[] | undefined;
  /** The route is `tenantOrInstance`: what an operator holds on the instance counts as well. */
  orInstance?: boolean | undefined;
}

/** Whether `held` gives `permission` through a source at the tenant, as the server counts it. */
function heldAtTenant(held: Held, permission: string): boolean {
  const list = held.permissions.filter((one) => one.permission === permission);
  if (list.length === 0) return false;
  // An answer that does not say where each is given is not known: the server decides.
  if (!Array.isArray(held.sources)) return true;
  return list.some((one) =>
    (one.sources ?? []).some((id) => {
      const source = held.sources?.find((found) => found.id === id);
      // A grant at a workspace or on a resource is not one at the tenant, where the server asks.
      return source !== undefined && source.scope?.type === "tenant" && source.counts !== false;
    }),
  );
}

/**
 * Whether the signed-in member holds a permission where `base` is (`/tenants/<id>` or
 * `/instance`), so a screen can say so before it draws a control that the server would refuse.
 * It answers yes while that is not known, and when it cannot be read: the server decides again,
 * and a control that is missing for a moment is worse than one that is refused with a reason.
 * At a tenant, only a permission given at the tenant counts, as the server asks it there: one
 * given at a workspace or on a resource does not. At a workspace (`/tenants/<id>/workspaces/<id>`)
 * the server answers for that workspace alone. With no `base` nothing is asked and the answer is
 * yes. `resource` is for a route the server answers for a grant on the resource itself; leave it
 * off for one that asks the workspace.
 */
export function useCan(
  base: string | null,
  permission: string,
  resource?: Resource,
  options: Options = {},
): boolean {
  const me = useLoad<Me>(base === null ? null : "/me");
  const instance = base === "/instance" || (base?.startsWith("/instance/") ?? false);
  const inWorkspace = isWorkspace(base);
  const id = me.data?.principal?.id;
  const held = useLoad<Held>(
    base !== null && !instance && !inWorkspace && id ? `${base}/access/member/${id}` : null,
  );
  const either = [permission, ...(options.alone ?? [])];
  const asked = useAsked(inWorkspace ? base : null, either, resource);
  if (base === null) return true;
  // An answer that is not the shape expected is not known, and says yes (the server decides).
  if (instance) {
    const given = me.data?.instancePermissions;
    return Array.isArray(given) ? either.some((one) => grants(given, one)) : true;
  }
  if (inWorkspace) {
    const allowed = asked.data?.allowed;
    return Array.isArray(allowed) ? either.some((one) => allowed.includes(one)) : true;
  }
  const list = held.data?.permissions;
  if (!Array.isArray(list)) return true;
  const given = me.data?.instancePermissions;
  if (options.orInstance && Array.isArray(given) && either.some((one) => grants(given, one))) {
    return true;
  }
  return either.some((one) => heldAtTenant(held.data as Held, one));
}

/** A resource of a workspace, by its kind and path: a grant given on it alone counts for it. */
export interface Resource {
  kind: string;
  path: string;
}

const isWorkspace = (base: string | null): base is string =>
  base !== null && /^\/tenants\/[^/]+\/workspaces\/[^/]+$/.test(base);

/** The one question put to the server about a workspace: `GET <workspace>/allowed`. */
function useAsked(root: string | null, permissions: string[], resource?: Resource) {
  const on = resource
    ? `&kind=${encodeURIComponent(resource.kind)}&path=${encodeURIComponent(resource.path)}`
    : "";
  return useLoad<{ allowed?: string[] }>(
    root === null
      ? null
      : `${root}/allowed?permissions=${permissions.map(encodeURIComponent).join(",")}${on}`,
  );
}

/**
 * For a screen that asks several permissions of a workspace at once: whether each is held. Unlike
 * `useCan`, nothing is held until the answer is in, so a control is not drawn and then taken away;
 * if the answer cannot be had the controls stay and the server's refusal says what is missing.
 * With no `root` nothing is asked. A `resource` counts grants given on it (a person let start one
 * flow and no other).
 */
export function useMay(
  root: string | null,
  ...permissions: string[]
): (permission: string) => boolean {
  return useMayOn(root, undefined, ...permissions);
}

export function useMayOn(
  root: string | null,
  resource: Resource | undefined,
  ...permissions: string[]
): (permission: string) => boolean {
  const asked = useAsked(root, permissions, resource);
  return (permission) => {
    if (!asked.data) return asked.error !== undefined;
    // An answer that does not say is no refusal: the server decides.
    return Array.isArray(asked.data.allowed) ? asked.data.allowed.includes(permission) : true;
  };
}

/**
 * For a list whose rows each belong to a script or flow: whether each is allowed `permission`,
 * counting a grant on that one resource, as the server does for runs. Nothing is held until the
 * answer is in; an answer that cannot be had leaves the control, and the server decides.
 */
export function useMayEach(
  root: string | null,
  wanted: { kind: string; path: string; permission: string }[],
): (kind: string, path: string, permission: string) => boolean {
  const [known, setKnown] = useState<Record<string, boolean>>({});
  const key = (kind: string, path: string, permission: string) => `${permission} ${kind} ${path}`;
  const missing = wanted.filter((one) => !(key(one.kind, one.path, one.permission) in known));
  const signature = missing.map((one) => key(one.kind, one.path, one.permission)).join("\n");
  // biome-ignore lint/correctness/useExhaustiveDependencies: `signature` stands for `missing`
  useEffect(() => {
    if (root === null || missing.length === 0) return;
    let live = true;
    for (const one of missing) {
      const on = `kind=${encodeURIComponent(one.kind)}&path=${encodeURIComponent(one.path)}`;
      api
        .get<{ allowed?: string[] }>(
          `${root}/allowed?permissions=${encodeURIComponent(one.permission)}&${on}`,
        )
        .then(
          (answer) => !Array.isArray(answer.allowed) || answer.allowed.includes(one.permission),
          () => true,
        )
        .then((value) => {
          if (live) {
            setKnown((was) => ({ ...was, [key(one.kind, one.path, one.permission)]: value }));
          }
        });
    }
    return () => {
      live = false;
    };
  }, [root, signature]);
  return (kind, path, permission) => known[key(kind, path, permission)] === true;
}

/**
 * What is inside is drawn, and where the member does not hold `permission` it is switched off
 * as a whole, under a line that says so and whom to ask. Reading is not hidden.
 */
/** The line that says a screen is for reading by this member, and whom to ask. */
export function NotAllowed({
  permission,
  what,
  alone,
}: {
  permission: string;
  what: string;
  alone?: string[] | undefined;
}) {
  return (
    <Notice tone="plain">
      You can see {what}, not change it. It needs <code className="font-mono">{permission}</code>
      {alone?.length ? `, or ${alone.join(" or ")} alone` : ""}. {askForAccess()}
    </Notice>
  );
}

export function Can({
  base,
  permission,
  what,
  children,
  ...options
}: {
  base: string;
  permission: string;
  /** What the member can still see, for the line: "this provider". */
  what: string;
  children: ReactNode;
} & Options) {
  const can = useCan(base, permission, undefined, options);
  // The same tree either way, so what a member typed while this was being read is not lost.
  return (
    <>
      {can ? null : <NotAllowed permission={permission} what={what} alone={options.alone} />}
      <fieldset disabled={!can} className="contents">
        {children}
      </fieldset>
    </>
  );
}

/** What changing a list takes, and where it is held: the `needs` of a list. */
export interface Needs extends Options {
  base: string;
  permission: string;
  what: string;
  /** A resource whose own grants count, such as the one flow a person may start. */
  resource?: Resource;
}

/**
 * For a list that offers a change: whether this member may make it, the line that says why not,
 * and the words for a button that is greyed. Reading is never hidden (GOV-37).
 */
export function useNeeds(needs: Needs | undefined) {
  const can = useCan(needs?.base ?? null, needs?.permission ?? "", needs?.resource, {
    alone: needs?.alone,
    orInstance: needs?.orInstance,
  });
  const or = needs?.alone?.length ? `, or ${needs.alone.join(" or ")} alone` : "";
  return {
    can,
    line:
      !can && needs ? (
        <NotAllowed permission={needs.permission} what={needs.what} alone={needs.alone} />
      ) : null,
    reason: !can && needs ? `It needs ${needs.permission}${or}. ${askForAccess()}` : undefined,
  };
}
