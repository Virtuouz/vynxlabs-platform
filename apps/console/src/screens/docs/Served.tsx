import {
  DOC_TYPE_LABELS,
  DOC_TYPE_PLURALS,
  DOC_TYPES,
  type DocSet,
  relatedTo,
  typeCardsOf,
} from "@volvel/docs-engine";
import { Panel } from "@volvel/ui";

/**
 * What a served page draws around its words when the site has types: the eyebrow over the title,
 * and under the page the cards of a collection's own page and the pages related to it. The same
 * rules as the served site's (`relatedTo`, `typeCardsOf`), so what is shown here is what is served.
 */
export function ServedEyebrow({ set, path }: { set: DocSet; path: string }) {
  const type = set.types[path];
  if (!type) return null;
  return (
    <p className="eyebrow m-0 mb-1 font-medium text-action text-label uppercase" data-type={type}>
      {DOC_TYPE_LABELS[type]}
    </p>
  );
}

export function ServedAfter({
  set,
  path,
  address,
}: {
  set: DocSet;
  path: string;
  /** The console's address of a page, by its path in the app. */
  address: (path: string) => string;
}) {
  const cards = typeCardsOf(set, path);
  const related = relatedTo(set, path);
  const kinds = DOC_TYPES.filter((one) => related[one]?.length);
  if (cards.length === 0 && kinds.length === 0) return null;
  return (
    <>
      {cards.length > 0 ? (
        <section aria-labelledby="preview-types" className="mt-8 flex flex-col gap-3">
          <h3 id="preview-types" className="m-0 text-title">
            What do you want to do?
          </h3>
          <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2">
            {cards.map((card) => (
              <li key={card.type} className="min-w-0">
                <Panel className="flex h-full flex-col gap-1 p-3" data-type={card.type}>
                  <h4 className="m-0 text-body font-medium">
                    <a className="text-ink hover:text-action" href={address(card.first.path)}>
                      {card.title}
                    </a>
                  </h4>
                  <p className="m-0 text-body-sm text-ink-muted">{card.summary}</p>
                  <a className="text-action text-body-sm" href={address(card.first.path)}>
                    {card.count} {card.count === 1 ? "page" : "pages"} →
                  </a>
                </Panel>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {kinds.length > 0 ? (
        <aside aria-labelledby="preview-related" className="mt-8 flex flex-col gap-3">
          <h3 id="preview-related" className="m-0 text-title">
            Related
          </h3>
          {kinds.map((kind) => (
            <section key={kind} data-type={kind} className="flex flex-col gap-1">
              <h4 className="m-0 text-label text-ink-subtle uppercase">{DOC_TYPE_PLURALS[kind]}</h4>
              <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
                {(related[kind] ?? []).map((page) => (
                  <li key={page.path}>
                    <a className="text-action" href={address(page.path)}>
                      {page.title}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </aside>
      ) : null}
    </>
  );
}
