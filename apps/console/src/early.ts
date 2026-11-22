/**
 * The builder's script, asked for at once when the address is a builder's, so that it arrives
 * beside the reads `index.html` started, not after the console has drawn and asked for it.
 */
export function startEarlyScripts(pathname: string) {
  if (/^\/t\/[^/]+\/workspaces\/[^/]+\/screens\/[^/]+/.test(pathname)) {
    void import("./screens/builder/AppBuilder.tsx");
  }
}
