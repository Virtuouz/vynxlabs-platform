import { DOC_CSS, type Root } from "@volvel/markup";
import { type Components, type ReactOptions, renderReact } from "@volvel/markup/react";
import { CircleCheck, Info, OctagonAlert, TriangleAlert } from "lucide-react";
import { type ReactNode, useMemo } from "react";
import { Details } from "./Details.tsx";
import { servedComponents } from "./DocServed.tsx";
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
  --vd-radius: var(--vx-radius-control);
}
/* As a served site sets its pages: a size of its own, whatever is around it. */
.vd-doc.vd-served { font-size: 16px; line-height: 1.6; }
`;

/** An alert's type, as its rail, icon and words are coloured. */
const ALERT = {
  info: { rail: "bg-action", ink: "text-action", Icon: Info, label: "Note" },
  success: { rail: "bg-success", ink: "text-success", Icon: CircleCheck, label: "Done" },
  warning: { rail: "bg-attention", ink: "text-attention", Icon: TriangleAlert, label: "Warning" },
  danger: { rail: "bg-danger", ink: "text-danger", Icon: OctagonAlert, label: "Danger" },
} as const;

/** The kit's own components, for the parts of a page that are more than text. */
const KIT: Components = {
  // A callout, as the documentation site draws one: a coloured rail and an icon for its type,
  // its border kept wherever it sits (inside a widget's card too, where a notice drops its own).
  alert: ({ type, title, children }) => {
    const tone = ALERT[type] ?? ALERT.info;
    return (
      <div
        role="note"
        aria-label={typeof title === "string" && title ? title : tone.label}
        className="relative mb-4 rounded-panel border border-line bg-surface py-3 pr-4 pl-10"
      >
        <span
          aria-hidden="true"
          className={`absolute top-3 bottom-3 left-2 w-0.5 rounded-full ${tone.rail}`}
        />
        <tone.Icon aria-hidden="true" size={16} className={`absolute top-3.5 left-4 ${tone.ink}`} />
        {title ? <p className="m-0 mb-1 font-semibold text-ink">{title}</p> : null}
        <div className={`[&>:last-child]:mb-0 ${title ? "text-ink-muted" : "text-ink"}`}>
          {children}
        </div>
      </div>
    );
  },
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
   * Draw the page as it is served, with no component of the kit: the elements
   * and the stylesheet the site uses, behaving as the site's script makes them.
   * For a preview that must match the site.
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
    if (asServed) {
      return renderReact(tree, {
        ...options,
        components: { ...servedComponents(more), ...components },
      });
    }
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
    <div className={asServed ? "vd-doc vd-served" : "vd-doc"}>
      <style href="volvel-doc" precedence="default">
        {DOC_CSS + THEMED}
      </style>
      {drawn}
    </div>
  );
}
