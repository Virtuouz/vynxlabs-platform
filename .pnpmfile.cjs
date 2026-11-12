// The authentication library lists the test runner as an optional peer, for
// its own test helpers. Left alone, pnpm satisfies that peer with our root
// test runner and ships it, and its build tooling, in the image.
const TEST_ONLY_PEERS = ["vitest"];

function readPackage(pkg) {
  if (pkg.name === "better-auth" || pkg.name?.startsWith("@better-auth/")) {
    for (const peer of TEST_ONLY_PEERS) {
      delete pkg.peerDependencies?.[peer];
      delete pkg.peerDependenciesMeta?.[peer];
    }
  }
  return pkg;
}

module.exports = { hooks: { readPackage } };
