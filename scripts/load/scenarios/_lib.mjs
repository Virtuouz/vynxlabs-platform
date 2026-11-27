// Small helpers the scenarios share. Not a scenario itself.
export const API = "/api/v1";

const enc = encodeURIComponent;
/** `/api/v1/tenants/:t` for a user. */
export const tenantPath = (user) => `${API}/tenants/${enc(user.tenant)}`;
/** `/api/v1/tenants/:t/workspaces/:w` for a user. */
export const wsPath = (user) => `${tenantPath(user)}/workspaces/${enc(user.workspace)}`;
/** A resource path such as `sales/orders`, each segment encoded. */
export const encodePath = (path) => path.split("/").map(enc).join("/");
export const pick = (list) => list[Math.floor(Math.random() * list.length)];
/** The `items` of a list answer, or an empty array. */
export const itemsOf = (result) => (Array.isArray(result.json?.items) ? result.json.items : []);
export const query = (params) => {
  const parts = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${enc(key)}=${enc(value)}`);
  return parts.length ? `?${parts.join("&")}` : "";
};

/**
 * Runs `discover(user)` once per distinct tenant, workspace and credential, and shares the
 * answer between the users that match, so many users do not each list the same things.
 * The answer is kept at `user.state.found`.
 */
export async function discoverOnce(ctx, discover) {
  const seen = new Map();
  for (const user of ctx.users) {
    const key = `${user.tenant}/${user.workspace}/${user.apiKey ?? user.cookie}`;
    if (!seen.has(key)) seen.set(key, await discover(user));
    user.state.found = seen.get(key);
  }
}
