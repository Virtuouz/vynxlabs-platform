/**
 * What lets someone learn what a resource is for. Any one of a kind's
 * permissions is enough, held at the workspace or at the resource itself.
 *
 * The first of each is how a member reads the kind. The second is how an end
 * user comes to it through an app: rows they may read, a script or a flow they
 * may start. An end user holds only permissions apps use, so `table:read` and
 * `script:read` never answer for one, whatever they are bound to.
 */
export const DESCRIBED: Record<string, readonly string[]> = {
  table: ["table:read", "data:read"],
  script: ["script:read", "run:write"],
  flow: ["flow:read", "flow_run:write"],
  app: ["app:read"],
  connection: ["connection:read"],
  query: ["data:read"],
};

/**
 * Whether the one who asks may know what a resource is for. The one rule, for the terms route and
 * for a served page alike: `allowed` answers whether they hold a permission, at the workspace when
 * no resource is given and at that resource otherwise.
 */
export function describer(allowed: (permission: string, resourceId?: string) => Promise<boolean>) {
  const everywhere = new Map<string, Promise<boolean>>();
  const ask = (permission: string) => {
    let whole = everywhere.get(permission);
    if (!whole) {
      whole = allowed(permission);
      everywhere.set(permission, whole);
    }
    return whole;
  };
  return async (kind: string, resourceId: string): Promise<boolean> => {
    const permissions = DESCRIBED[kind];
    if (!permissions) return false;
    if (await ask("resource:read")) return true;
    for (const permission of permissions) if (await ask(permission)) return true;
    for (const permission of permissions) if (await allowed(permission, resourceId)) return true;
    return false;
  };
}
