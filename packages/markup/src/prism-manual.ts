// Prism reads `Prism.manual` from the global as it loads, and highlights the whole page when it is not set. The
// markup also runs inside the console, so it says so first. This is its own module so that it runs before Prism does.
const scope = globalThis as { Prism?: { manual?: boolean } };
scope.Prism ??= { manual: true };
scope.Prism.manual = true;

export {};
