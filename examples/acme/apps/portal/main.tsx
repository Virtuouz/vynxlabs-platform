import {
  appContext,
  logoUrl,
  runScript,
  signOut,
  table,
  useQuery,
  useSession,
} from "@vynxlabs/app";
import {
  Badge,
  type BadgeTone,
  Button,
  Chart,
  EmptyState,
  Form,
  type FormSchema,
  Notice,
  PageShell,
  Table,
  Tabs,
  ToastProvider,
  useToast,
} from "@vynxlabs/ui";
import { useMemo } from "react";
import { createRoot } from "react-dom/client";
// Types only: none of the repository's server code reaches the browser.
import type { notices, orders } from "../../src/index.ts";
import "./styles.css";

const TONES: Record<string, BadgeTone> = {
  sent: "success",
  requested: "action",
  received: "neutral",
  refused: "danger",
};

const orderForm: FormSchema = {
  type: "object",
  properties: {
    number: { type: "string", title: "Order number", minLength: 1, maxLength: 40 },
    total: { type: "number", title: "Total", minimum: 0.01 },
    currency: { type: "string", title: "Currency", enum: ["EUR", "USD", "GBP"], default: "EUR" },
  },
  required: ["number", "total", "currency"],
};
const noticeForm: FormSchema = {
  type: "object",
  properties: {
    title: { type: "string", title: "Title", minLength: 1, maxLength: 120 },
    body: { type: "string", title: "Text", maxLength: 1000 },
  },
  required: ["title"],
};

function Orders() {
  const toast = useToast();
  const found = useQuery(() =>
    table<typeof orders>("orders").find({ sort: ["-created_at"], limit: 200 }),
  );
  const rows = found.data?.items ?? [];
  const byStatus = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of rows) {
      const status = row.status ?? "unknown";
      counts.set(status, (counts.get(status) ?? 0) + 1);
    }
    return [...counts].map(([status, count]) => ({ status, count }));
  }, [rows]);

  return (
    <div className="grid gap-6">
      {found.error ? <Notice tone="danger">{found.error.message}</Notice> : null}
      <Table
        rows={rows}
        rowKey={(row) => row.id}
        empty={
          <EmptyState title={found.loading ? "Loading your orders" : "No orders yet"}>
            {found.loading ? null : "Ask for one below and it will show here."}
          </EmptyState>
        }
        columns={[
          { header: "Order", cell: (row) => row.number },
          {
            header: "Status",
            cell: (row) => <Badge tone={TONES[row.status ?? ""] ?? "neutral"}>{row.status}</Badge>,
          },
          {
            header: "Total",
            align: "end",
            cell: (row) => `${(row.total ?? 0).toFixed(2)} ${row.currency ?? ""}`,
          },
          {
            header: "Placed",
            align: "end",
            cell: (row) => new Date(row.created_at).toLocaleDateString(),
          },
        ]}
      />
      {rows.length > 0 ? (
        <section className="rounded-panel border border-line bg-surface p-4">
          <Chart
            title="Orders by status"
            height={200}
            data={byStatus}
            spec={{
              mark: "bar",
              encoding: {
                x: { field: "status", type: "nominal", title: null, axis: { labelAngle: 0 } },
                y: { field: "count", type: "quantitative", title: "Orders" },
              },
            }}
          />
        </section>
      ) : null}
      <section className="max-w-md rounded-panel border border-line bg-surface p-4">
        <h2 className="mt-0 text-base">Ask for an order</h2>
        <Form
          schema={orderForm}
          submitLabel="Send"
          onSubmit={async (values) => {
            // A script does this, so the rule for what an order is lives in one place.
            await runScript("orders/request", values);
            toast.success(`Order ${values.number} was sent.`);
            found.reload();
          }}
        />
      </section>
    </div>
  );
}

function Notices() {
  const toast = useToast();
  const found = useQuery(() => table<typeof notices>("notices").find({ sort: ["-created_at"] }));
  const rows = found.data?.items ?? [];
  return (
    <div className="grid gap-6">
      <Table
        rows={rows}
        rowKey={(row) => row.id}
        empty={
          <EmptyState title="No notices">
            What you write here is shown on the public page.
          </EmptyState>
        }
        columns={[
          { header: "Title", cell: (row) => row.title },
          { header: "Text", cell: (row) => row.body ?? "" },
          {
            header: "",
            align: "end",
            cell: (row) => (
              <Button
                variant="danger"
                size="small"
                onClick={async () => {
                  await table<typeof notices>("notices").delete(row.id);
                  found.reload();
                }}
              >
                Remove
              </Button>
            ),
          },
        ]}
      />
      <section className="max-w-md rounded-panel border border-line bg-surface p-4">
        <h2 className="mt-0 text-base">Write a notice</h2>
        <Form
          key={rows.length}
          schema={noticeForm}
          submitLabel="Publish"
          onSubmit={async (values) => {
            await table<typeof notices>("notices").insert(
              values as { title: string; body?: string },
            );
            toast.success("Published.");
            found.reload();
          }}
        />
      </section>
    </div>
  );
}

function App() {
  const context = appContext();
  const { principal } = useSession();
  const staff = principal.type === "member";
  return (
    <PageShell
      title={context.app.title}
      logo={logoUrl()}
      actions={
        <span className="flex items-center gap-3 text-[13px] text-ink-muted">
          {principal.email ?? principal.name}
          {staff ? <Badge tone="action">Staff</Badge> : null}
          <Button
            size="small"
            onClick={async () => {
              await signOut();
              location.assign(`${context.portal}/sign-in`);
            }}
          >
            Sign out
          </Button>
        </span>
      }
    >
      {staff ? (
        <Tabs
          label="Sections"
          tabs={[
            { id: "orders", label: "All orders", content: <Orders /> },
            { id: "notices", label: "Notices", content: <Notices /> },
          ]}
        />
      ) : (
        <Orders />
      )}
    </PageShell>
  );
}

createRoot(document.getElementById("app") as HTMLElement).render(
  <ToastProvider>
    <App />
  </ToastProvider>,
);
