import {
  CheckboxField,
  MultiSelectField,
  NumberField,
  type Option,
  SelectField,
  TextField,
} from "@volvel/ui";
import { useLoad } from "../api.ts";

/**
 * What a script, or a trigger source, runs with: the settings the editor and the script's own
 * page both set. They are one set of fields, so that a limit added to one is in the other.
 */

/** What a code resource may use and the settings it takes, as the manifest holds them. */
export interface Uses {
  connections: string[];
  secrets: string[];
  variables: string[];
  /** A script's, besides the three a trigger source also has. */
  tables?: string[];
  sources?: string[];
  events?: string[];
  connectionGroups?: string[];
  [more: string]: string[] | undefined;
}

export interface LimitsBody {
  timeoutSeconds?: number;
  memoryMb?: number | undefined;
  concurrency?: number | { key: string; limit: number } | undefined;
  worker?: string | undefined;
  onFailure?: { script?: string; notify?: string } | undefined;
  retries?: { limit: number; delaySeconds: number; backoff: boolean };
  uses?: Uses;
  [more: string]: unknown;
}

export const NO_USES: Uses = { connections: [], secrets: [], variables: [] };
export const usesOf = (of: LimitsBody): Uses => of.uses ?? NO_USES;

/** Reads the names a workspace offers for a script's `uses`. */
export function useChoices(root: string, list: string, key: string): Option[] {
  const loaded = useLoad<{ items: Record<string, string>[] }>(`${root}/${list}`);
  return (loaded.data?.items ?? []).map((item) => ({
    value: item[key] as string,
    label: item[key] as string,
    ...(item.description ? { hint: item.description } : {}),
  }));
}

/** Every list a script's settings choose from. */
export function useCodeChoices(root: string) {
  const pools = useLoad<{ items: { name: string | null }[] }>(
    `${root.split("/workspaces/")[0]}/worker-pools`,
  );
  return {
    connections: useChoices(root, "connection-bindings", "path"),
    secrets: useChoices(root, "secrets", "name"),
    variables: useChoices(root, "variable-values", "path"),
    tables: useChoices(root, "tables", "name"),
    sources: useChoices(root, "data-source-bindings", "path"),
    groups: useChoices(root, "connection-groups", "path"),
    events: useChoices(root, "resources?kind=event", "path"),
    scripts: useChoices(root, "scripts", "path"),
    pools,
  };
}
export type CodeChoices = ReturnType<typeof useCodeChoices>;

export function LimitsFields({
  kind,
  noun,
  body,
  change,
  changeFailure,
  readOnly,
  fieldError,
  choices,
}: {
  kind: "script" | "connector" | "trigger_source";
  noun: string;
  body: LimitsBody;
  change: (next: Partial<LimitsBody>) => void;
  changeFailure: (next: { script?: string | undefined; notify?: string | undefined }) => void;
  readOnly: boolean;
  fieldError: (pointer: string) => string | undefined;
  choices: CodeChoices;
}) {
  const uses = usesOf;
  const { connections, secrets, variables, tables, sources, groups, events, pools } = choices;
  const scriptChoices = choices.scripts;
  return (
    <>
      {kind === "connector" ? null : (
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            name="timeout"
            label="Give up after (seconds)"
            value={body.timeoutSeconds}
            min={1}
            max={kind === "script" ? 3600 : 300}
            disabled={readOnly}
            error={fieldError("/body/timeoutSeconds")}
            onChange={(value) => change({ timeoutSeconds: value ?? (kind === "script" ? 60 : 30) })}
          />
          {body.retries ? (
            <NumberField
              name="retries"
              label="Try again (times)"
              value={body.retries.limit}
              min={0}
              max={10}
              disabled={readOnly}
              onChange={(value) =>
                change({
                  retries: { delaySeconds: 30, backoff: true, ...body.retries, limit: value ?? 0 },
                })
              }
            />
          ) : null}
          {body.retries ? (
            <NumberField
              name="retry-delay"
              label="Wait between tries (seconds)"
              value={body.retries.delaySeconds}
              min={0}
              max={3600}
              disabled={readOnly}
              error={fieldError("/body/retries/delaySeconds")}
              onChange={(value) =>
                change({
                  retries: { limit: 0, backoff: true, ...body.retries, delaySeconds: value ?? 30 },
                })
              }
            />
          ) : null}
          {body.retries ? (
            <CheckboxField
              name="retry-backoff"
              label="Wait longer after each failed try"
              checked={body.retries.backoff}
              disabled={readOnly}
              onChange={(checked) =>
                change({
                  retries: { limit: 0, delaySeconds: 30, ...body.retries, backoff: checked },
                })
              }
            />
          ) : null}
        </div>
      )}
      {kind === "connector" ? null : (
        <>
          <MultiSelectField
            label="Connections it uses"
            options={connections}
            value={uses(body).connections}
            disabled={readOnly}
            placeholder="None"
            hint={`A ${noun} reaches only what it names here.`}
            onChange={(value) => change({ uses: { ...uses(body), connections: value } })}
          />
          <MultiSelectField
            label="Secrets it reads"
            options={secrets}
            value={uses(body).secrets}
            disabled={readOnly}
            placeholder="None"
            onChange={(value) => change({ uses: { ...uses(body), secrets: value } })}
          />
          <MultiSelectField
            label="Variables it reads"
            options={variables}
            value={uses(body).variables}
            disabled={readOnly}
            placeholder="None"
            onChange={(value) => change({ uses: { ...uses(body), variables: value } })}
          />
        </>
      )}
      {kind === "connector" ? null : (
        <SelectField
          name="worker"
          label="Worker pool"
          value={body.worker ?? ""}
          disabled={readOnly}
          options={[
            { value: "", label: "The default pool" },
            ...[
              ...new Set([
                ...(pools.data?.items ?? []).flatMap((pool) => (pool.name ? [pool.name] : [])),
                ...(body.worker ? [body.worker] : []),
              ]),
            ].map((name) => ({ value: name, label: name })),
          ]}
          hint={`Where a run of this ${noun} happens. Pick a pool only when it has to run in a particular place, such as inside a client's network. Test and failure alerts use it too.`}
          onChange={(worker) => change({ worker: worker === "" ? undefined : worker })}
        />
      )}
      {kind === "script" ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <NumberField
              name="memory"
              label="Memory (MB)"
              value={body.memoryMb}
              min={64}
              max={4096}
              step={1}
              placeholder="512"
              disabled={readOnly}
              error={fieldError("/body/memoryMb")}
              hint="The most a run may use. Past it, the run fails. Empty: 512."
              onChange={(value) => change({ memoryMb: value })}
            />
            <NumberField
              name="concurrency"
              label="Runs at once"
              value={
                typeof body.concurrency === "object" ? body.concurrency.limit : body.concurrency
              }
              min={1}
              max={64}
              step={1}
              disabled={readOnly}
              error={fieldError("/body/concurrency")}
              hint="Empty: no limit of its own."
              onChange={(limit) => {
                const key = typeof body.concurrency === "object" ? body.concurrency.key : "";
                change({
                  concurrency: limit === undefined ? undefined : key ? { key, limit } : limit,
                });
              }}
            />
          </div>
          <TextField
            name="concurrencyKey"
            label="One lane for each value of"
            value={typeof body.concurrency === "object" ? body.concurrency.key : ""}
            required={false}
            placeholder="input.customer"
            disabled={readOnly || body.concurrency === undefined}
            hint="Where the value is in the input. Runs with the same value take turns, and runs with other values go ahead. Set runs at once first."
            onChange={(key) => {
              const limit =
                typeof body.concurrency === "object" ? body.concurrency.limit : body.concurrency;
              if (limit === undefined) return;
              change({ concurrency: key.trim() ? { key: key.trim(), limit } : limit });
            }}
          />
          <MultiSelectField
            label="Tables it reads and writes"
            options={tables}
            value={uses(body).tables ?? []}
            disabled={readOnly}
            placeholder="None"
            onChange={(value) => change({ uses: { ...uses(body), tables: value } })}
          />
          <MultiSelectField
            label="Data sources it uses"
            options={sources}
            value={uses(body).sources ?? []}
            disabled={readOnly}
            placeholder="None"
            onChange={(value) => change({ uses: { ...uses(body), sources: value } })}
          />
          <MultiSelectField
            label="Events it may publish"
            options={events}
            value={uses(body).events ?? []}
            disabled={readOnly}
            placeholder="None"
            onChange={(value) => change({ uses: { ...uses(body), events: value } })}
          />
          <MultiSelectField
            label="Connection groups it picks from"
            options={groups}
            value={uses(body).connectionGroups ?? []}
            disabled={readOnly}
            placeholder="None"
            onChange={(value) => change({ uses: { ...uses(body), connectionGroups: value } })}
          />
          <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
            <legend className="mb-1 text-body-sm font-medium">
              When a run fails for the last time
            </legend>
            <SelectField
              name="onFailureScript"
              label="If it fails for the last time, start"
              value={body.onFailure?.script ?? ""}
              disabled={readOnly}
              options={[
                { value: "", label: "Nothing of its own" },
                ...scriptChoices.map((one) => ({ value: one.value, label: one.label })),
              ]}
              hint="It is started with the failed run as its input. Its own choice replaces the workspace's default alert."
              onChange={(script) => changeFailure({ script: script || undefined })}
            />
            <SelectField
              name="onFailureNotify"
              label="and send a summary through"
              value={body.onFailure?.notify ?? ""}
              disabled={readOnly}
              options={[
                { value: "", label: "No connection" },
                ...connections.map((one) => ({ value: one.value, label: one.label })),
              ]}
              hint="An HTTP connection that is posted a summary."
              onChange={(notify) => changeFailure({ notify: notify || undefined })}
            />
          </fieldset>
        </>
      ) : null}
    </>
  );
}
