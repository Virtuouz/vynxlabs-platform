import { grants } from "@volvel/manifest";
import { Notice } from "@volvel/ui";
import type { ReactNode } from "react";
import { askForAccess, type Me, useLoad } from "../api.ts";

interface Held {
  permissions: { permission: string }[];
}

/**
 * Whether the signed-in member holds a permission where `base` is (`/tenants/<id>` or
 * `/instance`), so a screen can say so before it draws a control that the server would refuse.
 * It answers yes while that is not known, and when it cannot be read: the server decides again,
 * and a control that is missing for a moment is worse than one that is refused with a reason.
 * At a tenant, a permission given at one workspace counts (the access route lists it); at a
 * workspace (`/tenants/<id>/workspaces/<id>`) the server answers for that workspace alone. With
 * no `base` nothing is asked and the answer is yes.
 */
export function useCan(base: string | null, permission: string, resource?: Resource): boolean {
  const me = useLoad<Me>(base === null ? null : "/me");
  const instance = base === "/instance" || (base?.startsWith("/instance/") ?? false);
  const inWorkspace = isWorkspace(base);
  const id = me.data?.principal?.id;
  const held = useLoad<Held>(
    base !== null && !instance && !inWorkspace && id ? `${base}/access/member/${id}` : null,
  );
  const asked = useAsked(inWorkspace ? base : null, [permission], resource);
  if (base === null) return true;
  // An answer that is not the shape expected is not known, and says yes (the server decides).
  if (instance) {
    const given = me.data?.instancePermissions;
    return Array.isArray(given) ? grants(given, permission) : true;
  }
  if (inWorkspace) {
    return Array.isArray(asked.data?.allowed) ? asked.data.allowed.includes(permission) : true;
  }
  const list = held.data?.permissions;
  return Array.isArray(list) ? list.some((one) => one.permission === permission) : true;
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
 * What is inside is drawn, and where the member does not hold `permission` it is switched off
 * as a whole, under a line that says so and whom to ask. Reading is not hidden.
 */
/** The line that says a screen is for reading by this member, and whom to ask. */
export function NotAllowed({ permission, what }: { permission: string; what: string }) {
  return (
    <Notice tone="plain">
      You can see {what}, not change it. It needs <code className="font-mono">{permission}</code>.{" "}
      {askForAccess()}
    </Notice>
  );
}

export function Can({
  base,
  permission,
  what,
  children,
}: {
  base: string;
  permission: string;
  /** What the member can still see, for the line: "this provider". */
  what: string;
  children: ReactNode;
}) {
  const can = useCan(base, permission);
  // The same tree either way, so what a member typed while this was being read is not lost.
  return (
    <>
      {can ? null : <NotAllowed permission={permission} what={what} />}
      <fieldset disabled={!can} className="contents">
        {children}
      </fieldset>
    </>
  );
}

/** What changing a list takes, and where it is held: the `needs` of a list. */
export interface Needs {
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
  const can = useCan(needs?.base ?? null, needs?.permission ?? "", needs?.resource);
  return {
    can,
    line: !can && needs ? <NotAllowed permission={needs.permission} what={needs.what} /> : null,
    reason:
      !can && needs ? `It needs ${needs.permission}. ${askForAccess()}` : (undefined as undefined),
  };
}
