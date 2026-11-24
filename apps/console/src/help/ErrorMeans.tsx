import type { PageFile } from "@volvel/docs-engine";
import { Doc, Skeleton } from "@volvel/ui";
import { useEffect, useState } from "react";
import { useBrand } from "../kit/brand.tsx";
import { loadPage } from "./content.ts";

/** The errors page of the documentation: where each code the API answers with is explained. */
export const ERRORS_PAGE = "develop/reference/errors";

/** Where the code's section is read in the documentation, in full. */
export const errorDocsHref = (code: string) => `/docs/${ERRORS_PAGE}#${code}`;

/** What the page says under a code's heading, up to the next code's: nothing when it has none. */
export function sectionOf(page: PageFile, code: string): PageFile["tree"] | undefined {
  const all = page.tree.children as { type: string; depth?: number; id?: string }[];
  const from = all.findIndex((node) => node.type === "heading" && node.id === code);
  if (from < 0) return undefined;
  let to = all.length;
  for (let at = from + 1; at < all.length; at++) {
    const node = all[at];
    if (node?.type === "heading" && (node.depth ?? 2) <= 2) {
      to = at;
      break;
    }
  }
  const children = all.slice(from + 1, to);
  return children.length ? ({ ...page.tree, children } as PageFile["tree"]) : undefined;
}

/**
 * What a code means and what to do about it, from the help the console carries, drawn where a
 * failure is shown inside a dialog or sheet (the help panel would open behind it).
 */
export function ErrorMeans({ code }: { code: string }) {
  const brand = useBrand();
  const [state, setState] = useState<
    | { state: "loading" }
    | { state: "failed" }
    | { state: "done"; tree: PageFile["tree"] | undefined }
  >({ state: "loading" });
  useEffect(() => {
    let current = true;
    loadPage(ERRORS_PAGE).then(
      (page) => current && setState({ state: "done", tree: sectionOf(page, code) }),
      () => current && setState({ state: "failed" }),
    );
    return () => {
      current = false;
    };
  }, [code]);
  if (state.state === "loading") return <Skeleton className="h-12 w-full" />;
  if (state.state === "failed" || !state.tree)
    return (
      <p className="m-0">
        The help for this could not be loaded here. Open it in the documentation.
      </p>
    );
  return (
    <Doc
      tree={state.tree}
      profile="product"
      productName={brand.productName}
      headingTop={3}
      idPrefix={`means-${code}`}
    />
  );
}
