/**
 * What a script may use of Node that the editor's web-worker library does not declare. A script
 * runs in Node and the compiler accepts `node:` imports, `Buffer` and `process`, so the editor
 * must not underline them. Plain text so a test can check it with the TypeScript compiler.
 */
export const NODE_TYPES = `
declare module "node:*";
declare const process: { env: Record<string, string | undefined>; [key: string]: any };
declare const Buffer: any;
type Buffer = any;
`;
