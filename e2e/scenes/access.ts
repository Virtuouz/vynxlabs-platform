import type { Given, Scene } from "./scene.ts";

/** The scenes of the area "access"'s pictures (packages/docs/shots/access.mjs), by the name a shot's `setup` gives. */

/** Fernhill's own tenant, where the screens of Members & access are as the seed leaves them. */
const fernhillTenant = (given: Given) => {
  if (!given.fernhill) throw new Error("Fernhill is not seeded on this instance");
  return given.fernhill;
};

export const scenes: Record<string, Scene> = {
  // Fernhill's tenant, for pictures of its groups, who holds which role, its end users and Maya Brooks's account.
  "access-fernhill": async (given) => ({ at: `/t/${fernhillTenant(given).id}` }),

  // A person of the run's own, so that the Account screen lists only their sessions and keys.
  "access-account": async (given) => {
    const email = `dana.whitfield.${given.stamp}@example.com`;
    const password = `Dana-${given.stamp}-pictures-2026`;
    await given.call("POST", `/tenants/${given.tenant.id}/members`, {
      email,
      name: "Dana Whitfield",
      password,
    });
    return { at: `/t/${given.tenant.id}`, people: { dana: { email, password } } };
  },

  // A tenant with two admins and approval on, and a group made by one of them, waiting for the other.
  // A tenant of its own: approval on in the run's shared tenant would hold every other scene's
  // access change (a group, a binding) waiting too.
  "access-waiting": async (given) => {
    const tenant = (
      await given.call("POST", "/tenants", {
        slug: `access-waiting-${given.stamp}`,
        name: "Fernhill",
        addCreator: true,
      })
    ).id as string;
    const roles = (await given.call("GET", `/tenants/${tenant}/roles?limit=200`)).items as {
      id: string;
      name: string;
    }[];
    const admin = roles.find((role) => role.name === "tenant_admin");
    if (!admin) throw new Error("There is no tenant_admin role");
    const password = `Sam-${given.stamp}-pictures-2026`;
    const email = `sam.rivera.${given.stamp}@example.com`;
    const sam = await given.call("POST", `/tenants/${tenant}/members`, {
      email,
      name: "Sam Rivera",
      password,
    });
    await given.call("POST", `/tenants/${tenant}/bindings`, {
      principalType: "member",
      principalId: sam.id,
      roleId: admin.id,
    });
    await given.call("PUT", `/tenants/${tenant}/access/approval`, { required: true });
    // Made by the administrator, so it waits for Sam, who did not make it.
    await given.call("POST", `/tenants/${tenant}/groups`, {
      name: "Night shift",
      description: "Vets on call after the clinics close.",
    });
    return { at: `/t/${tenant}`, people: { sam: { email, password } } };
  },
};
