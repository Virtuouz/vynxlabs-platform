import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { Type } from "typebox";
import { access } from "../kernel/http.js";
import type { Kernel } from "../kernel/kernel.js";
import { rekey } from "../kernel/rekey.js";

const Counts = Type.Record(Type.String(), Type.Integer());

/** Where a rotation of the master key stands. For the instance's operators. */
export function masterKeyRoutes(kernel: Kernel): FastifyPluginAsyncTypebox {
  return async (app) => {
    app.get(
      "/instance/master-key",
      {
        config: { access: access.instance("instance:read") },
        schema: {
          summary: "Where a rotation of the master key stands",
          description:
            "The fingerprints of `MASTER_KEY` and of `MASTER_KEY_SECONDARY`, and how many " +
            "values sealed directly with a master key are sealed with each, by place. Nothing " +
            "is changed by asking. When `secondary` is 0 everywhere and `unopened` is empty, " +
            "`MASTER_KEY_SECONDARY` can be removed. A fingerprint is the start of a hash of the " +
            "key, enough to tell two keys apart and nothing more.",
          tags: ["instance"],
          response: {
            200: Type.Object({
              masterKey: Type.String(),
              secondaryKey: Type.Union([Type.String(), Type.Null()]),
              current: Counts,
              secondary: Counts,
              unopened: Type.Array(Type.Object({ place: Type.String(), id: Type.String() })),
              secondaryRemovable: Type.Boolean(),
            }),
          },
        },
      },
      async () => {
        const looked = await rekey(kernel, { look: true });
        const { current, secondary } = kernel.vault.fingerprints;
        const left = Object.values(looked.rewrapped).reduce((sum, n) => sum + n, 0);
        return {
          masterKey: current,
          secondaryKey: secondary,
          current: looked.current,
          secondary: looked.rewrapped,
          unopened: looked.unopened,
          secondaryRemovable: secondary !== null && left === 0 && looked.unopened.length === 0,
        };
      },
    );
  };
}
