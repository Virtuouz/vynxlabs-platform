import { Fragment, type PointerEvent } from "react";

/**
 * Gives an element that cuts its text the whole of it as a hover title, only
 * while it is cut. Put on `onPointerEnter`. The text itself stays whole in the
 * page, so a screen reader reads all of it.
 */
export function fullOnHover(event: PointerEvent<HTMLElement>) {
  const element = event.currentTarget;
  const cut = [element, ...element.querySelectorAll<HTMLElement>("[data-cut]")].some(
    (one) => one.scrollWidth > one.clientWidth + 1,
  );
  if (cut) element.title = (element.dataset.full ?? element.textContent ?? "").trim();
  else element.removeAttribute("title");
}

/**
 * Where a value is cut: its start and its last part show ("billing/…/record-payment"). A space at
 * the cut is kept as a no-break space: each part is a box of its own, and a space at the edge of a
 * box is dropped ("Fire it now" would read "Fire itnow").
 */
export function split(value: string): [string, string] {
  const slash = value.lastIndexOf("/");
  const [head, tail] =
    slash > 0 && slash < value.length - 1
      ? [value.slice(0, slash), value.slice(slash)]
      : (() => {
          const length = Math.min(8, Math.floor(value.length / 3));
          return [value.slice(0, value.length - length), value.slice(value.length - length)];
        })();
  return [head.replace(/ $/, "\u00a0"), tail.replace(/^ /, "\u00a0")];
}

/**
 * Text that may not fit (07 §7.3, P4-7). Prose is cut at its end. A path or a
 * name is cut in its middle: what comes before its last part gives way first,
 * so `billing/record-payment` reads `bil…/record-payment` and stays
 * recognisable. The whole value shows on hover while it is cut, and is always
 * read whole by a screen reader. Never wraps.
 */
export function Truncate({
  children,
  mode = "end",
  className = "",
}: {
  children: string;
  mode?: "end" | "middle";
  className?: string;
}) {
  if (mode === "end") {
    return (
      <span
        data-cut=""
        onPointerEnter={fullOnHover}
        className={`block min-w-0 truncate ${className}`}
      >
        {children}
      </span>
    );
  }
  const [head, tail] = split(children);
  return (
    <span
      data-full={children}
      // A long one is cut on a phone, where there is no hover: its whole is the title from the start.
      {...(children.length > 24 ? { title: children } : {})}
      onPointerEnter={fullOnHover}
      className={`flex min-w-0 max-w-full whitespace-nowrap ${className}`}
    >
      <span className="sr-only">{children}</span>
      <span aria-hidden="true" data-cut="" className="min-w-0 shrink-[1000] truncate">
        {head}
      </span>
      <span aria-hidden="true" data-cut="" className="min-w-0 truncate">
        {tail}
      </span>
    </span>
  );
}

/**
 * Text that wraps where it has natural breaks: after an @, a dot, a dash, an underscore or a
 * slash. An email in a narrow cell then breaks as "fernhill.<br>example", never "exampl<br>e".
 * The words are unchanged: a break opportunity is not a character, so copying gives the text whole.
 */
export function Breakable({ children }: { children: string }) {
  const parts = children.split(/(?<=[@.\-_/])/);
  return (
    <>
      {parts.map((part, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: the parts are a fixed split of one string
        <Fragment key={index}>
          {index > 0 ? <wbr /> : null}
          {part}
        </Fragment>
      ))}
    </>
  );
}
