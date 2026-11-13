import type { ReactNode } from "react";

export interface PageNavItem {
  label: string;
  href: string;
  /** Marks the page the person is on. */
  current?: boolean;
}

export interface PageShellProps {
  /** The app's name, shown in the header. */
  title: string;
  /** Address of a logo image, shown before the title. */
  logo?: string;
  nav?: PageNavItem[];
  /** What sits at the right-hand end of the header: an account menu, say. */
  actions?: ReactNode;
  children: ReactNode;
}

/**
 * The frame of an app page: a header with the app's name, its navigation and
 * a place for the account menu, then the page itself. On a narrow screen the
 * navigation moves to a row of its own that scrolls sideways.
 */
export function PageShell({ title, logo, nav, actions, children }: PageShellProps) {
  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-1 border-b border-line bg-surface px-4 py-2 sm:px-6">
        <div className="flex min-w-0 items-center gap-2">
          {logo ? <img src={logo} alt="" className="size-7 shrink-0 rounded-control" /> : null}
          <span className="truncate text-base font-semibold">{title}</span>
        </div>
        {nav && nav.length > 0 ? (
          <nav
            aria-label="Main"
            className="order-last flex w-full gap-1 overflow-x-auto sm:order-none sm:w-auto"
          >
            {nav.map((item) => (
              <a
                key={item.href}
                href={item.href}
                aria-current={item.current ? "page" : undefined}
                className={`rounded-control px-2.5 py-1.5 font-medium whitespace-nowrap no-underline ${
                  item.current ? "bg-action-soft text-action" : "text-ink-muted hover:bg-sunken"
                }`}
              >
                {item.label}
              </a>
            ))}
          </nav>
        ) : null}
        {actions ? <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div> : null}
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6">{children}</main>
    </div>
  );
}
