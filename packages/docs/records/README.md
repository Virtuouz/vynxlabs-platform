# How each documentation page was checked

`pnpm docs:check` asks every page in `packages/docs/content` for a record here:

- `factcheck/<collection>/<page>.md`: one row for each claim the page makes, with the code or the run that holds it up, who checked it and when.
- `runs/<collection>/<page>.md`, for a tutorial or a how-to: what happened when its steps were run, in order, on a throwaway instance seeded with Fernhill.

How a page is written and checked is in [style-guide.md](style-guide.md).

Some rows cite the writing programme's inventory, findings and fixes (`docs/documentation/inventory/…`, `docs/documentation/fixed/…`, `docs/documentation/decisions.md`). Those are kept in the private repository `volveldev/volvel-internal`, at the same paths.
