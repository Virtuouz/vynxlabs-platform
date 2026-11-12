import { type TSchema, Type } from "typebox";

/** Query parameters every list route accepts. */
export const PageQuery = Type.Object({
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 200, default: 50 })),
  cursor: Type.Optional(Type.String({ description: "Opaque. Pass back nextCursor unchanged." })),
});

/** The response shape of every list route. */
export function pageOf<T extends TSchema>(item: T) {
  return Type.Object({
    items: Type.Array(item),
    nextCursor: Type.Union([Type.String(), Type.Null()]),
  });
}
