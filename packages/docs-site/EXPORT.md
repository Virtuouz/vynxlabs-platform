# The documentation as a static site

A note for the website repository. Volvel's documentation is written once and read in three places: in the console's help panel, at `/docs` of every instance, and on the website. The website's copy is this export: every page as a file, drawn by the same renderer as `/docs`, needing no server and no script to read.

## What a release produces

Each release run (`.github/workflows/release.yml`) writes the export and keeps it as the artifact `docs-site`. When the repository variable `DOCS_SITE_REPOSITORY` is set, the website repository is sent a `repository_dispatch` event `volvel-docs` with `client_payload` of `version`, `tag` (`latest` or `next`), `run` (the workflow run), `artifact` (`docs-site`) and `base` (where the files were drawn to be served). Download the artifact of that run, and publish its files.

To make one yourself: `pnpm docs:export --out <dir> --base /docs/ [--origin https://example.com] [--versions <versions.json>]`. It builds the documentation first. The same is a function: `exportSite(options)` and `exportToDirectory(dir, options)` from `@volvel/docs-site/export`.

## What is in it

Everything is a file under the folder you serve at the base path. `index.html` is the page at the base.

| File | What it is |
|---|---|
| `<page>/index.html` | Each page. A folder's own page is `<folder>/index.html`. Addresses end in a slash. |
| `<page>.md` | The Markdown of each page, for "Copy as Markdown" and for readers who want text. `index.md` is the home page. |
| `404.html` | The page for an address with no page. |
| `_search/index.html` | The search page. It answers a question in the address (`?q=`) with script, and lists every page without. |
| `search/index.json`, `search/<collection>.json` | One search index for each collection, and where each result's page sits in the navigation. Read in the reader's browser. |
| `_platform/` | The stylesheet, the page script, the search script and the theme. Each name holds a hash of the file (`docs.1b7326a52c.css`), so serve it with `Cache-Control: public, max-age=31536000, immutable`. |
| `assets/` | Pictures beside the pages, and the screenshots of the console, in light and dark. Their names hold a hash of the picture: the same cache rule. |
| `<old page>/index.html` | A page that moved, deleted pages included: see below. |
| `_redirects` | The same moves as lines of `from to 308`, for hosts that read such a file. |
| `sitemap.xml` | Every page. |
| `versions.json` | `{ version, date, versions: [{ version, date, path }] }`. |

Pages carry `noindex` only where they should (search, moved pages, 404). Nothing in the files names another site: no fonts, scripts or pictures are loaded from elsewhere, and a crawl test holds that (`packages/docs-site/src/export.test.ts`).

## The base path

Every address in the files starts with the base path given at export (`/docs/`, or `/docs/1.2.0/`). It must start and end with a slash. The files are not movable between base paths: export again with the new one. To serve at the root, use `--base /`.

Serve the folder's contents at that path. A path with a slash at its end is that folder's `index.html`: nearly every static host does this. A path without it (`/docs/start`) is answered by most hosts with a redirect to the slash; links in the files always carry the slash.

## Redirects

A static host has no 308 from us. For every address that moved (a page's `moved_from`, or a page deleted in `packages/docs/redirects.json`) the export writes a page at the old address with `<meta http-equiv="refresh">`, `<link rel="canonical">` and a link, so a reader and a search engine both follow it, and `_redirects` lines for hosts that read one (Netlify, Cloudflare Pages). The lines hold whole paths with the base path, so they belong at the root of the website's output: merge them into its own `_redirects`, or use the stubs alone. An old page's `.md` address has a line too.

## Versions

`versions.json` names this version and its day. The website keeps the versions apart: export each release with its own base (`/docs/1.2.0/`, and `/docs/next/` for prereleases, as the console's online link expects), and pass the `versions.json` of the last export with `--versions` so the new file lists all of them. The site's own version switcher and the "a newer version exists" line of old versions read the combined file. Which version `/docs/` itself shows (the latest) is the website's choice: export it again at `/docs/`, or redirect.

## Search

Search needs no server and no search service. The page script loads the index of the collection being searched (all of them for "All"), about 1.4 MB for all before compression, and asks it in the browser. Serve `.json` with compression on. The search script is bundled from the engine of the same release, so pages and search never come from two releases.

## Theme and branding

The export carries the default look, light and dark by the reader's system. To use the website's own look, pass a stylesheet of the tokens (`--theme file.css`, or `theme` to the function): the page's colors come from the `--vx-*` variables, as `/docs` does with an instance's branding. Feedback ("Was this page helpful?") is not drawn: a static site has nowhere to send it.

## Diagrams

A page with a diagram loads `diagrams.js` from the folder `_platform/`. The release copies the console's script there when it is built; without it a diagram shows as its source.
