// @vitest-environment happy-dom
import { cleanup, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Alerts } from "./screens/Alerts.tsx";
import { Dashboards } from "./screens/Dashboards.tsx";
import { Sources, Tables } from "./screens/Data.tsx";
import { EndUsers } from "./screens/EndUsers.tsx";
import { DatabaseLocations, TenantExport, WorkspaceSettings } from "./screens/Environments.tsx";
import { Scripts } from "./screens/Execution.tsx";
import { Files } from "./screens/Files.tsx";
import { Flows } from "./screens/Flows.tsx";
import { RepositorySettings } from "./screens/Git.tsx";
import { EndUserGroups, Groups } from "./screens/Groups.tsx";
import { InstanceMembers, Operators } from "./screens/Instance.tsx";
import { InstanceBranding } from "./screens/InstanceBranding.tsx";
import { InstanceTriggers } from "./screens/InstanceTriggers.tsx";
import { Interfaces } from "./screens/Interfaces.tsx";
import { AccessList, MemberList } from "./screens/Members.tsx";
import { EventPage, ScriptPage } from "./screens/ObjectPages.tsx";
import { Roles } from "./screens/Roles.tsx";
import { show } from "./testing.tsx";

// What a member who may only read sees (GOV-37, sweep-can): every screen that offers a change says
// that this is not theirs to make and what it takes, and the control to make it is off. The screens
// are drawn as the server would answer someone holding only the `:read` of what each one changes.

const base = "/tenants/t1";
const root = "/tenants/t1/workspaces/w1";
const link = "/t/t1/workspaces/w1";
const me = {
  principal: { type: "member", id: "m1", name: "Rae", email: "rae@acme.test" },
  instancePermissions: ["tenant:read"],
  tenants: [{ id: "t1", slug: "acme", name: "Acme" }],
};
let answers: Record<string, unknown>;

beforeEach(() => {
  answers = {};
  history.replaceState(null, "", "/");
  vi.stubGlobal("fetch", async (address: string) => {
    const path = address.replace("/api/v1", "");
    const body = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });
    if (path === "/me") return body(me);
    if (path.startsWith("/readyz")) return body({ status: "ready", checks: {} });
    if (path.includes("/access/member/")) {
      return body({ principal: {}, sources: [], permissions: [{ permission: "tenant:read" }] });
    }
    if (path.includes("/allowed?")) {
      // A grant on one script alone: asked about that script, it is held.
      const asked = decodeURIComponent(path);
      const one =
        asked.includes("permissions=run:write") && asked.includes("kind=script&path=jobs/nightly");
      return body({ allowed: one ? ["run:write"] : [] });
    }
    for (const [prefix, value] of Object.entries(answers)) {
      if (path.split("?")[0] === prefix) return body(value);
    }
    return body({ items: [] });
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Whether every control of that name is off: itself, or the fieldset round it. */
const off = (name: RegExp | string) =>
  screen.getAllByRole("button", { name }).every((control) => {
    const one = control as HTMLButtonElement;
    return one.disabled || (one.closest("fieldset") as HTMLFieldSetElement | null)?.disabled;
  });

/** The line that says what changing it takes: its words are split by a `code` element. */
const said = (permission: string) =>
  waitFor(() =>
    expect(document.body.textContent).toContain(`not change it. It needs ${permission}`),
  );

const readOnly = async (screenOf: ReactElement, button: RegExp | string, permission: string) => {
  show(screenOf);
  await said(permission);
  await screen.findAllByRole("button", { name: button });
  await waitFor(() =>
    expect(
      screen.getAllByRole("button", { name: button }).map((one) => one.outerHTML.slice(0, 80)),
    ).toEqual(expect.anything()),
  );
  expect(off(button), String(button)).toBeTruthy();
};

test("members, access, roles and groups of a tenant are read, not changed, without their write (GOV-37)", async () => {
  await readOnly(<MemberList base={base} />, "Add member", "member:write");
  cleanup();
  await readOnly(<AccessList base={base} />, "Give access", "binding:write");
  cleanup();
  await readOnly(<Roles base={base} />, "Create role", "role:write");
  cleanup();
  await readOnly(<Groups base={base} />, "Create group", "group:write");
  cleanup();
  await readOnly(<EndUserGroups base={base} />, "Create group", "end_user_group:write");
});

test("end users are read, not invited, without end_user:write (GOV-37)", async () => {
  await readOnly(<EndUsers base={base} />, "Invite an end user", "end_user:write");
});

test("the instance's members, operators and locations offer no change to someone who may not (GOV-37)", async () => {
  await readOnly(<InstanceMembers />, "Create member", "member:write");
  cleanup();
  await readOnly(<Operators />, "Add operator", "binding:write");
  cleanup();
  await readOnly(<DatabaseLocations />, "Register database", "instance:write");
});

test("the instance's branding and triggers are shown, and cannot be changed, without instance:write (GOV-37)", async () => {
  answers["/instance/branding"] = {
    named: false,
    productName: "Volvel",
    theme: { tokens: {}, dark: {} },
    logo: null,
  };
  answers["/instance/triggers"] = {
    paused: false,
    reason: null,
    byEnvironment: false,
    updatedAt: null,
  };
  show(<InstanceBranding />);
  await said("instance:write");
  cleanup();
  await readOnly(<InstanceTriggers />, "Pause every trigger", "instance:write");
});

test("a workspace's lists offer no new item to someone who may only read them (GOV-37)", async () => {
  await readOnly(<Tables root={root} link={link} />, /Create|Add|New/, "table:write");
  cleanup();
  await readOnly(<Sources root={root} link={link} />, /Connect|Add|New/, "data_source:write");
  cleanup();
  await readOnly(<Files root={root} />, "Upload file", "file:write");
  cleanup();
  await readOnly(<Dashboards root={root} link={link} />, "New dashboard", "dashboard:write");
  cleanup();
  await readOnly(<Interfaces root={root} link={link} editable />, "Make an app", "resource:write");
  cleanup();
  await readOnly(<Scripts root={root} link={link} editable />, "New script", "resource:write");
  cleanup();
  await readOnly(<Flows root={root} link={link} editable />, "New flow", "flow:write");
});

test("alerts, repository, export and workspace settings cannot be changed without their write (GOV-37)", async () => {
  answers[`${root}/alert-settings`] = { default: {}, overrides: [] };
  show(<Alerts root={root} link={link} workspaceRoot={root} editable />);
  await said("workspace:write");
  cleanup();
  answers[`${base}/git-repository`] = { repository: null };
  show(<RepositorySettings base={base} />);
  await said("git:write");
  cleanup();
  show(<TenantExport base={base} slug="acme" />);
  await said("export:write");
  cleanup();
  show(
    <WorkspaceSettings
      base={base}
      tenantId="t1"
      reload={() => {}}
      workspace={
        {
          id: "w1",
          name: "Main",
          slug: "main",
          type: "dev",
          linkedWorkspaceId: null,
        } as never
      }
    />,
  );
  await said("workspace:write");
});

test("a script page offers Run to someone let run that script alone, and an event page offers no change (GOV-37)", async () => {
  answers[`${root}/scripts`] = {
    items: [
      { path: "jobs/nightly", description: "", inputSchema: {}, deployed: true, lastRun: null },
      { path: "jobs/other", description: "", inputSchema: {}, deployed: true, lastRun: null },
    ],
  };
  show(<ScriptPage root={root} link={link} path="jobs/nightly" />);
  const run = await screen.findByRole("button", { name: /^Run/ });
  await waitFor(() =>
    expect((run.closest("fieldset") as HTMLFieldSetElement).disabled).toBe(false),
  );
  cleanup();
  show(<ScriptPage root={root} link={link} path="jobs/other" />);
  const other = await screen.findByRole("button", { name: /^Run/ });
  await waitFor(() =>
    expect((other.closest("fieldset") as HTMLFieldSetElement).disabled).toBe(true),
  );
  cleanup();
  answers[`${root}/resources/orders/placed`] = {
    id: "r1",
    kind: "event",
    path: "orders/placed",
    body: {},
    ownership: "ui",
    version: 1,
    updatedAt: "2026-11-01T00:00:00Z",
  };
  show(<EventPage root={root} link={link} path="orders/placed" />);
  const change = await screen.findByRole("button", { name: "Change its declaration" });
  await waitFor(() => expect((change as HTMLButtonElement).disabled).toBe(true));
});
