import { type Static, Type } from "typebox";

/** One or more segments joined by "/". See the phase 0 doc for the grammar. */
export const PATH_PATTERN = "^[a-z0-9][a-z0-9_-]*(/[a-z0-9][a-z0-9_-]*)*$";
export const KIND_PATTERN = "^[a-z][a-z0-9_]*$";
export const SLUG_PATTERN = "^[a-z0-9]+(-[a-z0-9]+)*$";
const UUID_PATTERN = "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$";

const SCHEMA_DIALECT = "https://json-schema.org/draft/2020-12/schema";

const envelopeFields = {
  kind: Type.String({
    pattern: KIND_PATTERN,
    maxLength: 63,
    description: "The resource kind, for example script.",
  }),
  schemaVersion: Type.Integer({
    minimum: 1,
    description: "The version of this kind's body schema.",
  }),
  path: Type.String({
    pattern: PATH_PATTERN,
    maxLength: 255,
    description: "Human-readable name, unique within the workspace.",
  }),
  ownership: Type.Union([Type.Literal("code"), Type.Literal("ui")], {
    description: "Whether the resource is managed from a repository or from the interface.",
  }),
  body: Type.Record(Type.String(), Type.Unknown(), {
    description: "Kind-specific definition, validated by the kind's own schema.",
  }),
};

const workspace = Type.String({
  pattern: SLUG_PATTERN,
  maxLength: 63,
  description: "Slug of the workspace the resource belongs to.",
});

/**
 * What the build emits and a bundle contains: a resource named by path only.
 * A bundle can be deployed to any workspace, so its manifests leave the
 * workspace out and the control plane fills it in.
 */
export const Manifest = Type.Object(
  { ...envelopeFields, workspace: Type.Optional(workspace) },
  {
    $schema: SCHEMA_DIALECT,
    $id: "manifest.schema.json",
    title: "Manifest",
    description: "The authored, language-neutral description of a resource.",
    additionalProperties: false,
  },
);
export type Manifest = Static<typeof Manifest>;

/** What the registry holds: a manifest plus the identity the control plane assigns. */
export const StoredResource = Type.Object(
  {
    ...envelopeFields,
    workspace,
    id: Type.String({
      pattern: UUID_PATTERN,
      description: "Immutable internal ID. A rename keeps it.",
    }),
    version: Type.Integer({
      minimum: 1,
      description: "Assigned by the control plane on each change.",
    }),
  },
  {
    $schema: SCHEMA_DIALECT,
    $id: "resource.schema.json",
    title: "StoredResource",
    description: "A resource as held by the control plane.",
    additionalProperties: false,
  },
);
export type StoredResource = Static<typeof StoredResource>;

/** The files that make up the language-neutral manifest contract. */
export const envelopeSchemas = {
  "manifest.schema.json": Manifest,
  "resource.schema.json": StoredResource,
} as const;
