// The language files of Prism add themselves to a global `Prism`. Prism's core sets that global itself where it runs
// as a script or in Node, but not when a bundler makes it a module: the global is still the `{ manual: true }` that
// prism-manual left, with no `languages`, and the first language file fails ("Cannot set properties of undefined").
// So the core is put on the global here, after it loads and before any language does. Its own module, for the order.
import Prism from "prismjs/components/prism-core.js";

(globalThis as { Prism?: unknown }).Prism = Prism;
