// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { InstanceHealth, type ReplicaSettings } from "./screens/InstanceHealth.tsx";
import { show } from "./testing.tsx";

const settings: ReplicaSettings = {
  managedWorkers: "host",
  runSlots: 6,
  runMemoryFloorMb: null,
  managedWorkersMax: null,
  databasePoolSize: 10,
  dataPoolSize: 20,
  dataTenantConnections: null,
  dataStatementTimeoutMs: 15000,
  sqlStatementTimeoutMs: 30000,
  scheduleBacklogLimit: 0,
  triggersPausedByEnvironment: false,
  retention: { runsDays: 30, eventsDays: 30, refusalsDays: 14, auditDays: 365 },
  mail: { from: "volvel@example.test" },
  publicUrl: "https://volvel.example.test",
  appsAddress: "none",
  appsUrl: null,
  egressAllow: { networks: ["10.0.0.0/8"], hosts: [] },
  trustedProxies: 1,
  metricsToken: true,
  metricsWorkspaceLabels: true,
  telemetry: false,
};
let answers: Record<string, [number, unknown]>;

beforeEach(() => {
  answers = {
    "/api/v1/readyz": [
      200,
      {
        status: "ready",
        checks: { database: { ok: true, latencyMs: 4 }, objectStore: { ok: true } },
      },
    ],
    "/api/v1/instance": [200, { coreVersion: "0.9.1", migrationLevel: 88 }],
    "/api/v1/instance/master-key": [
      200,
      {
        masterKey: "aaaa1111aaaa1111",
        secondaryKey: "bbbb2222bbbb2222",
        current: { tenant_key: 3 },
        secondary: { tenant_key: 2 },
        unopened: [],
        secondaryRemovable: false,
      },
    ],
    "/api/v1/instance/settings": [200, settings],
  };
  vi.stubGlobal("fetch", async (address: string) => {
    const [status, body] = answers[String(address)] ?? [404, { title: "Not found" }];
    return new Response(JSON.stringify(body), { status });
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("Health says the version, the key's rotation, what the replica is set to and what metrics gives (INS-MP3, INS-MP4, HOST-MP2)", async () => {
  show(<InstanceHealth />);
  expect(await screen.findByText("Ready")).toBeTruthy();
  expect(await screen.findByText("0.9.1")).toBeTruthy();
  expect(screen.getByText("88")).toBeTruthy();
  const key = screen.getByRole("region", { name: "Master key" });
  expect(await within(key).findByText("aaaa1111aaaa1111")).toBeTruthy();
  expect(within(key).getByText(/Still sealed with the second key: 2 in tenant key/)).toBeTruthy();
  const replica = screen.getByRole("region", { name: "This replica" });
  expect(await within(replica).findByText("Started in a worker host")).toBeTruthy();
  expect(within(replica).getByText("10.0.0.0/8")).toBeTruthy();
  expect(within(replica).getByText("365 days")).toBeTruthy();
  const metrics = screen.getByRole("region", { name: "Metrics" });
  expect(within(metrics).getByText(/Set \(METRICS_TOKEN\)/)).toBeTruthy();
});

test("a replica that is not ready, and a database that takes no writes, are said (INS-MP3)", async () => {
  answers["/api/v1/readyz"] = [
    503,
    {
      status: "not_ready",
      checks: {
        database: { ok: false, error: "Error" },
        objectStore: { ok: true },
      },
    },
  ];
  show(<InstanceHealth />);
  expect(await screen.findByText("Not ready")).toBeTruthy();
  expect(screen.getByText("Down")).toBeTruthy();
  cleanup();
  answers["/api/v1/readyz"] = [
    200,
    {
      status: "ready",
      checks: { database: { ok: true, readOnly: true }, objectStore: { ok: true } },
    },
  ];
  show(<InstanceHealth />);
  expect(await screen.findByText("Takes no writes")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Check again" }));
});

test("a master key with nothing left under its second key says it can go (INS-MP4)", async () => {
  answers["/api/v1/instance/master-key"] = [
    200,
    {
      masterKey: "aaaa1111aaaa1111",
      secondaryKey: "bbbb2222bbbb2222",
      current: { tenant_key: 5 },
      secondary: { tenant_key: 0 },
      unopened: [],
      secondaryRemovable: true,
    },
  ];
  show(<InstanceHealth />);
  expect(await screen.findByText(/MASTER_KEY_SECONDARY can be removed/)).toBeTruthy();
});

test("p31 fc: Health says Volvel, never the platform, for what the database pool is for", async () => {
  show(<InstanceHealth />);
  const replica = await screen.findByRole("region", { name: "This replica" });
  await within(replica).findByText("Started in a worker host");
  expect(replica.textContent).toContain("for Volvel's own work");
  expect(replica.textContent).not.toMatch(/platform/i);
});
