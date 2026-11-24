import { Button, SelectField } from "@volvel/ui";
import { api, isOperator, type Me, useLoad } from "../api.ts";
import { ListCollection } from "../kit/ListCollection.tsx";
import { KeyValues } from "../kit/layout.tsx";
import { Mono, Tag } from "../kit/status.tsx";
import { Time } from "../kit/Time.tsx";
import { Link, navigate, useUrlParam } from "../router.tsx";
import { ConsoleCodeButton, DeleteTenantButton, RenameTenantButton } from "./Environments.tsx";
import { TenantPowers } from "./TenantPowers.tsx";

interface TenantRow {
  id: string;
  slug: string;
  name: string;
  dataLocation: string | null;
  workspaceCount?: number;
  mayRename?: boolean;
  consoleCode?: boolean;
  createdAt: string;
}

export function Tenants({ me }: { me: Me }) {
  const operator = isOperator(me);
  const member = (row: TenantRow) => me.tenants.some((tenant) => tenant.id === row.id);
  // Kept in the address: a link from a database location, or a reload, shows the same list.
  const [location, setLocation] = useUrlParam("location", "");
  const locations = useLoad<{ items: { name: string }[] }>(
    operator ? "/instance/database-locations/names" : null,
  );
  return (
    <ListCollection<TenantRow>
      title="Tenants"
      description={
        operator
          ? "Every client organization on this instance. Opening one needs an access grant unless you are a member of it."
          : "The organizations you belong to."
      }
      path={location ? `/tenants?dataLocation=${encodeURIComponent(location)}` : "/tenants"}
      {...(operator && locations.data && locations.data.items.length > 0
        ? {
            filters: (
              <div className="w-full max-w-xs">
                <SelectField
                  name="location"
                  label="Tables kept in"
                  value={location}
                  options={[
                    { value: "", label: "Anywhere" },
                    ...locations.data.items.map((one) => ({ value: one.name, label: one.name })),
                    ...(location && !locations.data.items.some((one) => one.name === location)
                      ? [{ value: location, label: `${location} (not registered)` }]
                      : []),
                  ]}
                  onChange={(next) => setLocation(next || undefined)}
                />
              </div>
            ),
          }
        : {})}
      rowKey={(row) => row.id}
      paged
      columns={[
        {
          header: "Name",
          cell: (row) => (
            <span className="flex flex-col gap-0.5">
              <Link to={`/t/${row.id}`} className="font-medium text-action">
                {row.name}
              </Link>
              <Mono className="text-ink-subtle sm:hidden">{row.slug}</Mono>
            </span>
          ),
        },
        { header: "Slug", priority: 2, cell: (row) => <Mono>{row.slug}</Mono> },
        {
          header: "Workspaces",
          priority: 2,
          align: "end",
          cell: (row) => <Mono>{row.workspaceCount ?? "—"}</Mono>,
        },
        ...(operator
          ? [
              {
                header: "You",
                priority: 2 as const,
                cell: (row: TenantRow) =>
                  member(row) ? <Tag tone="live">Member</Tag> : <Tag>Not a member</Tag>,
              },
              {
                header: "Tables kept in",
                priority: 3 as const,
                cell: (row: TenantRow) => row.dataLocation ?? "The instance's database",
              },
            ]
          : []),
        {
          header: "Created",
          priority: 3,
          cell: (row) => <Time value={row.createdAt} mode="ago" />,
        },
      ]}
      empty={{
        title: location ? "No tenant keeps its tables there" : "No tenants yet",
        text: location
          ? `Pick another database location, or Anywhere, to see the rest. A tenant is placed in one when it is created or imported.`
          : operator
            ? "A tenant is one client organization. Create the first one to start adding workspaces and members."
            : "Nobody has added you to a tenant yet. Ask your administrator.",
      }}
      inspect={{
        title: (row) => row.name,
        eyebrow: () => "Tenant",
        body: (row) => (
          <div className="flex flex-col gap-5">
            <KeyValues
              rows={[
                { label: "Slug", value: row.slug, mono: true },
                { label: "Workspaces", value: String(row.workspaceCount ?? "—") },
                ...(operator
                  ? [
                      {
                        label: "Your access",
                        value: member(row)
                          ? "A member"
                          : "Not a member. Inside it you work through an operator access grant, which needs a reason.",
                      },
                      {
                        label: "Tables kept in",
                        value: row.dataLocation ? (
                          <Link
                            to={`/instance/databases?item=${encodeURIComponent(row.dataLocation)}`}
                            className="text-action"
                          >
                            {row.dataLocation}
                          </Link>
                        ) : (
                          "The instance's database"
                        ),
                      },
                    ]
                  : []),
                { label: "Created", value: <Time value={row.createdAt} mode="stamp" /> },
                { label: "ID", value: row.id, mono: true },
              ]}
            />
            {operator ? <TenantPowers tenant={row} /> : null}
          </div>
        ),
        footer: (row, reload, close) => (
          <>
            <Button variant="primary" onClick={() => navigate(`/t/${row.id}`)}>
              Open
            </Button>
            <RenameTenantButton tenant={row} onDone={reload} />
            <ConsoleCodeButton tenant={row} onDone={reload} />
            {operator ? (
              <DeleteTenantButton
                tenant={row}
                onDone={() => {
                  close();
                  reload();
                }}
              />
            ) : null}
          </>
        ),
      }}
      {...(operator
        ? {
            create: {
              action: "Create tenant",
              fields: [
                { name: "name", label: "Name", placeholder: "Acme Corp" },
                {
                  name: "slug",
                  label: "Slug",
                  placeholder: "acme",
                  hint: "Lowercase letters, digits and hyphens. It cannot be changed later.",
                },
                {
                  name: "dataLocation",
                  label: "Database location",
                  required: false,
                  placeholder: "The instance's own database",
                  hint: "Leave empty for the instance's own database. It is chosen once.",
                  choose: {
                    path: "/instance/database-locations/names",
                    option: (item: { name: string }) => ({ value: item.name, label: item.name }),
                  },
                },
                {
                  name: "addCreator",
                  label: "Make me a member, as tenant admin",
                  type: "checkbox",
                  initial: "true",
                  hint: "Then you work inside it as its own people do. Without it, you see inside only through an access grant, which ends and is recorded.",
                },
              ],
              // Made, then opened: its first steps are inside it.
              submit: async ({ name, slug, dataLocation, addCreator }) => {
                const made = await api.post<{ id: string }>("/tenants", {
                  name,
                  slug,
                  ...(dataLocation ? { dataLocation } : {}),
                  addCreator: addCreator === "true",
                });
                navigate(`/t/${made.id}`);
                return made;
              },
              done: (made, values) => ({
                message: `Tenant ${values.name} is made.`,
                link: { label: `Open ${values.name}`, href: `/t/${(made as { id: string }).id}` },
              }),
            },
          }
        : {})}
    />
  );
}
