import type { CSSProperties } from "react";

/**
 * For a box that scrolls up and down: a soft shadow at the top or the foot while there is more
 * that way, none when it has all been seen. It needs no script (the covers scroll with the
 * content; the shadows stay). `cover` is the color behind the box.
 */
export const edgeShadows = (cover = "var(--color-structure)"): CSSProperties => ({
  backgroundImage: [
    `linear-gradient(${cover} 30%, transparent)`,
    `linear-gradient(transparent, ${cover} 70%)`,
    "radial-gradient(farthest-side at 50% 0, color-mix(in srgb, var(--color-ink) 22%, transparent), transparent)",
    "radial-gradient(farthest-side at 50% 100%, color-mix(in srgb, var(--color-ink) 22%, transparent), transparent)",
  ].join(", "),
  backgroundPosition: "top, bottom, top, bottom",
  backgroundSize: "100% 18px, 100% 18px, 100% 8px, 100% 8px",
  backgroundRepeat: "no-repeat",
  backgroundAttachment: "local, local, scroll, scroll",
});
