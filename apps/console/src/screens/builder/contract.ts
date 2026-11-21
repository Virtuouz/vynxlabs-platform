/**
 * STAND-IN (phase 26, stream C2). These are the shapes of the contract's
 * `page-actions` answer and of the new `PageDataClient` members, written here
 * until `@volvel/screens` (stream B1) exports them. When it does, delete this
 * file and import `ActResponse`, `ClientStep` and `PageClientActions` from
 * `./renderer.ts` instead.
 */
import type { Page, PageWidget } from "@volvel/manifest";
import type { Choice } from "@volvel/widgets";
import type { WireData } from "./renderer.ts";

// Types the manifest's index does not export yet, taken from the ones it does.
export type PageKind = NonNullable<Page["kind"]>;
export type Action = NonNullable<PageWidget["on"]>[string];
export type Step = Action["steps"][number];
export type Condition = NonNullable<Action["when"]>[number];

/** A step the browser does, with each record resolved to an id. */
export type ClientStep =
  | { do: "open"; page: string; record?: string }
  | { do: "close" }
  | { do: "message"; text: string; tone?: "success" | "info" }
  | { do: "narrow"; filter: string; from: string }
  | { do: "rows" };

/** What `POST …/page-actions` answers when it worked. */
export interface ActResponse {
  client: ClientStep[];
  made?: { table: string; id: string };
  message?: string;
}

/** The members the renderer's `PageDataClient` gains. */
export interface PageClientActions {
  act(
    widget: string,
    at: string,
    given: { records?: { this?: string; event?: string }; inputs?: Record<string, unknown> },
  ): Promise<ActResponse>;
  choices(widget: string, input: string, column: string, search: string): Promise<Choice[]>;
  behind(widget: string, input: string, group: Record<string, unknown>): Promise<WireData>;
}
