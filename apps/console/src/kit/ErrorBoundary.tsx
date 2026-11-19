import { Button, Notice } from "@volvel/ui";
import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * Keeps one failing part of the console from emptying the whole page. What it
 * wraps is replaced by a notice that says what failed, with a way to try again
 * and a way back; everything outside it, such as the navigation, keeps working.
 *
 * `resetOn` clears a caught failure when it changes, such as the page's address,
 * so moving elsewhere starts clean. It is not a `key`: a key would remount what
 * it wraps on every change of address, even one that keeps the same screen, such
 * as a new script's first save.
 */
export class ErrorBoundary extends Component<
  {
    /** What failed, in the notice's words: "This page", "The command palette". */
    what: string;
    children: ReactNode;
    /** A smaller notice, for a panel rather than a page. */
    compact?: boolean;
    /** When this changes, a failure shown is cleared and what it wraps is tried again. */
    resetOn?: unknown;
  },
  { error: Error | undefined }
> {
  override state: { error: Error | undefined } = { error: undefined };

  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  override componentDidUpdate(previous: { resetOn?: unknown }) {
    if (this.state.error && previous.resetOn !== this.props.resetOn) {
      this.setState({ error: undefined });
    }
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    // No client error route exists yet; the browser console is where it is kept.
    console.error(`${this.props.what} failed`, error, info.componentStack);
  }

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const retry = (
      <span className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="small"
          onClick={() => this.setState({ error: undefined })}
        >
          Try again
        </Button>
        {this.props.compact ? null : (
          <>
            <Button variant="secondary" size="small" onClick={() => location.reload()}>
              Reload
            </Button>
            <Button variant="quiet" size="small" onClick={() => history.back()}>
              Go back
            </Button>
          </>
        )}
      </span>
    );
    return (
      <div className={this.props.compact ? "" : "p-4 md:p-8"}>
        <Notice tone="danger" action={retry}>
          <p className="m-0 font-medium">{this.props.what} could not be shown.</p>
          <p className="m-0 text-meta">{error.message || "Something went wrong."}</p>
        </Notice>
      </div>
    );
  }
}
