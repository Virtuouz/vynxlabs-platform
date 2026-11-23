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
 * A permission given at one workspace counts here, as it does where it is read.
 */
export function useCan(base: string, permission: string): boolean {
  const me = useLoad<Me>("/me");
  const instance = base === "/instance" || base.startsWith("/instance/");
  const id = me.data?.principal?.id;
  const held = useLoad<Held>(!instance && id ? `${base}/access/member/${id}` : null);
  // An answer that is not the shape expected is not known, and says yes (the server decides).
  if (instance) {
    const given = me.data?.instancePermissions;
    return Array.isArray(given) ? grants(given, permission) : true;
  }
  const list = held.data?.permissions;
  return Array.isArray(list) ? list.some((one) => one.permission === permission) : true;
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
