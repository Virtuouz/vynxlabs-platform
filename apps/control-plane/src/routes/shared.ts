import { Type } from "typebox";
import { badRequest } from "../kernel/errors.js";

export const Id = Type.String({ format: "uuid" });
export const Time = Type.String({ format: "date-time" });
export const NullableId = Type.Union([Id, Type.Null()]);
export const NullableTime = Type.Union([Time, Type.Null()]);
export const NullableString = Type.Union([Type.String(), Type.Null()]);
export const AnyObject = Type.Unsafe<Record<string, unknown>>({
  type: "object",
  additionalProperties: true,
});
export const Slug = Type.String({ pattern: "^[a-z0-9]+(-[a-z0-9]+)*$", maxLength: 63 });
export const Name = Type.String({ minLength: 1, maxLength: 200 });

export const TenantParams = Type.Object({ t: Id });
export const WorkspaceParams = Type.Object({ t: Id, w: Id });
export const NoContent = Type.Null({ description: "Done." });

export const iso = (date: Date) => date.toISOString();
export const isoOrNull = (date: Date | null) => date?.toISOString() ?? null;

export interface PageArgs {
  limit: number;
  /** The key of the last item on the previous page. */
  after: string | undefined;
}

export function pageArgs(query: { limit?: number; cursor?: string }): PageArgs {
  let after: string | undefined;
  if (query.cursor !== undefined) {
    after = Buffer.from(query.cursor, "base64url").toString("utf8");
    if (after === "" || Buffer.from(after, "utf8").toString("base64url") !== query.cursor) {
      throw badRequest("The cursor is not valid.");
    }
  }
  return { limit: query.limit ?? 50, after };
}

/** Turns `limit + 1` fetched rows into a page. */
export function toPage<Row, Item>(
  rows: Row[],
  args: PageArgs,
  key: (row: Row) => string,
  map: (row: Row) => Item,
): { items: Item[]; nextCursor: string | null } {
  const page = rows.slice(0, args.limit);
  const last = page.at(-1);
  return {
    items: page.map(map),
    nextCursor:
      rows.length > args.limit && last
        ? Buffer.from(key(last), "utf8").toString("base64url")
        : null,
  };
}

/**
 * The answer to a change to a tenant's access that waits for a second person:
 * nothing changed yet, and this is the release someone else has to approve.
 */
export const Waiting = Type.Object(
  {
    waiting: Type.Literal(true),
    release: Type.Object({ id: Id, number: Type.Integer(), status: Type.String() }),
    detail: Type.String(),
  },
  { description: "Nothing changed yet. The tenant asks for a second person to approve it." },
);
export const waiting = (release: { id: string; number: number; status: string }) => ({
  waiting: true as const,
  release: { id: release.id, number: release.number, status: release.status },
  detail:
    "This tenant asks for a second person before its access changes. Nothing changed yet: someone else who may release access has to approve it.",
});
