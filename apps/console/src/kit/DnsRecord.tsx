import { CopyButton } from "../ListScreen.tsx";
import { Code } from "./status.tsx";

/** The TXT record a name's owner publishes, as the API sends it. */
export type ChallengeRecord = { name: string; host: string; zone: string; value: string };

function Line({
  label,
  note,
  value,
  copy,
}: {
  label: string;
  note?: string;
  value: string;
  copy: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="min-w-0">
        <span className="block text-body-sm text-ink-muted">
          {note ? `${label} (${note})` : label}
        </span>
        <Code wrap>{value}</Code>
      </span>
      <CopyButton value={value} label={copy} />
    </div>
  );
}

/**
 * The DNS record that shows a name agrees, for hostnames and for single sign-on domains alike:
 * the type, the host as most providers want it (relative to the zone), the full name, the value.
 * Providers that append the zone to what is typed turn the full name into a doubled one.
 */
export function DnsRecord({ record }: { record: ChallengeRecord }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 rounded-control border border-line bg-sunken p-3">
        <span className="min-w-0">
          <span className="block text-body-sm text-ink-muted">Type</span>
          <Code>TXT</Code>
        </span>
        <Line label="Host" note="at most DNS providers" value={record.host} copy="Copy host" />
        <Line label="Full name" value={record.name} copy="Copy full name" />
        <Line label="Value" value={record.value} copy="Copy value" />
      </div>
      <p className="m-0 text-body-sm text-ink-muted">
        Most DNS providers add the zone, taken here to be {record.zone}, to what you type in Host,
        so type the host and not the full name. If your provider's zone is different, use the full
        name.
      </p>
    </div>
  );
}
