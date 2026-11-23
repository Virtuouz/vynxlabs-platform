/**
 * Prism, with the languages the documentation is written in and no others. They are imported here, one by one,
 * and not loaded when a fence asks for them (`prismjs/components/index.js` does that with `fs`), because this
 * runs in the browser as well. Order matters: a language comes after those it needs.
 */
import "./prism-manual.js";
import Prism from "prismjs/components/prism-core.js";
import "prismjs/components/prism-markup.js";
import "prismjs/components/prism-css.js";
import "prismjs/components/prism-clike.js";
import "prismjs/components/prism-javascript.js";
import "prismjs/components/prism-jsx.js";
import "prismjs/components/prism-typescript.js";
import "prismjs/components/prism-tsx.js";
import "prismjs/components/prism-json.js";
import "prismjs/components/prism-yaml.js";
import "prismjs/components/prism-bash.js";
import "prismjs/components/prism-sql.js";
import "prismjs/components/prism-diff.js";
import "prismjs/components/prism-markdown.js";

export default Prism;
