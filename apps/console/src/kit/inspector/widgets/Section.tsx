import { DrawerGroup } from "@volvel/ui";
import type { ReactNode } from "react";

/**
 * A group of the drawer, or just its rows. The shell draws the group itself for what is
 * registered with `registerDrawer`, so a registered piece is `bare`; used by itself (a test,
 * another shell) a section draws its own group.
 */
export function Section({
  bare,
  label,
  aside,
  note,
  children,
}: {
  bare?: boolean | undefined;
  label: string;
  aside?: ReactNode;
  note?: ReactNode;
  children: ReactNode;
}) {
  if (bare) return <>{children}</>;
  return (
    <DrawerGroup label={label} {...(aside ? { aside } : {})} {...(note ? { note } : {})}>
      {children}
    </DrawerGroup>
  );
}
