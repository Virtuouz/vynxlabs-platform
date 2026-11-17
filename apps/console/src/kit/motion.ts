/**
 * Motion that script code starts, such as a canvas gliding to a step, follows
 * the same rule as the stylesheet's (07 §7.10): none when the reader's system
 * asks for reduced motion.
 */
export function reducedMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** How long a moving view takes, in ms: `ms`, or nothing under reduced motion. */
export const glide = (ms: number) => (reducedMotion() ? 0 : ms);
