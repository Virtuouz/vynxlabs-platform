import { type BundleManifest, validateJson } from "@vynxlabs/manifest";
import { httpConnector, smtpConfigSchema } from "@vynxlabs/sdk";

/** What the configuration of a connection must fit, for the connectors every worker has. */
export const BUILTIN_CONFIG_SCHEMAS: Record<string, object> = {
  http: httpConnector.configSchema,
  smtp: smtpConfigSchema,
};

/**
 * The schema of a connector by name, among the connectors every worker has
 * and the connector resources given. Undefined when there is no such connector.
 */
export function connectorSchema(
  name: string,
  connectors: { path: string; body: unknown }[],
): object | undefined {
  const builtin = BUILTIN_CONFIG_SCHEMAS[name];
  if (builtin) return builtin;
  const own = connectors.find((candidate) => candidate.path === name);
  return (own?.body as { configSchema?: object } | undefined)?.configSchema;
}

/**
 * Everything bound in a workspace that does not fit the connector a bundle
 * gives it. A connection is bound before the bundle that declares it is
 * deployed, when nothing yet says which connector it uses, so this is where
 * a wrong configuration is caught.
 */
export function unfitBindings(
  manifests: BundleManifest[],
  bound: { path: string; config: unknown }[],
  members: { group: string; key: string; config: unknown }[],
): { path: string; message: string }[] {
  const connectors = manifests.filter((manifest) => manifest.kind === "connector");
  const schemaFor = (kind: string, path: string) => {
    const declared = manifests.find((manifest) => manifest.kind === kind && manifest.path === path);
    const name = (declared?.body as { connector?: string } | undefined)?.connector;
    return name === undefined ? undefined : { name, schema: connectorSchema(name, connectors) };
  };
  const problems: { path: string; message: string }[] = [];
  const check = (where: string, kind: string, path: string, config: unknown) => {
    const found = schemaFor(kind, path);
    if (!found?.schema) return;
    for (const issue of validateJson(found.schema, config)) {
      problems.push({
        path: where,
        message: `does not fit the "${found.name}" connector: ${issue.path || "the configuration"} ${issue.message}`,
      });
    }
  };
  for (const binding of bound) {
    check(`/connections/${binding.path}`, "connection", binding.path, binding.config);
  }
  for (const member of members) {
    check(
      `/connection-groups/${member.group}/${member.key}`,
      "connection_group",
      member.group,
      member.config,
    );
  }
  return problems;
}
