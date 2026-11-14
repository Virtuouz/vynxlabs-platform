import type { ReactNode } from "react";

/**
 * One entry in an app's navigation. With `href` it is a link to another page.
 * With `onSelect` it switches the screen in the browser, for an app that keeps
 * its screens in one page; mark the one showing with `current`.
 */
export type PageNavItem = {
  label: string;
  /** Marks the page or screen the person is on. */
  current?: boolean;
  /** A count shown after the label, such as how many wait. */
  count?: number;
} & ({ href: string; onSelect?: undefined } | { onSelect: () => void; href?: undefined });

export interface PageShellProps {
  /** The app's name, shown in the header. */
  title: string;
  /** A second line under the name: a place, a team. */
  subtitle?: ReactNode;
  /** Address of a logo image, shown before the title. Nothing is shown for null. */
  logo?: string | null;
  nav?: PageNavItem[];
  /** What sits at the right-hand end of the header: an account menu, say. */
  actions?: ReactNode;
  /**
   * How wide the page may grow. `regular`, the default, keeps lines readable;
   * `full` gives boards and tables the whole window.
   */
  width?: "regular" | "full";
  children: ReactNode;
}

/**
 * The frame of an app page: a header with the app's name, its navigation and
 * a place for the account menu, then the page itself. On a narrow screen the
 * navigation moves to a row of its own that scrolls sideways.
 */
export function PageShell({
  title,
  subtitle,
  logo,
  nav,
  actions,
  width = "regular",
  children,
}: PageShellProps) {
  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-1 border-b border-line bg-surface px-4 py-2 sm:px-6">
        <div className="flex min-w-0 items-center gap-2">
          {logo ? <img src={logo} alt="" className="size-7 shrink-0 rounded-control" /> : null}
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-base font-semibold">{title}</span>
            {subtitle ? (
              <span className="truncate text-[13px] text-ink-muted">{subtitle}</span>
            ) : null}
          </div>
        </div>
        {nav && nav.length > 0 ? (
          <nav
            aria-label="Main"
            className="order-last -mx-1 flex w-full gap-1 overflow-x-auto px-1 pb-1 sm:order-none sm:mx-0 sm:w-auto sm:px-0 sm:pb-0"
          >
            {nav.map((item) => {
              const classes = `inline-flex shrink-0 items-center gap-1.5 rounded-control px-2.5 py-1.5 font-medium whitespace-nowrap no-underline ${
                item.current ? "bg-action-soft text-action" : "text-ink-muted hover:bg-sunken"
              }`;
              const content = (
                <>
                  {item.label}
                  {item.count !== undefined && item.count > 0 ? (
                    <span className="rounded-full bg-attention-soft px-1.5 text-xs text-attention tabular-nums">
                      {item.count}
                    </span>
                  ) : null}
                </>
              );
              return item.href !== undefined ? (
                <a
                  key={item.label}
                  href={item.href}
                  aria-current={item.current ? "page" : undefined}
                  className={classes}
                >
                  {content}
                </a>
              ) : (
                <button
                  key={item.label}
                  type="button"
                  onClick={item.onSelect}
                  aria-current={item.current ? "page" : undefined}
                  className={classes}
                >
                  {content}
                </button>
              );
            })}
          </nav>
        ) : null}
        {actions ? <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div> : null}
      </header>
      <main
        className={`mx-auto w-full px-4 py-5 sm:px-6 ${width === "full" ? "max-w-none" : "max-w-6xl"}`}
      >
        {children}
      </main>
    </div>
  );
}
