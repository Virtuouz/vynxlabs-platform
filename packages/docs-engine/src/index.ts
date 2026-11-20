export { type AmongOptions, checkPageAmong, type PageIndex } from "./among.js";
export { type Manifest, manifestOf, type PageFile, packageOutput } from "./output.js";
export {
  type DocEntry,
  type DocIssue,
  frontmatterOf,
  pagePath,
  type ReadOptions,
  readPage,
  setFrontmatter,
  splitFrontmatter,
  titleOf,
} from "./page.js";
export {
  ABOUT_KINDS,
  type About,
  type AboutKind,
  check,
  FRONTMATTER_SCHEMA,
  type Frontmatter,
  PATH_PATTERN,
  type Schema,
  type SchemaProblem,
  type TermDefinition,
} from "./schema.js";
export { buildSearchIndex, loadSearchIndex, type SearchHit } from "./search.js";
export {
  type Around,
  type BuildOptions,
  buildDocSet,
  type Collection,
  crossIssues,
  type DocSet,
  type Group,
  type Nav,
  type PageRef,
  pagesInOrder,
  resolveAsset,
  resolveLink,
  resourceKey,
  type Target,
  type Term,
  UNCATEGORIZED,
  urlOf,
} from "./set.js";
export {
  allTerms,
  attachedTo,
  clashes,
  extensionsOf,
  type Found,
  findTerm,
  findTopic,
  type Layer,
  type Stack,
} from "./stack.js";
export {
  appOf,
  type BuiltApp,
  buildApp,
  checkWorkspaceDocs,
  type DocsApp,
  docsApps,
  pagesOf,
  type ResourceLike,
  resourceChecker,
  type WorkspaceOptions,
} from "./workspace.js";
