import { parse } from "@volvel/markup";
import {
  Badge,
  Button,
  CheckboxField,
  ComboboxField,
  ContextMenu,
  Details,
  Dialog,
  Doc,
  Grid,
  Kbd,
  Menu,
  Notice,
  Popover,
  SegmentedControl,
  SelectField,
  SideSheet,
  Skeleton,
  Switch,
  Tabs,
  Term,
  TermScope,
  TextField,
  Toggletip,
  Tree,
  type TreeNode,
} from "@volvel/ui";
import { Ellipsis, GitCompareArrows, Table2 } from "lucide-react";
import { useState } from "react";
import { Identifier } from "../kit/copy.tsx";
import { DataTable } from "../kit/DataTable.tsx";
import { DiffView } from "../kit/DiffView.tsx";
import { duration } from "../kit/format.ts";
import { formatCombo } from "../kit/keys.ts";
import { ErrorState } from "../kit/LoadState.tsx";
import {
  EmptyCanvas,
  FilterChips,
  HeadNote,
  KeyValues,
  NextStep,
  PageHeader,
  Panel,
  SectionLabel,
  SettingsRow,
  SettingsRows,
  Stepper,
} from "../kit/layout.tsx";
import { InsetRule, JunctionList, PortBrackets, SignalPath } from "../kit/motifs.tsx";
import { SaveBar } from "../kit/SaveBar.tsx";
import { SecretField } from "../kit/SecretField.tsx";
import { SplitPane } from "../kit/SplitPane.tsx";
import { EnvTag, Mono, STATE_NAMES, StatePill, Tag } from "../kit/status.tsx";
import { Time } from "../kit/Time.tsx";
import { Truncate } from "../kit/Truncate.tsx";
import { ColumnsMenu } from "../kit/views.tsx";
import { KitDrawer } from "./KitDrawer.tsx";

const SWATCHES = [
  "canvas",
  "structure",
  "surface",
  "raised",
  "selected",
  "sunken",
  "line",
  "line-strong",
  "line-control",
  "ink",
  "ink-muted",
  "ink-subtle",
  "action",
  "action-soft",
  "attention",
  "danger",
  "success",
  "code-bg",
  "focus",
];

/**
 * Every token, type role, motif and state of the console's kit, as this
 * instance themes them: every state, every tone, every size of control, each
 * field in each of its states, the ways something loads and fails, and a list
 * at each density. Its pictures, light and dark, are compared on every change.
 */
const KIT_TREE: TreeNode[] = [
  {
    id: "support",
    label: "Support",
    children: [
      { id: "support/refunds", label: "Refunds" },
      {
        id: "support/escalations",
        label: "Escalations",
        children: [{ id: "support/escalations/tier-two", label: "Tier two" }],
      },
    ],
  },
  { id: "faq", label: "Questions" },
];

const KIT_DOC = parse(
  [
    "# Deploying",
    "",
    "Press :kbd[Ctrl+K] and choose **Deploy**, or run `volvel deploy`.",
    "",
    ":::alert[Before you deploy]{type=warning}",
    "Deleting a table drops its data.",
    ":::",
    "",
    ":::tabs",
    "::::tab{label=CLI}",
    "```sh",
    "volvel deploy --tenant acme --workspace sandbox",
    "```",
    "::::",
    "::::tab{label=Console}",
    "1. Open **Release**.",
    "2. Choose **Deploy**.",
    "::::",
    ":::",
    "",
    "| Workspace | Changes by |",
    "| --- | --- |",
    "| Dev | Saving, then deploy |",
    "| Production | Deploy or promotion only |",
  ].join("\n"),
);

export function KitSheet() {
  const [page, setPage] = useState("support/refunds");
  const [chip, setChip] = useState("all");
  const [stage, setStage] = useState("review");
  const [look, setLook] = useState("main");
  const [full, setFull] = useState(false);
  const [dialog, setDialog] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [inspectorTab, setInspectorTab] = useState("data");
  return (
    // Each sample of the kit is shown in a panel of its own: the polish measure of boxes in
    // boxes leaves the sheet out (e2e/measure.ts), and still measures what draws over what.
    <div className="flex flex-col gap-8" data-samples>
      <PageHeader
        eyebrow="Instance"
        title="Component kit"
        description="The console's parts as this instance draws them, in whichever theme is on. A reference for anyone changing the console or its branding."
      />

      <section className="flex flex-col gap-3">
        <SectionLabel>Tokens</SectionLabel>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {SWATCHES.map((token) => (
            <div key={token} className="flex flex-col gap-1.5">
              <span
                className="h-12 rounded-control border border-line"
                style={{ background: `var(--vx-${token})` }}
              />
              <code className="font-mono text-tag text-ink-muted">{token}</code>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <SectionLabel>Type roles</SectionLabel>
        <Panel className="flex flex-col gap-3 p-4">
          <p className="m-0 text-display-lg">Display large: an overview's title, 26 px</p>
          <p className="m-0 text-display">Display: a screen's title, 20 px</p>
          <p className="m-0 text-title">Title: a section, panel or dialog, 16 px</p>
          <p className="m-0 text-emphasis">Emphasis: a row's main line, 15 px</p>
          <p className="m-0 text-body">Body: what people read, 14 px</p>
          <p className="m-0 text-body-sm text-ink-muted">
            Body small: labels, hints, errors, 13 px
          </p>
          <p className="m-0 text-meta text-ink-muted">Meta: when, who, how long, 12 px</p>
          <p className="m-0 text-label text-ink-subtle uppercase">
            Label: a group's heading, 11 px
          </p>
          <p className="m-0 font-mono text-code">code · orders/sync · run_8812 · 2.41 s</p>
          <p className="m-0 font-mono text-code-sm">
            code small · 10:42:07 started step place_order
          </p>
        </Panel>
      </section>

      <section className="flex flex-col gap-3">
        <SectionLabel>Corners and elevation</SectionLabel>
        <div className="flex flex-wrap gap-4">
          {[
            ["rounded-inner", "Inner: tags, chips, cells"],
            ["rounded-control", "Control: buttons, inputs"],
            ["rounded-panel", "Panel: tables, panels"],
            ["rounded-overlay shadow-modal", "Overlay: dialogs, sheets"],
            ["rounded-panel shadow-overlay", "Raised: menus, toasts"],
          ].map(([classes, label]) => (
            <div
              key={label}
              className={`flex h-20 w-44 items-end border border-line bg-raised p-3 text-meta ${classes}`}
            >
              {label}
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <SectionLabel>Motifs</SectionLabel>
        <div className="grid gap-4 md:grid-cols-2">
          <Panel className="flex flex-col gap-3 p-4">
            <span className="text-meta text-ink-subtle">
              Signal path: where you are and where it goes
            </span>
            <SignalPath
              steps={[
                { key: "t", label: "Acme", kind: "plain" },
                { key: "w", label: "Orders dev", kind: "here" },
                { key: "p", label: "Orders production", kind: "production", loose: true },
              ]}
            />
          </Panel>
          <Panel className="flex flex-col gap-3 p-4">
            <span className="text-meta text-ink-subtle">Port brackets: the one chosen object</span>
            <PortBrackets className="w-fit">
              <div className="rounded-control border border-action bg-raised px-3 py-2">
                Send to ERP
              </div>
            </PortBrackets>
          </Panel>
          <Panel className="flex flex-col gap-3 p-4">
            <span className="text-meta text-ink-subtle">Inset rule: an inspector's heading</span>
            <div className="flex flex-col gap-1">
              <InsetRule />
              <span className="text-title">orders/sync</span>
            </div>
          </Panel>
          <Panel className="flex flex-col gap-3 p-4">
            <span className="text-meta text-ink-subtle">Junctions: an ordered history</span>
            <JunctionList
              items={[
                { key: "1", kind: "pending", content: "Draft · 3 changes" },
                { key: "2", kind: "here", content: "Dev · v14" },
                { key: "3", kind: "production", content: "Production · v13" },
              ]}
            />
          </Panel>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <SectionLabel>State and environment</SectionLabel>
        <Panel className="flex flex-col gap-4 p-4">
          <div className="grid grid-cols-2 gap-x-5 gap-y-2 sm:grid-cols-3 lg:grid-cols-5">
            {STATE_NAMES.map((state) => (
              <StatePill key={state} state={state} />
            ))}
            <StatePill state="waiting_time" until="2026-11-16T15:30:00Z" />
            <StatePill state="an_unknown_state" />
          </div>
          <div className="flex flex-wrap gap-2">
            <EnvTag type="dev" />
            <EnvTag type="production" />
            <Tag tone="draft">Draft</Tag>
            <Tag tone="repository">From repository</Tag>
            <Tag tone="live">Live</Tag>
            <Tag>Neutral</Tag>
            <Tag tone="attention">Attention</Tag>
            <Tag tone="danger">Danger</Tag>
            <Badge>3</Badge>
          </div>
        </Panel>
      </section>

      <section className="flex flex-col gap-3">
        <SectionLabel>Actions</SectionLabel>
        <Panel className="flex flex-col gap-3 p-4">
          <div className="flex flex-wrap gap-2">
            <Button variant="primary">Primary</Button>
            <Button>Secondary</Button>
            <Button variant="quiet">Quiet</Button>
            <Button variant="danger">Delete</Button>
            <Button variant="dashed">+ Add a step</Button>
            <Button variant="promote">Promote to production</Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="small">Small, 28</Button>
            <Button>Regular, 36</Button>
            <Button size="large">Large, 40</Button>
            <Button variant="primary" loading>
              Saving
            </Button>
            <Button disabled>Disabled</Button>
            <Button aria-pressed>Pressed</Button>
          </div>
          <p className="m-0 text-meta text-ink-muted">
            One primary per screen. The amber button is kept for the one action that changes
            production.
          </p>
        </Panel>
      </section>

      <section className="flex flex-col gap-3">
        <SectionLabel>Narrowing, stages and facts</SectionLabel>
        <Panel className="flex flex-col gap-5 p-4">
          <FilterChips
            label="Status"
            value={chip}
            onChange={setChip}
            options={[
              { value: "all", label: "All", count: 128 },
              { value: "failed", label: "Failed", count: 4 },
              { value: "waiting", label: "Waiting", count: 1 },
            ]}
          />
          <Stepper
            current={stage}
            onChoose={setStage}
            steps={[
              { key: "review", label: "Review draft", detail: "3 changes" },
              { key: "deploy", label: "Deploy to dev", detail: "v14 → v15" },
              { key: "promote", label: "Promote to production", detail: "v13 → v15" },
            ]}
          />
          <KeyValues
            rows={[
              { label: "Timeout", value: "120s", mono: true },
              { label: "Retries", value: "3 × 30s", mono: true },
              { label: "On failure", value: "alerts/run-failed", mono: true },
            ]}
          />
        </Panel>
      </section>

      <section className="flex flex-col gap-3">
        <SectionLabel>Status with a next step</SectionLabel>
        <Panel>
          <NextStep
            icon={<GitCompareArrows aria-hidden="true" size={16} />}
            title="3 drafts not deployed"
            detail="Saved here, and not yet running."
            action={<Button size="small">Review</Button>}
          />
        </Panel>
        <Notice tone="attention">A caution sits inline, with what to do about it.</Notice>
      </section>

      <section className="flex flex-col gap-3">
        <SectionLabel>Fields</SectionLabel>
        <Panel className="grid gap-4 p-4 md:grid-cols-2">
          <TextField name="kit-name" label="Required" required value="" onChange={() => {}} />
          <TextField
            name="kit-note"
            label="Optional, with a hint"
            required={false}
            hint="What is expected, said before anything goes wrong."
            value=""
            onChange={() => {}}
          />
          <TextField
            name="kit-slug"
            label="With an error"
            hint="Lowercase letters, digits and hyphens."
            error="That slug is taken."
            value="Acme"
            onChange={() => {}}
          />
          <SelectField
            name="kit-kind"
            label="A choice"
            value="dev"
            options={[
              { value: "dev", label: "Dev" },
              { value: "production", label: "Production" },
            ]}
            onChange={() => {}}
          />
          <ComboboxField
            label="A searchable choice"
            options={[
              { value: "utc", label: "UTC" },
              { value: "berlin", label: "Europe/Berlin", hint: "UTC+1" },
            ]}
            value="utc"
            onChange={() => {}}
          />
          <CheckboxField name="kit-check" label="A yes or no" checked onChange={() => {}} />
          <SecretField
            label="A stored secret"
            name="kit-secret"
            stored
            setAt="2026-11-01T10:00:00Z"
            setBy="ada@acme.example"
            value=""
            onChange={() => {}}
          />
        </Panel>
      </section>

      <section className="flex flex-col gap-3">
        <SectionLabel>Notices, loading and failing</SectionLabel>
        <div className="flex flex-col gap-3">
          <Notice tone="plain">A plain note.</Notice>
          <Notice tone="success">Something worked.</Notice>
          <Notice tone="attention">Something to look at.</Notice>
          <Notice tone="danger">Something failed.</Notice>
          <ErrorState
            error={Object.assign(new Error("The server could not be reached (502)."), {
              requestId: "req_kit_502",
            })}
            what="the runs"
            onRetry={() => {}}
          />
          <Panel className="p-4">
            <Skeleton lines={3} className="h-5 w-full" label="Loading an example" />
          </Panel>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <SectionLabel>A list, at each density</SectionLabel>
        <Panel className="flex flex-col">
          {(["compact", "standard"] as const).map((density) => (
            <DataTable<{ id: string; path: string; state: string; took: string }>
              key={density}
              label={`Runs, ${density}`}
              density={density}
              rows={[
                { id: "1", path: "orders/sync", state: "succeeded", took: "1.2 s" },
                { id: "2", path: "orders/charge", state: "failed", took: "0.4 s" },
                { id: "3", path: "stock/check", state: "running", took: "12 s" },
              ]}
              rowKey={(row) => row.id}
              columns={[
                { header: "State", cell: (row) => <StatePill state={row.state} /> },
                { header: "Path", cell: (row) => <Mono>{row.path}</Mono> },
                { header: "Took", align: "end", cell: (row) => <Mono>{row.took}</Mono> },
              ]}
              empty={{ title: "Nothing ran" }}
            />
          ))}
        </Panel>
      </section>

      <section className="flex flex-col gap-3">
        <SectionLabel>A grid of rows, from the keyboard</SectionLabel>
        {/* grid-allowed: the kit's own sheet shows the grid itself */}
        <Grid<{ id: string; item: string; held: number }>
          navigation="grid"
          density="compact"
          label="Kit grid"
          columns={[
            { name: "item", type: "text", editable: true },
            { name: "held", type: "integer", editable: true },
          ]}
          rows={[
            { id: "a", item: "Bolts", held: 120 },
            { id: "b", item: "Nuts", held: 340 },
          ]}
          rowKey={(row) => row.id}
          checked={new Set(["b"])}
          onCheck={() => {}}
          onEdit={async () => {}}
          empty="No rows"
        />
      </section>

      <section className="flex flex-col gap-3">
        <SectionLabel>Saving a page</SectionLabel>
        <div className="relative overflow-hidden rounded-panel border border-line">
          <SaveBar dirty guard={false} onSave={() => {}} onDiscard={() => {}} what="an example" />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <SectionLabel>Tooltips, keys and menus</SectionLabel>
        <Panel className="flex flex-wrap items-center gap-4 p-4">
          <Button tooltip="Undo moving a step" keys={formatCombo("Mod+Z")}>
            With a tooltip
          </Button>
          <Button disabled tooltip="Triggers change in a dev workspace.">
            Disabled, with why
          </Button>
          <span className="flex items-center gap-1">
            <Kbd>{formatCombo("Mod+K")}</Kbd>
            <Kbd>g then r</Kbd>
            <Kbd>?</Kbd>
          </span>
          <ContextMenu
            className="rounded-control border border-line border-dashed px-4 py-3 text-meta text-ink-muted"
            items={[
              { label: "Duplicate", keys: formatCombo("Mod+D"), onSelect: () => {} },
              { label: "Copy", keys: formatCombo("Mod+C"), onSelect: () => {} },
              { label: "Remove", danger: true, separated: true, onSelect: () => {} },
            ]}
          >
            Right-click here for a menu
          </ContextMenu>
          <ColumnsMenu
            columns={[
              { key: "target", label: "Target" },
              { key: "started", label: "Started" },
            ]}
            shown={undefined}
            onChange={() => {}}
          />
        </Panel>
      </section>

      <section className="flex flex-col gap-3">
        <SectionLabel>Help beside a word, a folded section and a tree</SectionLabel>
        <Panel className="grid gap-6 p-4 md:grid-cols-2">
          <TermScope>
            <div className="flex flex-col gap-3">
              <p className="m-0">
                Each{" "}
                <Term
                  id="workspace"
                  word="workspace"
                  short="A place where a tenant's resources live: a dev workspace, or production."
                >
                  workspace
                </Term>{" "}
                belongs to one tenant. A second mention of the workspace is plain:{" "}
                <Term id="workspace" word="workspace" short="Not shown.">
                  workspace
                </Term>
                .
              </p>
              <p className="m-0 flex items-center gap-1">
                Timezone
                <Toggletip label="About the timezone" title="Timezone">
                  A schedule runs at this zone's clock time, whatever the daylight-saving rules do.
                </Toggletip>
              </p>
              <Details summary="Why does production change only by deploy?">
                So that what runs is always what a repository or a release says.
              </Details>
            </div>
          </TermScope>
          <Tree label="Example pages" selected={page} onSelect={setPage} nodes={KIT_TREE} />
        </Panel>
      </section>

      <section className="flex flex-col gap-3">
        <SectionLabel>A page of documentation</SectionLabel>
        <Panel className="p-4">
          <Doc tree={KIT_DOC} headingShift={2} />
        </Panel>
      </section>

      <section className="flex flex-col gap-3">
        <SectionLabel>Rows checked, for a batch</SectionLabel>
        <Panel className="flex flex-col">
          <DataTable<{ id: string; path: string }>
            label="Runs checked"
            density="compact"
            rows={[
              { id: "1", path: "orders/sync" },
              { id: "2", path: "orders/charge" },
            ]}
            rowKey={(row) => row.id}
            columns={[{ header: "Path", cell: (row) => <Mono>{row.path}</Mono> }]}
            checked={new Set(["1", "2"])}
            onCheck={() => {}}
            batch={() => (
              <>
                <Button size="small" variant="danger">
                  Cancel
                </Button>
                <Button size="small">Run again</Button>
              </>
            )}
            empty={{ title: "Nothing ran" }}
          />
        </Panel>
      </section>

      <section className="flex flex-col gap-3">
        <SectionLabel>Panes, and a difference</SectionLabel>
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel className="h-40 overflow-hidden">
            <SplitPane
              id="kit-sheet"
              label="Resize the example panes"
              className="h-full"
              collapsible="second"
              paneLabels={{ first: "the first pane", second: "the second pane" }}
              minFirst={80}
              minSecond={80}
              first={
                <p className="m-0 p-3 text-meta text-ink-muted">
                  Drag, or Tab to the line and use the arrows; Enter folds the right.
                </p>
              }
              second={<p className="m-0 p-3 text-meta text-ink-muted">The second pane</p>}
            />
          </Panel>
          <DiffView
            before={"export default async () => {\n  return { stock: 4 };\n};"}
            after={'export default async () => {\n  throw new Error("The warehouse moved");\n};'}
            beforeLabel="v1, the last success"
            afterLabel="v2, the run that failed"
            maxHeight="10rem"
          />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <SectionLabel>Values, cut and whole</SectionLabel>
        <div className="grid gap-3 md:grid-cols-2">
          <Panel className="flex flex-col gap-3 p-4">
            <KeyValues
              rows={[
                { label: "Took", value: duration(252_000), mono: true },
                { label: "Started", value: <Time value="2026-11-16T16:38:54Z" mode="stamp" /> },
                {
                  label: "Run ID",
                  value: <Identifier value="01a1e7f7-0000-7000-8000-000000000999" label="Copy" />,
                },
              ]}
            />
            <div className="w-56 font-mono text-code">
              <Truncate mode="middle">billing/record-payment-and-reconcile-ledger</Truncate>
            </div>
            <div className="w-56">
              <Truncate>
                The SMS gateway refused the message because the sender is not registered
              </Truncate>
            </div>
            <Notice tone="attention">
              Inside a panel a notice keeps its tint and drops its border.
            </Notice>
          </Panel>
          <div className="flex flex-col gap-3">
            <PageHeader
              title="A list"
              description="What the list is for, kept behind help once it has been read."
              helpKey="kit-sheet"
              helpSeen
              oneRow
              state={<HeadNote>2 runs are waiting for a person.</HeadNote>}
            />
            <span className="flex flex-wrap gap-2">
              <EnvTag type="production" />
              <EnvTag type="dev" />
              <Tag tone="neutral">Instance · operator</Tag>
            </span>
            <SettingsRows label="Settings rows">
              <SettingsRow title="Copy workspace" action={<Button size="small">Clone</Button>}>
                One sentence on what it does, and its control on the right.
              </SettingsRow>
              <SettingsRow
                title={<span className="text-danger">Delete workspace</span>}
                action={
                  <Button size="small" variant="danger">
                    Delete
                  </Button>
                }
              >
                A row, not a red box.
              </SettingsRow>
            </SettingsRows>
          </div>
        </div>
      </section>

      <KitDrawer />

      <section className="flex flex-col gap-3">
        <SectionLabel>The boards' parts</SectionLabel>
        <Panel className="flex flex-col gap-5 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="main">Main</Button>
            <Button variant="normal">Normal</Button>
            <Button variant="quiet">Quiet</Button>
            <Button variant="danger">Danger</Button>
            <Button variant="dashed">+ Add a condition</Button>
            <Kbd>esc</Kbd>
            <Kbd>A</Kbd>
            <Kbd>{formatCombo("Mod+K")}</Kbd>
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            <SelectField
              name="kit-inline-clinic"
              label="Clinic"
              inline
              value="all"
              options={[
                { value: "all", label: "All" },
                { value: "north", label: "Northside" },
              ]}
              onChange={() => {}}
            />
            <SelectField
              name="kit-inline-issued"
              label="Issued"
              inline
              value="30"
              options={[{ value: "30", label: "Last 30 days" }]}
              onChange={() => {}}
            />
            <TextField
              name="kit-inline-search"
              label="Search"
              inline
              value=""
              placeholder="invoices"
              onChange={() => {}}
            />
            <Switch label="Full width" checked={full} onChange={setFull} />
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <SegmentedControl
              label="Button look"
              value={look}
              onChange={setLook}
              options={[
                { value: "main", label: "Main" },
                { value: "normal", label: "Normal" },
                { value: "quiet", label: "Quiet" },
              ]}
            />
            <SegmentedControl
              label="Line up"
              size="small"
              value="left"
              onChange={() => {}}
              options={[
                { value: "left", label: "Left" },
                { value: "right", label: "Right" },
                { value: "spread", label: "Spread" },
              ]}
            />
            <Switch label="Stored in cents" checked onChange={() => {}} />
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            <Tabs
              label="Underline tabs"
              tabs={[
                { id: "a", label: "Overview", content: "Underline tabs, as before." },
                { id: "b", label: "Runs", content: "The runs." },
              ]}
            />
            <Tabs
              label="Inspector tabs"
              variant="pills"
              dense
              value={inspectorTab}
              onChange={setInspectorTab}
              tabs={[
                {
                  id: "data",
                  label: "Data",
                  attention: "The table Invoices no longer exists.",
                  content: "Pills: a track, the open tab raised.",
                },
                { id: "display", label: "Display", content: "Display." },
                { id: "actions", label: "Actions", content: "Actions." },
                { id: "rules", label: "Rules", count: 2, content: "Rules." },
              ]}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Menu
              label={<Ellipsis aria-hidden="true" size={16} />}
              ariaLabel="More"
              triggerClassName="flex size-9 items-center justify-center rounded-control border border-line-strong hover:bg-hover"
              items={[
                { label: "Duplicate", onSelect: () => {}, icon: <Table2 size={14} />, keys: "⌘D" },
                { label: "Layout", onSelect: () => {}, current: true },
                { label: "Delete", onSelect: () => {}, danger: true, separated: true },
              ]}
            />
            <Popover trigger={<Button>Popover</Button>} title="Ready to publish">
              Three checks passed. One warning about a hidden widget.
            </Popover>
            <Button onClick={() => setDialog(true)}>Dialog</Button>
            <Button onClick={() => setSheet(true)}>Side sheet</Button>
          </div>
          <Notice tone="info">This page shows Invoices. Common next steps: Invoice detail.</Notice>
        </Panel>
      </section>

      <Dialog
        open={dialog}
        onClose={() => setDialog(false)}
        title="Add a form"
        icon={<Table2 size={16} />}
        footer={
          <>
            <span className="mr-auto text-meta text-ink-muted">
              Also adds a "New invoice" button.
            </span>
            <Button onClick={() => setDialog(false)}>Cancel</Button>
            <Button variant="main" onClick={() => setDialog(false)}>
              Create form
            </Button>
          </>
        }
      >
        <SelectField
          name="kit-dialog-table"
          label="Table"
          value="invoices"
          options={[{ value: "invoices", label: "Invoices" }]}
          onChange={() => {}}
        />
      </Dialog>
      <SideSheet
        open={sheet}
        onClose={() => setSheet(false)}
        title="Invoiced by week"
        description="Chart"
        icon={<Table2 size={16} />}
      >
        <Switch label="Full width" checked={full} onChange={setFull} />
      </SideSheet>

      <section className="flex flex-col gap-3">
        <SectionLabel>Empty canvas</SectionLabel>
        <EmptyCanvas
          title="No flows yet"
          text="A flow joins scripts and decisions into one process that a schedule, a webhook or an event starts."
          action={<Button variant="primary">New flow</Button>}
        />
      </section>
    </div>
  );
}
