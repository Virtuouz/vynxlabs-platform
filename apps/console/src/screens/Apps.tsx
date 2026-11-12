import { ListScreen } from "../ListScreen.tsx";

export interface AppSummary {
  id: string;
  path: string;
  title: string;
  description: string | null;
  url: string;
  domains: { hostname: string; url: string; enabled: boolean }[];
  files: number;
  bytes: number;
  /** Who is bound at the app itself: "anyone", "every end user", an email or a group's name. */
  access: string[];
}

const external = (url: string, text: string) => (
  <a href={url} target="_blank" rel="noreferrer" class="break-all text-action">
    {text}
  </a>
);

export const size = (bytes: number) =>
  bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 * 1024
      ? `${(bytes / 1024).toLocaleString(undefined, { maximumFractionDigits: 1 })} KB`
      : `${(bytes / (1024 * 1024)).toLocaleString(undefined, { maximumFractionDigits: 1 })} MB`;

/** The apps deployed to a workspace: where each is served and who may open it. */
export function Apps({ root }: { root: string }) {
  return (
    <ListScreen<AppSummary>
      title="Apps"
      description="Interfaces built in the repository and served by this instance. Each has an address here, and can have hostnames of the tenant's own under Domains."
      path={`${root}/apps`}
      rowKey={(row) => row.id}
      columns={[
        {
          header: "App",
          cell: (row) => (
            <span class="flex flex-col gap-0.5">
              <span class="font-medium">{row.title}</span>
              <code class="font-mono text-[13px] text-ink-muted">{row.path}</code>
              {row.description ? <span class="text-ink-muted">{row.description}</span> : null}
            </span>
          ),
        },
        {
          header: "Address",
          cell: (row) => (
            <span class="flex flex-col gap-0.5">
              {external(row.url, row.url)}
              {row.domains
                .filter((domain) => domain.enabled)
                .map((domain) => (
                  <span key={domain.hostname}>{external(domain.url, domain.hostname)}</span>
                ))}
            </span>
          ),
        },
        {
          header: "Files",
          cell: (row) => (
            <span class="whitespace-nowrap">
              {row.files.toLocaleString()} {row.files === 1 ? "file" : "files"}, {size(row.bytes)}
            </span>
          ),
        },
        {
          header: "Open to",
          cell: (row) =>
            row.access.length > 0 ? (
              row.access.join(", ")
            ) : (
              <span class="text-ink-muted">
                Only staff whose role lets them read this workspace
              </span>
            ),
        },
      ]}
      empty={{
        title: "No apps yet",
        text: "An app is defined in the tenant's repository with defineApp. It arrives here, with its files, when the repository is deployed to this workspace.",
      }}
    />
  );
}
