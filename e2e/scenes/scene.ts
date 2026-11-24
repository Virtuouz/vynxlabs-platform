import type { Page } from "@playwright/test";

/**
 * What a scene of the documentation's pictures is given, and what it gives back.
 *
 * A scene builds, through the API, what one or more shots show, once, before any shot
 * is taken. Each area keeps its scenes in a file of its own (`e2e/scenes/<area>.ts`),
 * and its shots in `packages/docs/shots/<area>.mjs`; a shot's `setup` names its scene.
 */
export type Scene = (given: Given) => Promise<Built>;

export type Given = {
  /** The instance's administrator, signed in: the page the API is called from. */
  page: Page;
  /** Calls `/api/v1<path>` as the administrator; a draft save names the revision it saw. */
  // biome-ignore lint/suspicious/noExplicitAny: answers are inspected freely
  call: (method: string, path: string, body?: unknown) => Promise<any>;
  /** A short, unique word for this run, for names that must not clash with an earlier one. */
  stamp: string;
  /** The tenant the pictures are taken in, made for this run ("Fernhill", slug pictures-<stamp>). */
  tenant: { id: string };
  /** Its workspaces: `dev` (Dev) and `sandbox` (Sandbox), both of type dev. */
  workspaces: { dev: string; sandbox: string };
  /**
   * Fernhill, as `examples/fernhill/setup/setup.mjs` seeds it (the release seeds it before the
   * pictures are taken): its tenant and its workspaces by slug. Its people sign in with the
   * seed's password; name one in a shot's `as` as "fernhill:<email>".
   */
  fernhill:
    | {
        id: string;
        workspaces: Record<string, string>;
        /** Calls the API as Maya Brooks, Fernhill's tenant admin (the administrator is not a member). */
        // biome-ignore lint/suspicious/noExplicitAny: answers are inspected freely
        call: (method: string, path: string, body?: unknown) => Promise<any>;
      }
    | undefined;
};

export type Built = {
  /**
   * Where the shots of this scene start: an address such as `/t/<tenant>/workspaces/<id>`,
   * which a shot's `address` follows after a slash. A shot whose `address` starts with "/"
   * is opened as it is (an instance screen, say), and this is not used.
   */
  at: string;
  /** People this scene made, by a key a shot names in `as`: { email, password }. */
  people?: Record<string, { email: string; password: string }>;
};
