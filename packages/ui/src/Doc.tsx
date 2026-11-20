import { DOC_CSS, type Root } from "@volvel/markup";
import { type Components, type ReactOptions, renderReact } from "@volvel/markup/react";
import { type ReactNode, useMemo } from "react";
import { Details } from "./Details.tsx";
import { Notice } from "./Notice.tsx";
import { Tabs } from "./Tabs.tsx";
import { Term } from "./Term.tsx";
import { Kbd } from "./Tooltip.tsx";

/** The documentation stylesheet's colours, taken from the theme's tokens. */
const THEMED = `
.vd-doc {
  --vd-ink: var(--vx-ink);
  --vd-muted: var(--vx-ink-muted);
  --vd-line: var(--vx-line);
  --vd-surface: var(--vx-surface);
  --vd-sunken: var(--vx-sunken);
  --vd-action: var(--vx-action);
  --vd-info: var(--vx-action);
  --vd-info-soft: var(--vx-action-soft);
  --vd-success: var(--vx-success);
  --vd-success-soft: var(--vx-success-soft);
  --vd-attention: var(--vx-attention);
  --vd-attention-soft: var(--vx-attention-soft);
  --vd-danger: var(--vx-danger);
  --vd-danger-soft: var(--vx-danger-soft);
  --vd-font-code: var(--vx-font-code);
}
`;

const TONE = { info: "plain", success: "success", warning: "attention", danger: "danger" } as const;

/** The kit's own components, for the parts of a page that are more than text. */
const KIT: Components = {
  alert: ({ type, title, children }) => (
    <div className="mb-4">
      <Notice tone={TONE[type]}>
        {title ? <p className="m-0 mb-1 font-semibold">{title}</p> : null}
        <div className="[&>:last-child]:mb-0">{children}</div>
      </Notice>
    </div>
  ),
  tabs: ({ tabs }) => (
    <div className="mb-4">
      <Tabs
        label="Ways to do this"
        tabs={tabs.map((tab, index) => ({
          id: String(index),
          label: tab.label,
          content: <div className="[&>:last-child]:mb-0">{tab.children}</div>,
        }))}
      />
    </div>
  ),
  details: ({ summary, children }) => (
    <div className="mb-4">
      <Details summary={summary}>
        <div className="[&>:last-child]:mb-0">{children}</div>
      </Details>
    </div>
  ),
  kbd: ({ keys }) => <Kbd>{keys}</Kbd>,
};

export interface DocProps extends Omit<ReactOptions, "components"> {
  tree: Root;
  /**
   * Draws the link to read more about a term, given where it leads. Left out,
   * it is a plain link. A console gives one that opens its help panel.
   */
  more?: (href: string, word: string) => ReactNode;
  /**
   * Draw the page as it is served, with no component of the kit: plain
   * elements and the one stylesheet. For a preview that must match the site.
   */
  asServed?: boolean;
  /** Components to use in place of the kit's, or beside them. */
  components?: Components;
}

/**
 * A page of documentation, from its tree. Text and its layout come from the
 * same stylesheet a served site uses. Alerts, tabs, folded sections, keys and
 * terms are the kit's own, so they look and behave as they do everywhere else.
 */
export function Doc({
  tree,
  more,
  asServed,
  components,
  profile,
  productName,
  link,
  image,
  term,
  field,
  screenshot,
  headingShift,
  idPrefix,
  learnMore,
  folder,
  lines,
}: DocProps) {
  const drawn = useMemo(() => {
    const options: ReactOptions = {
      ...(profile === undefined ? {} : { profile }),
      ...(productName === undefined ? {} : { productName }),
      ...(link === undefined ? {} : { link }),
      ...(image === undefined ? {} : { image }),
      ...(term === undefined ? {} : { term }),
      ...(field === undefined ? {} : { field }),
      ...(screenshot === undefined ? {} : { screenshot }),
      ...(headingShift === undefined ? {} : { headingShift }),
      ...(idPrefix === undefined ? {} : { idPrefix }),
      ...(learnMore === undefined ? {} : { learnMore }),
      ...(folder === undefined ? {} : { folder }),
      ...(lines === undefined ? {} : { lines }),
    };
    if (asServed) return renderReact(tree, options);
    const drawTerm: Components["term"] = ({ props, word, info, children }) => {
      const href = info?.href;
      return (
        <Term
          id={props.id ?? Object.values(props).join(":")}
          word={word}
          short={info?.short}
          more={
            href === undefined ? undefined : more ? (
              more(href, word)
            ) : (
              <a href={href} className="text-action underline">
                More about {word}
              </a>
            )
          }
        >
          {children}
        </Term>
      );
    };
    return renderReact(tree, {
      ...options,
      components: { ...KIT, term: drawTerm, ...components },
    });
  }, [
    tree,
    more,
    asServed,
    components,
    profile,
    productName,
    link,
    image,
    term,
    field,
    screenshot,
    headingShift,
    idPrefix,
    learnMore,
    folder,
    lines,
  ]);
  return (
    <div className="vd-doc">
      <style href="volvel-doc" precedence="default">
        {DOC_CSS + THEMED}
      </style>
      {drawn}
    </div>
  );
}
