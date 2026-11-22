import {
  AddChip,
  CheckChip,
  ChipSet,
  ConditionEditor,
  type ConditionValue,
  DashedAdd,
  DrawerBlock,
  DrawerEditor,
  DrawerGroup,
  DrawerHeader,
  DrawerPanel,
  DrawerRow,
  DrawerTabs,
  type NumberFormat,
  NumberFormatRow,
  type Position,
  PositionPicker,
  RadioCards,
  SentenceChip,
  SortableRows,
  SortEditor,
  type SortKey,
  TilePicker,
  ToggleRow,
} from "@volvel/ui";
import {
  AlignLeft,
  BarChart3,
  Calendar,
  Hash,
  LineChart,
  List,
  PieChart,
  Table2,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { SectionLabel } from "../kit/layout.tsx";

const COLUMNS = [
  { id: "status", label: "Status", type: "choice", icon: List },
  { id: "issued", label: "Issued on", type: "date", icon: Calendar },
  { id: "total", label: "Total", type: "number", icon: Hash },
];

const OPERATORS = (type: string) =>
  type === "date"
    ? [
        { test: "within", label: "is in the last…" },
        { test: "lt", label: "is before" },
        { test: "gt", label: "is after" },
        { test: "between", label: "is between" },
        { test: "is_empty", label: "is empty", input: "none" as const },
      ]
    : type === "choice"
      ? [
          { test: "is", label: "is" },
          { test: "is_not", label: "is not" },
        ]
      : [
          { test: "gt", label: "is more than" },
          { test: "lt", label: "is less than" },
        ];

const CHOICES = (field: string) =>
  field === "status"
    ? [
        { value: "Paid", count: 1204 },
        { value: "Unpaid", count: 236 },
        { value: "Void", count: 18 },
      ]
    : undefined;

const FILTERS = ["Search", "Clinic", "Issued", "Status"];

/** The drawer kit (phase 28): the parts every widget's inspector is built from, as board 8 draws them. */
export function KitDrawer() {
  const [tab, setTab] = useState("data");
  const [followed, setFollowed] = useState(FILTERS);
  const [condition, setCondition] = useState<ConditionValue | undefined>({
    field: "status",
    test: "is_not",
    value: "Void",
  });
  const [draft, setDraft] = useState<ConditionValue | undefined>({
    field: "status",
    test: "is_not",
  });
  const [format, setFormat] = useState<NumberFormat>({ style: "currency", currency: "USD" });
  const [sorts, setSorts] = useState<SortKey[]>([{ field: "issued", direction: "desc" }]);
  const [limit, setLimit] = useState<number | undefined>(undefined);
  const [values, setValues] = useState(true);
  const [axis, setAxis] = useState(false);
  const [chart, setChart] = useState("bar");
  const [shows, setShows] = useState("detail");
  const [button, setButton] = useState("main");
  const [place, setPlace] = useState<Position>("top-left");
  const [columns, setColumns] = useState([
    { id: "number", label: "Number", value: "Text", hidden: false },
    { id: "clinic", label: "Clinic", value: "Text", hidden: false },
    { id: "client", label: "Client", sub: "from Client code", value: "Text", hidden: false },
    { id: "total", label: "Total", value: "$123.45", hidden: false },
    { id: "notes", label: "Notes", value: "Long text", hidden: true },
  ]);
  const [openColumn, setOpenColumn] = useState<string | undefined>("total");
  const sentence = condition ? COLUMNS.find((one) => one.id === condition.field) : undefined;

  return (
    <section className="flex flex-col gap-3" aria-label="Drawer">
      <SectionLabel>Drawer</SectionLabel>
      <div className="grid items-start gap-6 md:grid-cols-2 xl:grid-cols-3">
        <div className="flex flex-col gap-4 rounded-overlay border border-line bg-surface p-3">
          <DrawerHeader
            icon={BarChart3}
            name="Unpaid"
            kind="Stat"
            menu={<span className="text-ink-muted">⋯</span>}
          />
          <DrawerTabs
            idPrefix="kit-drawer"
            value={tab}
            onChange={setTab}
            tabs={[
              { id: "data", label: "Data", attention: "The table Invoices no longer exists." },
              { id: "display", label: "Display" },
              { id: "actions", label: "Actions", count: 2 },
              { id: "rules", label: "Rules" },
            ]}
          />
          <DrawerPanel idPrefix="kit-drawer" tab={tab}>
            <DrawerGroup label="Rows it uses">
              <DrawerRow label="Source" icon={Table2} value="Invoices" onClick={() => {}} />
              <DrawerBlock label="Follows 4 page filters · click to switch one off">
                <ChipSet label="Page filters">
                  {FILTERS.map((name) => (
                    <CheckChip
                      key={name}
                      checked={followed.includes(name)}
                      onChange={(on) =>
                        setFollowed(
                          on ? [...followed, name] : followed.filter((one) => one !== name),
                        )
                      }
                    >
                      {name}
                    </CheckChip>
                  ))}
                  <CheckChip checked={false} onChange={() => {}}>
                    Goal month
                  </CheckChip>
                </ChipSet>
              </DrawerBlock>
              <DrawerBlock label="Only include">
                <ChipSet>
                  {condition && sentence ? (
                    <SentenceChip
                      onRemove={() => setCondition(undefined)}
                      removeLabel={`Remove ${sentence.label} condition`}
                    >
                      {sentence.label} is not <strong>{String(condition.value)}</strong>
                    </SentenceChip>
                  ) : null}
                  <DrawerEditor
                    trigger={<AddChip>Condition</AddChip>}
                    title="Only include rows where"
                    side="bottom"
                    onDone={() => draft && setCondition(draft)}
                  >
                    <ConditionEditor
                      columns={COLUMNS}
                      operators={OPERATORS}
                      choices={CHOICES}
                      value={draft}
                      onChange={setDraft}
                      note="Status is a choice column, so you pick from its values instead of typing them."
                    />
                  </DrawerEditor>
                </ChipSet>
              </DrawerBlock>
            </DrawerGroup>
            <DrawerGroup label="What it shows">
              <DrawerRow label="Value" icon={Hash} value="Sum of · Total" onClick={() => {}} />
              <NumberFormatRow icon={Hash} value={format} onChange={setFormat} />
              <DrawerRow
                label="Sorted by"
                icon={List}
                value={`${COLUMNS.find((one) => one.id === sorts[0]?.field)?.label ?? ""}, newest first`}
                editorTitle="Sorted by"
                editorFooter={false}
                editor={
                  <SortEditor
                    fields={COLUMNS}
                    sorts={sorts}
                    onChange={setSorts}
                    limit={limit}
                    onLimit={setLimit}
                    limitOptions={[
                      { value: undefined, label: "All rows" },
                      { value: 10, label: "10 rows" },
                      { value: 100, label: "100 rows" },
                    ]}
                  />
                }
              />
              <DrawerRow label="Selected row" icon={Zap} value="Shown as selected" active />
            </DrawerGroup>
          </DrawerPanel>
        </div>

        <div className="flex flex-col gap-4 rounded-overlay border border-line bg-surface p-3">
          <DrawerGroup
            label="Chart type"
            note="Greyed types don't fit this data; the note says what they would need."
          >
            <DrawerBlock>
              <TilePicker
                label="Chart type"
                value={chart}
                onChange={setChart}
                options={[
                  { value: "bar", label: "Bar", icon: BarChart3 },
                  {
                    value: "pie",
                    label: "Pie",
                    icon: PieChart,
                    disabled: true,
                    reason: "not for time",
                  },
                  {
                    value: "line",
                    label: "Line",
                    icon: LineChart,
                    disabled: true,
                    reason: "needs a date",
                  },
                ]}
              />
            </DrawerBlock>
            <ToggleRow label="Show values on bars" checked={values} onChange={setValues} />
            <ToggleRow
              label="Show axis titles"
              help="Clinic along the bottom, Invoiced up the side"
              checked={axis}
              onChange={setAxis}
            />
          </DrawerGroup>
          <DrawerGroup label="When a row is clicked">
            <DrawerBlock>
              <RadioCards
                label="Shows"
                value={shows}
                onChange={setShows}
                options={[
                  { value: "nothing", title: "Do nothing" },
                  {
                    value: "detail",
                    title: "Open record detail",
                    line: "Passes the clicked invoice along",
                  },
                  { value: "page", title: "Go to a page", line: "Opens another page of the app" },
                ]}
              />
            </DrawerBlock>
          </DrawerGroup>
          <DrawerGroup label="Style">
            <DrawerBlock>
              <TilePicker
                label="Button style"
                columns={4}
                value={button}
                onChange={setButton}
                options={[
                  {
                    value: "main",
                    label: "Main",
                    preview: (
                      <span className="rounded-control bg-action px-2 py-1 text-meta font-medium text-action-ink">
                        Mark paid
                      </span>
                    ),
                  },
                  {
                    value: "normal",
                    label: "Normal",
                    preview: (
                      <span className="rounded-control border border-line-control px-2 py-1 text-meta font-medium">
                        Mark paid
                      </span>
                    ),
                  },
                  {
                    value: "quiet",
                    label: "Quiet",
                    preview: <span className="px-2 py-1 text-meta font-medium">Mark paid</span>,
                  },
                  {
                    value: "danger",
                    label: "Danger",
                    preview: (
                      <span className="rounded-control border border-danger px-2 py-1 text-meta font-medium text-danger">
                        Mark paid
                      </span>
                    ),
                  },
                ]}
              />
            </DrawerBlock>
          </DrawerGroup>
          <DrawerGroup label="Place in its cell">
            <DrawerBlock>
              <PositionPicker value={place} onChange={setPlace} />
            </DrawerBlock>
          </DrawerGroup>
        </div>

        <div className="flex flex-col gap-4 rounded-overlay border border-line bg-surface p-3">
          <DrawerGroup
            label="Columns"
            aside="4 of 5 shown"
            note="Drag to reorder, or Alt and the arrows. The eye hides."
          >
            <SortableRows
              label="Columns"
              items={columns}
              activeId={openColumn}
              onReorder={(ids) =>
                setColumns(ids.flatMap((id) => columns.filter((one) => one.id === id)))
              }
              onOpen={setOpenColumn}
              onToggleHidden={(id, hidden) =>
                setColumns(columns.map((one) => (one.id === id ? { ...one, hidden } : one)))
              }
            />
            <DrawerBlock>
              <DashedAdd inline>Column</DashedAdd>
            </DrawerBlock>
          </DrawerGroup>
          <DrawerGroup label="Steps">
            <DrawerBlock>
              <DashedAdd>Add a step</DashedAdd>
            </DrawerBlock>
            <DrawerRow label="Row actions" icon={AlignLeft} value="Two" mono onClick={() => {}} />
          </DrawerGroup>
        </div>
      </div>
    </section>
  );
}
