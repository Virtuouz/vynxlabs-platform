import { type TSchema, Type } from "typebox";

/** Query parameters every list route accepts. */
export const PageQuery = Type.Object({
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 200, default: 50 })),
  cursor: Type.Optional(Type.String({ description: "Opaque. Pass back nextCursor unchanged." })),
});

/** `PageQuery` and a `search` that a list route matches against its names. */
export const SearchPageQuery = Type.Object({
  ...PageQuery.properties,
  search: Type.Optional(
    Type.String({ maxLength: 200, description: "Matches anywhere in the name or email." }),
  ),
});

/** The `like` pattern for a search, with its own `%`, `_` and `\` taken literally. */
export const likeTerm = (search: string) => `%${search.toLowerCase().replace(/[%_\\]/g, "\\$&")}%`;

/** The response shape of every list route. */
export function pageOf<T extends TSchema>(item: T) {
  return Type.Object({
    items: Type.Array(item),
    nextCursor: Type.Union([Type.String(), Type.Null()]),
  });
}

/**
 * The response of a list route that has no cursor: it answers every item it has, or at most `cap`
 * of them. Its description is what a reference prints, so a reader can tell a list that is whole
 * from one that is cut short. A list that can be longer than a page takes `PageQuery` and
 * `pageOf` instead.
 */
export function listOf<T extends TSchema>(item: T, cap?: number) {
  return Type.Object(
    { items: Type.Array(item) },
    {
      description:
        cap === undefined
          ? "Every one there is. The list has no cursor."
          : `At most ${cap}. The list has no cursor, so what is past ${cap} is not reachable through this route.`,
    },
  );
}

/**
 * For a list that has always answered every item it has: `search` narrows it by name, and a
 * `limit` pages it, in the order of the name. Asked for no `limit`, it answers all of them.
 */
export const NamedListQuery = Type.Object({
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 200 })),
  cursor: Type.Optional(Type.String({ description: "Opaque. Pass back nextCursor unchanged." })),
  search: Type.Optional(
    Type.String({ maxLength: 200, description: "Matches anywhere in the name." }),
  ),
});

/** The cursor key of a row of a list in the order of the name, and the two parts of one. */
export const nameKey = (row: { name: string; id: string }) => `${row.name}\u0000${row.id}`;
export const afterName = (after: string | undefined) => {
  if (after === undefined) return undefined;
  const at = after.lastIndexOf("\u0000");
  return at < 0 ? undefined : { name: after.slice(0, at), id: after.slice(at + 1) };
};
