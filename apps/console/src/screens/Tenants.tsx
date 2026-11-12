import { api, isOperator, type Me } from "../api.ts";
import { ListScreen, when } from "../ListScreen.tsx";
import { Link } from "../router.tsx";
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
  return (
    <ListScreen<TenantRow>
      title="Tenants"
      description={
        operator
          ? "Every client organization on this instance. Opening one needs an access grant unless you are a member of it."
          : "The organizations you belong to."
      }
      path="/tenants?limit=200"
      rowKey={(row) => row.id}
      columns={[
        {
          header: "Name",
          cell: (row) => (
            <Link to={`/t/${row.id}/workspaces`} class="font-medium text-action">
              {row.name}
            </Link>
          ),
        },
        { header: "Slug", cell: (row) => <code class="font-mono text-[13px]">{row.slug}</code> },
        ...(operator
          ? [
              {
                header: "Tables kept in",
                cell: (row: TenantRow) => row.dataLocation ?? "The instance's database",
              },
            ]
          : []),
        { header: "Created", cell: (row) => when(row.createdAt) },
      ]}
      empty={{
        title: "No tenants yet",
        text: operator
          ? "A tenant is one client organization. Create the first one to start adding workspaces and members."
          : "Nobody has added you to a tenant yet. Ask your administrator.",
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
                  hint: "Leave empty for the instance's own database. Otherwise the name of a registered location. It is chosen once.",
                },
              ],
              submit: ({ name, slug, dataLocation }) =>
                api.post("/tenants", { name, slug, ...(dataLocation ? { dataLocation } : {}) }),
            },
            rowActions: (row: TenantRow, reload: () => void) => (
              <DeleteTenantButton tenant={row} onDone={reload} />
            ),
          }
        : {})}
    />
  );
}
