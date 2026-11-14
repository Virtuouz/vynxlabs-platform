import { appContext, signInUrl, table, useQuery, useSession } from "@vynxlabs/app";
import { EmptyState, Notice, PageShell } from "@vynxlabs/ui";
import { createRoot } from "react-dom/client";
import type { notices } from "../../src/index.ts";
import "./styles.css";

function App() {
  const context = appContext();
  const { signedIn } = useSession();
  const found = useQuery(() =>
    table<typeof notices>("notices").find({ sort: ["-created_at"], limit: 20 }),
  );
  // The portal is the app beside this one.
  const portal = new URL("../portal/", new URL(context.base, location.origin)).pathname;
  return (
    <PageShell
      title={context.app.title}
      nav={[
        {
          label: signedIn ? "Your orders" : "Sign in to your orders",
          href: signedIn ? portal : signInUrl(portal),
        },
      ]}
    >
      {found.error ? <Notice tone="danger">{found.error.message}</Notice> : null}
      {found.data?.length === 0 ? (
        <EmptyState title="Nothing to report">Deliveries are running as usual.</EmptyState>
      ) : null}
      <div className="grid max-w-2xl gap-3">
        {found.data?.map((notice) => (
          <article key={notice.id} className="rounded-panel border border-line bg-surface p-4">
            <h2 className="m-0 text-base">{notice.title}</h2>
            {notice.body ? <p className="mt-1 mb-0 text-ink-muted">{notice.body}</p> : null}
            <p className="mt-2 mb-0 text-xs text-ink-muted">
              {new Date(notice.created_at).toLocaleString()}
            </p>
          </article>
        ))}
      </div>
    </PageShell>
  );
}

createRoot(document.getElementById("app") as HTMLElement).render(<App />);
