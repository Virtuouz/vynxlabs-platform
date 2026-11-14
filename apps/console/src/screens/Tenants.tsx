import { Button } from "@vynxlabs/ui";
import { api, isOperator, type Me } from "../api.ts";
import { ListCollection } from "../kit/ListCollection.tsx";
import { KeyValues } from "../kit/layout.tsx";
import { Mono, Tag } from "../kit/status.tsx";
import { when } from "../ListScreen.tsx";
import { Link, navigate } from "../router.tsx";
import { DeleteTenantButton } from "./Environments.tsx";

interface TenantRow {
  id: string;
  slug: string;
  name: string;
  dataLocation: string | null;
  createdAt: string;
}

export function Tenants({ me }: { me: Me }) {
  const operator = isOperator(me);
  const member = (row: TenantRow) => me.tenants.some((tenant) => tenant.id === row.id);
  return (
    <ListCollection<TenantRow>
      title="Tenants"
      description={
        operator
          ? "Every client organization on this instance. Opening one needs an access grant unless you are a member of it."
          : "The organizations you belong to."
      }
      path="/tenants?limit=200"
      rowKey={(row) => row.id}
      search={(row) => `${row.name} ${row.slug}`}
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
        ...(operator
          ? [
              {
                header: "You",
                priority: 2 as const,
                cell: (row: TenantRow) =>
                  member(row) ? <Tag tone="live">Member</Tag> : <Tag>Through a grant</Tag>,
              },
              {
                header: "Tables kept in",
                priority: 3 as const,
                cell: (row: TenantRow) => row.dataLocation ?? "The instance's database",
              },
            ]
          : []),
        { header: "Created", priority: 3, cell: (row) => when(row.createdAt) },
      ]}
      empty={{
        title: "No tenants yet",
        text: operator
          ? "A tenant is one client organization. Create the first one to start adding workspaces and members."
          : "Nobody has added you to a tenant yet. Ask your administrator.",
      }}
      inspect={{
        title: (row) => row.name,
        eyebrow: () => "Tenant",
        body: (row) => (
          <KeyValues
            rows={[
              { label: "Slug", value: row.slug, mono: true },
              ...(operator
                ? [
                    {
                      label: "Your access",
                      value: member(row)
                        ? "A member"
                        : "Through an operator access grant, which needs a reason",
                    },
                    {
                      label: "Tables kept in",
                      value: row.dataLocation ?? "The instance's database",
                    },
                  ]
                : []),
              { label: "Created", value: when(row.createdAt) },
              { label: "ID", value: row.id, mono: true },
            ]}
          />
        ),
        footer: (row, reload, close) => (
          <>
            <Button variant="primary" onClick={() => navigate(`/t/${row.id}`)}>
              Open
            </Button>
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
                    path: "/instance/database-locations",
                    option: (item: { name: string }) => ({ value: item.name, label: item.name }),
                  },
                },
              ],
              submit: ({ name, slug, dataLocation }) =>
                api.post("/tenants", { name, slug, ...(dataLocation ? { dataLocation } : {}) }),
            },
          }
        : {})}
    />
  );
}
