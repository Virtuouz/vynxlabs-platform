import { useSyncExternalStore } from "react";

/**
 * Where the frames of a tenant's widgets are served from: the address apps are served at, and
 * the tenant's slug (the address names the tenant). Set once by whatever draws pages: the
 * served app, which is at that address already, and the console, which asks the instance.
 * `null` where the instance serves no widgets.
 */
export interface FrameSource {
  origin: string;
  slug: string;
}

let source: FrameSource | null = null;
const listeners = new Set<() => void>();

export function setFrameSource(next: FrameSource | null): void {
  if (source?.origin === next?.origin && source?.slug === next?.slug) return;
  source = next;
  for (const listener of listeners) listener();
}

export function useFrameSource(): FrameSource | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    () => source,
  );
}

/** `<origin>/_widgets/<tenant>/x/<name>@<version>/frame.html` */
export function frameUrl(from: FrameSource, type: string, version: string): string {
  return `${from.origin}/_widgets/${encodeURIComponent(from.slug)}/x/${encodeURIComponent(
    type.replace(/^x\//, ""),
  )}@${encodeURIComponent(version)}/frame.html`;
}
