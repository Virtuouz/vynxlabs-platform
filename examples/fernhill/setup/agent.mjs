// Talks to the Clinics workspace over the Model Context Protocol as the phone
// assistant, with its service account's key, as an AI agent would.
//
//   node setup/agent.mjs list                  the tools it is offered
//   node setup/agent.mjs call <tool> '<json>'  call one
//
// The address and key are read from .platform/demo.json, written by setup.mjs.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const HERE = dirname(dirname(fileURLToPath(import.meta.url)));
const demo = JSON.parse(readFileSync(join(HERE, ".platform/demo.json"), "utf8"));
const [command, name, input] = process.argv.slice(2);

const transport = new StreamableHTTPClientTransport(new URL(demo.agent.mcp), {
  requestInit: { headers: { authorization: `Bearer ${demo.agent.key}` } },
});
const client = new Client({ name: "fernhill-phone-assistant", version: "1.0.0" });
await client.connect(transport);

if (command === "list") {
  const { tools } = await client.listTools();
  for (const tool of tools) {
    console.log(`\n${tool.name}\n  ${tool.description}`);
    console.log(`  input: ${JSON.stringify(tool.inputSchema)}`);
    if (tool.outputSchema) console.log(`  output: ${JSON.stringify(tool.outputSchema)}`);
  }
} else if (command === "call" && name) {
  const started = Date.now();
  const result = await client.callTool({ name, arguments: input ? JSON.parse(input) : {} });
  console.log(`(${Date.now() - started} ms${result.isError ? ", isError" : ""})`);
  for (const part of result.content ?? []) {
    console.log(part.type === "text" ? part.text : JSON.stringify(part));
  }
  if (result.structuredContent)
    console.log("structured:", JSON.stringify(result.structuredContent));
} else {
  console.error("Usage: node setup/agent.mjs list | call <tool> '<json>'");
  process.exitCode = 2;
}
await client.close();
