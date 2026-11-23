import { type DataInput, defineApp, defineInterface, defineQuery } from "@volvel/sdk";
import { REASONS } from "./constants.ts";

/**
 * Clinic operations: the app that shows what the app builder can do, as a veterinary group
 * would use it. Every page kind, every widget, every kind of data source and every step an
 * action can take is used somewhere sensible. The README's table says where.
 *
 * It is for practice managers, who are members of the tenant (as Clinic performance is), and
 * it reads the same tables as the other apps, so it adds no table, script or flow of its own.
 * Its one resource besides the app is a saved query, because that is a data source a page may
 * read and no table of Fernhill's could stand in for it.
 */

// ----- Formats -----

/** Money is kept in cents and shown in dollars. */
const DOLLARS = { style: "currency", currency: "USD", minorUnits: true } as const;
/** Whole dollars, for big figures. */
const WHOLE = { ...DOLLARS, decimals: 0 } as const;
/** $43.1k, for a chart's axis and small places. */
const SHORT = { ...DOLLARS, notation: "compact" } as const;
/** Minutes and counts: no currency. */
const COUNT = { style: "number" } as const;
/** A number written with no thousands separator. */
const PLAIN = { style: "number", grouping: false } as const;

/** Who may mark an invoice paid, and see what is only for them: by the groups' keys. */
const BILLING = ["groups/practice-managers", "groups/billing"];
const MANAGERS = ["groups/practice-managers"];

const INVOICE_BADGES = { paid: "success", unpaid: "attention", void: "neutral" } as const;
const VISIT_BADGES = {
  booked: "neutral",
  checked_in: "attention",
  in_exam: "action",
  done: "success",
  no_show: "danger",
  cancelled: "neutral",
} as const;

/** A widget's place on its grid of twelve columns. */
const at = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });

// ----- The saved query -----

/** One row per vet: how many visits, how many seen to the end, how long a visit is booked for. */
export const vetWorkload = defineQuery({
  path: "reports/vet-workload",
  description:
    "Visits for each vet over a stretch of days: booked, finished, and the usual length.",
  sql: `select vet, count(*) as visits,
    count(*) filter (where status = 'done') as finished,
    round(avg(minutes)) as usual_minutes
  from appointments
  where vet is not null
    and ($1::date is null or starts_at::date >= $1::date)
    and ($2::date is null or starts_at::date <= $2::date)
  group by vet
  order by visits desc`,
  parameters: [
    { name: "from", type: "date", label: "From" },
    { name: "to", type: "date", label: "To" },
  ],
});

// ----- Page filters and how data follows them -----

const INVOICE_SEARCH = ["number", "client_code", "payment_ref"];
const VISIT_SEARCH = ["pet_name", "client_code", "reason"];
const STOCK_SEARCH = ["item", "sku"];

/** What the Money bar narrows an invoice by. */
const invoiceFilters = () => [
  { filter: "q", columns: INVOICE_SEARCH },
  { filter: "clinic", column: "clinic" },
  { filter: "issued", column: "issued_on" },
  { filter: "status", column: "status" },
];

/** What the Visits bar narrows a visit by. */
const visitFilters = () => [
  { filter: "q", columns: VISIT_SEARCH },
  { filter: "clinic", column: "clinic" },
  { filter: "when", column: "starts_at" },
];

const stockFilters = () => [
  { filter: "q", columns: STOCK_SEARCH },
  { filter: "clinic", column: "clinic" },
];

const NOT_VOID = { column: "status", op: "ne" as const, value: "void" };

/** One value of the invoices, narrowed by the Money bar. */
const invoiceStat = (
  measure: { fn: "sum" | "avg" | "count" | "count_distinct" | "min" | "max"; column?: string },
  only: { column: string; op: string; value?: unknown }[] = [NOT_VOID],
): Record<string, DataInput> => ({
  value: {
    source: {
      visual: {
        table: "invoices",
        filters: only as never,
        measures: [{ ...measure, as: "value" }],
      },
    },
    filters: invoiceFilters(),
  },
});

const visitCount = (
  only: { column: string; op: string; value?: unknown }[] = [],
  filters = visitFilters(),
): Record<string, DataInput> => ({
  value: {
    source: {
      visual: {
        table: "appointments",
        ...(only.length > 0 ? { filters: only as never } : {}),
        measures: [{ fn: "count", as: "visits" }],
      },
    },
    filters,
  },
});

const visitsBy = (
  groupBy: { column: string; bucket?: "day" | "week" | "month" | "quarter" | "year" }[],
  extra: { sort?: { by: string; descending?: boolean }[]; limit?: number; joins?: string[] } = {},
): Record<string, DataInput> => ({
  rows: {
    source: {
      visual: {
        table: "appointments",
        ...extra,
        groupBy,
        measures: [{ fn: "count", as: "visits" }],
      },
    },
    filters: visitFilters(),
  },
});

const invoicesBy = (
  groupBy: { column: string; bucket?: "day" | "week" | "month" | "quarter" | "year" }[],
  extra: { sort?: { by: string; descending?: boolean }[]; limit?: number; joins?: string[] } = {},
): Record<string, DataInput> => ({
  rows: {
    source: {
      visual: {
        table: "invoices",
        ...extra,
        filters: [NOT_VOID],
        groupBy,
        measures: [{ fn: "sum", column: "total", as: "invoiced" }],
      },
    },
    filters: invoiceFilters(),
  },
});

// ----- Actions -----

/** A click on a row opens its record in a page (a side sheet, a record page or a modal). */
const opens = (page: string) => ({
  rowClick: { steps: [{ do: "open" as const, page, record: "event" as const }] },
});

/** Moving a visit on, by the script the front desk uses. */
const moveVisit = (of: "this" | "event", to: string, from: string, done: string) => ({
  when: [{ field: "status", of, test: "is" as const, value: from }],
  steps: [
    {
      do: "script" as const,
      path: "appointments/set-status",
      input: { appointment: { record: "id", of }, status: { value: to } },
    },
    { do: "message" as const, text: done, tone: "success" as const },
  ],
});

/** A practice manager or Billing marks an invoice paid: greyed for anyone else, and refused by the server. */
const markPaid = (of: "this" | "event") => ({
  when: [{ field: "status", of, test: "is" as const, value: "unpaid" }],
  runBy: { groups: BILLING },
  confirm: { title: "Mark as paid?", text: "Mark {number} as paid?", button: "Mark paid" },
  steps: [
    {
      do: "update" as const,
      record: of,
      set: { status: { value: "paid" }, paid_at: { now: true as const } },
    },
    { do: "message" as const, text: "Invoice marked paid", tone: "success" as const },
  ],
});

const voidInvoice = (of: "this" | "event") => ({
  when: [{ field: "status", of, test: "is" as const, value: "unpaid" }],
  runBy: { groups: MANAGERS },
  confirm: {
    title: "Void this invoice?",
    text: "Void {number}? It stops counting as owed, and it can't be paid. Say why, for the record.",
    button: "Void",
    ask: [{ name: "why", label: "Why is it voided?", type: "long_text" as const }],
  },
  steps: [
    {
      do: "update" as const,
      record: of,
      set: { status: { value: "void" }, payment_ref: { asked: "why" } },
    },
    { do: "message" as const, text: "Invoice voided", tone: "success" as const },
  ],
});

/** Texting the owner about one invoice, with the script the Monday flow uses. */
const remindOwner = (of: "this" | "event") => ({
  when: [
    { field: "status", of, test: "is" as const, value: "unpaid" },
    { field: "chased_at", of, test: "is_empty" as const },
  ],
  confirm: {
    title: "Text the owner?",
    text: "Text the owner about {number}. Only an invoice more than two weeks old is texted.",
    button: "Send the text",
  },
  steps: [
    {
      do: "script" as const,
      path: "billing/chase-one",
      input: { invoice: { record: "id", of } },
    },
    {
      do: "message" as const,
      text: "Asked. An invoice younger than two weeks is left alone.",
      tone: "info" as const,
    },
  ],
});

const REORDER_LINE = {
  id: "reorder",
  label: "Reorder",
  action: {
    when: [
      { field: "reorder_pending", of: "event" as const, test: "is_not" as const, value: true },
    ],
    confirm: {
      title: "Order more?",
      text: "Order {reorder_qty} more of {item} for {clinic}? An order over the threshold waits for a practice manager.",
      button: "Order",
    },
    steps: [
      {
        do: "flow" as const,
        path: "inventory/reorder",
        input: {
          line: { record: "id", of: "event" as const },
          clinic: { record: "clinic", of: "event" as const },
          sku: { record: "sku", of: "event" as const },
          item: { record: "item", of: "event" as const },
          on_hand: { record: "on_hand", of: "event" as const },
          quantity: { record: "reorder_qty", of: "event" as const },
        },
      },
      {
        do: "message" as const,
        text: "The order is on its way to be priced.",
        tone: "info" as const,
      },
    ],
  },
};

const COUNT_LINE = {
  id: "count",
  label: "Count",
  action: {
    confirm: {
      title: "Count {item}",
      text: "How many of {item} are on the shelf at {clinic}?",
      button: "Save the count",
      ask: [
        { name: "counted", label: "Counted on the shelf", type: "number" as const, required: true },
      ],
    },
    steps: [
      { do: "update" as const, record: "event" as const, set: { on_hand: { asked: "counted" } } },
      { do: "message" as const, text: "The count is saved.", tone: "success" as const },
    ],
  },
};

// ----- Fields shown in more than one place -----

const INVOICE_FIELDS = [
  { column: "clinic", section: "Invoice" },
  { column: "client_code", label: "Client", section: "Invoice" },
  { column: "issued_on", label: "Issued", section: "Invoice" },
  { column: "paid_at", label: "Paid on", section: "Payment" },
  { column: "payment_ref", label: "Payment reference or reason", section: "Payment" },
  { column: "chased_at", label: "Last reminded", section: "Notes" },
];

type Field = {
  column: string;
  label?: string;
  help?: string;
  format?: typeof DOLLARS;
  initial?: { kind: "today" };
};
const INVOICE_FORM_FIELDS: Field[] = [
  { column: "client_code", label: "Client", help: "The owner's client code, such as C-1001." },
  { column: "clinic" },
  { column: "total", label: "Total", format: DOLLARS },
  { column: "issued_on", label: "Issued", initial: { kind: "today" as const } },
  { column: "payment_ref", label: "Note", help: "Anything the owner or Billing should know." },
];

// ----- The app -----

export const operations = defineInterface({
  path: "screens/operations",
  title: "Clinic operations",
  description:
    "The day at the three clinics, money, pets and owners, stock and callbacks, for practice managers.",
  pages: [
    // ======================================================================
    // Today
    // ======================================================================
    {
      id: "today",
      title: "Today",
      icon: "house",
      widgets: [
        {
          // Filters sit behind a "Filters" button here: the page is about the day, not the bar.
          id: "filters",
          type: "core/filter",
          at: at(0, 0, 12, 2),
          config: {
            sit: "button",
            reset: true,
            filters: [
              { name: "q", label: "Search visits", type: "search" },
              {
                name: "clinic",
                label: "Clinic",
                type: "choice",
                from: { table: "appointments", column: "clinic" },
              },
              { name: "when", label: "When", type: "date_range", default: "last_7_days" },
            ],
          },
        },
        {
          id: "welcome",
          type: "core/text",
          at: at(0, 2, 12, 5),
          config: {
            look: "tip",
            text: "**A morning at Fernhill.** Start here, then follow the menu.\n\n:::steps\n1. Look at **Right now**: who is booked, who is waiting, who is done.\n2. Check in a visit from the table, or press it to open its record.\n3. Open **Stock** if a clinic is running low, and **Money** for what is unpaid.\n:::\n\nPress :kbd[Esc] to close any window this app opens.",
          },
        },
        {
          id: "now",
          type: "core/section",
          title: "Right now",
          subtitle: "In the range and at the clinics chosen. Folds away if you do not need it.",
          at: at(0, 7, 12, 6),
          config: { look: "card", folds: true },
        },
        {
          id: "booked",
          type: "core/stat",
          title: "Visits",
          in: { widget: "now" },
          at: at(0, 0, 3, 4),
          data: visitCount(),
          config: {
            caption: "Booked, in the range",
            format: COUNT,
            compare: true,
            compareTo: "when",
            delta: "absolute",
            goodWhen: "up",
            trendBy: "starts_at",
          },
          on: { click: { steps: [{ do: "rows" }] } },
          layout: { tablet: { at: at(0, 0, 6, 4) } },
        },
        {
          id: "waiting",
          type: "core/stat",
          title: "Not yet arrived",
          in: { widget: "now" },
          at: at(3, 0, 3, 4),
          data: visitCount([{ column: "status", op: "eq", value: "booked" }]),
          config: { caption: "Booked and expected", format: COUNT },
          layout: { tablet: { at: at(6, 0, 6, 4) } },
        },
        {
          id: "inside",
          type: "core/stat",
          title: "In the clinic",
          in: { widget: "now" },
          at: at(6, 0, 3, 4),
          data: visitCount([{ column: "status", op: "in", value: ["checked_in", "in_exam"] }]),
          config: { caption: "Checked in or with the vet", format: COUNT },
          layout: { tablet: { at: at(0, 4, 6, 4) } },
        },
        {
          id: "missed",
          type: "core/stat",
          title: "No-shows",
          in: { widget: "now" },
          at: at(9, 0, 3, 4),
          data: visitCount([{ column: "status", op: "eq", value: "no_show" }]),
          config: {
            caption: "Did not come",
            format: COUNT,
            compare: true,
            compareTo: "when",
            delta: "absolute",
            goodWhen: "down",
          },
          layout: { tablet: { at: at(6, 4, 6, 4) } },
        },
        {
          id: "tools",
          type: "core/actions",
          at: at(0, 13, 12, 1),
          config: {
            lineUp: "left",
            showUpTo: 3,
            place: "middle-left",
            actions: [
              {
                id: "day-sheet",
                label: "Visit sheet",
                tone: "primary",
                icon: "file-text",
                action: { steps: [{ do: "open", page: "day-sheet" }] },
              },
              {
                id: "request",
                label: "Take a visit request",
                tone: "default",
                icon: "inbox",
                action: { steps: [{ do: "open", page: "request-visit" }] },
              },
              {
                id: "invoice",
                label: "New invoice",
                tone: "default",
                icon: "receipt",
                action: { steps: [{ do: "open", page: "new-invoice" }] },
              },
              {
                // A flow, started from the page. Only practice managers may; others see it greyed.
                id: "chase",
                label: "Chase unpaid invoices",
                tone: "quiet",
                icon: "mail",
                action: {
                  runBy: { groups: MANAGERS },
                  confirm: {
                    title: "Chase unpaid invoices now?",
                    text: "This is what happens every Monday morning: owners with an invoice unpaid for two weeks are texted.",
                    button: "Start it",
                  },
                  steps: [
                    { do: "flow", path: "billing/chase-unpaid" },
                    { do: "message", text: "The chase has started.", tone: "info" },
                  ],
                },
              },
            ],
          },
        },
        {
          id: "board",
          type: "core/table",
          title: "Visits",
          subtitle: "Move a visit on from here, or press it to open it.",
          at: at(0, 14, 8, 13),
          data: {
            rows: {
              source: {
                visual: {
                  table: "appointments",
                  sort: [{ by: "starts_at" }],
                },
              },
              filters: visitFilters(),
            },
          },
          config: {
            groupRows: { column: "starts_at", by: "day" },
            rowHeight: "compact",
            pageSize: 15,
            empty: "No visits in this range. Widen it under Filters.",
            columns: [
              { column: "starts_at", label: "When", sortable: true },
              { column: "pet_name", label: "Pet" },
              { column: "clinic", phone: false },
              { column: "reason" },
              { column: "status", as: "badge", badges: { ...VISIT_BADGES } },
            ],
            rowActions: [
              {
                id: "check-in",
                label: "Check in",
                action: moveVisit("event", "checked_in", "booked", "Checked in"),
              },
              {
                id: "to-exam",
                label: "To the exam room",
                action: moveVisit("event", "in_exam", "checked_in", "With the vet"),
              },
              {
                id: "finish",
                label: "Finish",
                action: moveVisit("event", "done", "in_exam", "Done. The invoice is on its way."),
              },
              {
                id: "no-show",
                label: "No-show",
                tone: "danger",
                action: {
                  ...moveVisit("event", "no_show", "booked", "Marked as a no-show"),
                  confirm: {
                    title: "Mark {pet_name} as a no-show?",
                    text: "The owner is not texted. You can book the visit again.",
                    button: "No-show",
                  },
                },
              },
            ],
          },
          on: opens("visit"),
        },
        {
          id: "waiting-room",
          type: "core/list",
          title: "Waiting room",
          subtitle: "Checked in, oldest first.",
          at: at(8, 14, 4, 13),
          data: {
            rows: {
              source: {
                visual: {
                  table: "appointments",
                  filters: [{ column: "status", op: "eq", value: "checked_in" }],
                  sort: [{ by: "checked_in_at" }],
                  limit: 12,
                },
              },
              filters: [{ filter: "clinic", column: "clinic" }],
            },
          },
          config: {
            look: "cards",
            title: "pet_name",
            subtitle: "reason",
            right: "checked_in_at",
            badge: "status",
            rowActions: [
              {
                id: "to-exam",
                label: "To the exam room",
                action: moveVisit("event", "in_exam", "checked_in", "With the vet"),
              },
            ],
          },
          on: opens("visit"),
          layout: { narrow: "stack" },
        },
        {
          id: "hilltop",
          type: "core/text",
          at: at(0, 27, 12, 2),
          config: {
            look: "warning",
            text: "**Hilltop is closed on Saturdays.** A visit booked there for a Saturday needs moving before the day.",
          },
          // Only on weekdays' desk screens of managers: shown to practice managers.
          rules: { seenBy: { groups: MANAGERS } },
          layout: { priority: -2 },
        },
        {
          id: "about",
          type: "core/text",
          title: "About this app",
          at: at(0, 29, 12, 4),
          config: {
            text: ':::tabs\n::::tab{label="For managers"}\nMoney shows what is invoiced and unpaid. **Stock** has the orders waiting for you. Press :term[status]{table=invoices column=status} on an invoice to see what it means.\n::::\n::::tab{label="For the front desk"}\nCheck visits in from **Today**. Booking is done in the Front desk app.\n::::\n:::\n\n:::details{summary="What does a column\'s type mean?"}\n::field{path=table.columns.*.type}\n:::',
          },
        },
      ],
    },

    // ======================================================================
    // Visits
    // ======================================================================
    {
      id: "visits",
      title: "Visits",
      icon: "calendar",
      help: "desk-booking",
      widgets: [
        {
          id: "filters",
          type: "core/filter",
          at: at(0, 0, 12, 2),
          config: {
            reset: true,
            filters: [
              { name: "q", label: "Search visits", type: "search" },
              {
                name: "clinic",
                label: "Clinic",
                type: "choice",
                from: { table: "appointments", column: "clinic" },
              },
              {
                name: "when",
                label: "When",
                type: "date_range",
                default: "last_30_days",
              },
              // A list of choices written here, not read from the table.
              {
                name: "reason",
                label: "Reason",
                type: "choice",
                choices: [...REASONS],
              },
              { name: "vet", label: "Vet", type: "text" },
              { name: "minutes", label: "Booked for (minutes)", type: "number" },
            ],
          },
        },
        {
          id: "charts",
          type: "core/tabs",
          title: "How visits go",
          at: at(0, 2, 12, 12),
          config: {
            look: "pills",
            remember: true,
            opensFirst: "status",
            tabs: [
              { id: "status", title: "Status and reason" },
              { id: "time", title: "Over time" },
              { id: "where", title: "Where and who" },
              { id: "length", title: "How long" },
            ],
          },
        },
        {
          id: "by-status",
          type: "core/chart",
          title: "How visits ended",
          in: { widget: "charts", tab: "status" },
          at: at(0, 0, 5, 10),
          data: visitsBy([{ column: "status" }]),
          config: { mark: "pie", legend: "shown", colors: "theme" },
          on: { pointClick: { steps: [{ do: "rows" }] } },
        },
        {
          id: "by-reason",
          type: "core/chart",
          title: "Why they came",
          in: { widget: "charts", tab: "status" },
          at: at(5, 0, 7, 10),
          data: visitsBy([{ column: "reason" }]),
          config: {
            mark: "bar",
            horizontal: true,
            values: true,
            order: "smallest",
            axisTitles: true,
            colors: "cool",
          },
          // Click a bar and the page narrows to that reason.
          on: { pointClick: { steps: [{ do: "narrow", filter: "reason", from: "reason" }] } },
        },
        {
          id: "per-week",
          type: "core/chart",
          title: "Visits a week",
          in: { widget: "charts", tab: "time" },
          at: at(0, 0, 7, 10),
          data: visitsBy([{ column: "starts_at", bucket: "week" }]),
          config: {
            mark: "area",
            smooth: true,
            points: false,
            fillGaps: true,
            compare: true,
            compareTo: "when",
            legend: "hidden",
            colors: "warm",
          },
        },
        {
          id: "per-day",
          type: "core/chart",
          title: "Visits a day",
          in: { widget: "charts", tab: "time" },
          at: at(7, 0, 5, 10),
          data: visitsBy([{ column: "starts_at", bucket: "day" }], {
            sort: [{ by: "starts_at_day", descending: true }],
            limit: 14,
          }),
          config: { mark: "line", points: true, colors: "mono", axisTitles: true },
        },
        {
          id: "by-clinic-status",
          type: "core/chart",
          title: "Each clinic, by status",
          in: { widget: "charts", tab: "where" },
          at: at(0, 0, 6, 10),
          data: visitsBy([{ column: "clinic" }, { column: "status" }]),
          config: { mark: "bar", bars: "stacked", legend: "shown", values: false },
          on: { pointClick: { steps: [{ do: "narrow", filter: "clinic", from: "clinic" }] } },
        },
        {
          id: "clinic-reason",
          type: "core/chart",
          title: "Clinic by reason",
          in: { widget: "charts", tab: "where" },
          at: at(6, 0, 6, 10),
          data: visitsBy([{ column: "clinic" }, { column: "reason" }]),
          config: { mark: "heatmap", colors: "warm", legend: "auto" },
        },
        {
          id: "scatter",
          type: "core/chart",
          title: "Reasons: how many, and how long",
          subtitle: "Each dot is a reason. Further right is a longer visit.",
          in: { widget: "charts", tab: "length" },
          at: at(0, 0, 6, 10),
          data: {
            rows: {
              source: {
                visual: {
                  table: "appointments",
                  groupBy: [{ column: "reason" }],
                  measures: [
                    { fn: "count", as: "visits" },
                    { fn: "avg", column: "minutes", as: "avg_minutes" },
                  ],
                },
              },
              filters: visitFilters(),
            },
          },
          config: { mark: "scatter", x: "avg_minutes", y: "visits", axisTitles: true },
        },
        {
          id: "workload",
          type: "core/chart",
          title: "Visits for each vet",
          subtitle: "From the saved query reports/vet-workload.",
          in: { widget: "charts", tab: "length" },
          at: at(6, 0, 6, 10),
          // A saved query: its parameters are filled from the page's When range.
          data: {
            rows: {
              source: { query: "reports/vet-workload" },
              filters: [
                { filter: "when", parameter: "from", part: "from" },
                { filter: "when", parameter: "to", part: "to" },
              ],
            },
          },
          config: { mark: "bar", x: "vet", y: "visits", legend: "hidden", order: "biggest" },
        },
        {
          id: "grid",
          type: "core/pivot",
          title: "Clinic by status",
          subtitle: "Press a cell to narrow the page to its clinic.",
          at: at(0, 14, 12, 6),
          data: visitsBy([{ column: "clinic" }, { column: "status" }]),
          config: { shade: true, rowTotals: true, columnTotals: true, format: COUNT },
          on: { cellClick: { steps: [{ do: "narrow", filter: "clinic", from: "clinic" }] } },
          layout: { narrow: "full" },
        },
        {
          id: "vets",
          type: "core/table",
          title: "Vets",
          subtitle: "The same saved query, as a table.",
          at: at(0, 20, 12, 6),
          data: {
            rows: {
              source: { query: "reports/vet-workload" },
              filters: [
                { filter: "when", parameter: "from", part: "from" },
                { filter: "when", parameter: "to", part: "to" },
              ],
            },
          },
          config: {
            rowHeight: "compact",
            columns: [
              { column: "vet" },
              { column: "visits", total: true },
              { column: "finished", total: true },
              { column: "usual_minutes", label: "Usual length", format: PLAIN },
            ],
          },
        },
        {
          id: "every",
          type: "core/table",
          title: "Every visit",
          at: at(0, 26, 12, 12),
          data: {
            rows: {
              source: {
                visual: {
                  table: "appointments",
                  sort: [{ by: "starts_at", descending: true }],
                  limit: 500,
                },
              },
              filters: [
                ...visitFilters(),
                { filter: "reason", column: "reason" },
                { filter: "vet", column: "vet" },
                { filter: "minutes", column: "minutes" },
              ],
            },
          },
          config: {
            groupRows: { column: "starts_at", by: "day", descending: true },
            stripes: true,
            pageSize: 25,
            empty: "No visit matches. Clear a filter to see more.",
            columns: [
              { column: "number" },
              { column: "starts_at", label: "When", sortable: true },
              { column: "clinic" },
              { column: "pet_name", label: "Pet" },
              { column: "vet", phone: false },
              { column: "reason", width: "fixed" },
              {
                column: "minutes",
                label: "Booked for",
                format: COUNT,
                align: "right",
                total: true,
              },
              { column: "status", as: "badge", badges: { ...VISIT_BADGES } },
              { column: "notes", hidden: true },
            ],
            buttons: [
              {
                id: "day-sheet",
                label: "Visit sheet",
                tone: "default",
                action: { steps: [{ do: "open", page: "day-sheet" }] },
              },
            ],
          },
          on: opens("visit"),
        },
      ],
    },

    // ======================================================================
    // Money
    // ======================================================================
    {
      id: "money",
      title: "Money",
      icon: "banknote",
      help: "desk-invoices",
      widgets: [
        {
          id: "filters",
          type: "core/filter",
          at: at(0, 0, 12, 2),
          config: {
            reset: true,
            filters: [
              { name: "q", label: "Search invoices", type: "search" },
              {
                name: "clinic",
                label: "Clinic",
                type: "choice",
                from: { table: "invoices", column: "clinic" },
              },
              { name: "issued", label: "Issued", type: "date_range", default: "last_30_days" },
              {
                name: "status",
                label: "Status",
                type: "choice",
                from: { table: "invoices", column: "status" },
              },
              // The goal is a month's: its own range.
              {
                name: "goal_month",
                label: "Goal month",
                type: "date_range",
                default: "this_month",
              },
            ],
          },
        },
        {
          id: "note",
          type: "core/text",
          at: at(0, 2, 12, 2),
          config: {
            look: "note",
            text: "**In dollars.** A void invoice is left out of every total. Change **Issued** to look at another stretch of time. What is :term[status]{table=invoices column=status}? Press the help button.",
          },
        },
        {
          id: "invoiced",
          type: "core/stat",
          title: "Invoiced",
          at: at(0, 4, 3, 4),
          data: invoiceStat({ fn: "sum", column: "total" }),
          config: {
            format: WHOLE,
            caption: "Issued in the range",
            compare: true,
            compareTo: "issued",
            delta: "percent",
            goodWhen: "up",
            trendBy: "issued_on",
          },
          on: { click: { steps: [{ do: "rows" }] } },
        },
        {
          id: "unpaid",
          type: "core/stat",
          title: "Unpaid",
          at: at(3, 4, 3, 4),
          data: invoiceStat({ fn: "sum", column: "total" }, [
            { column: "paid_at", op: "is_null" },
            NOT_VOID,
          ]),
          config: {
            format: WHOLE,
            caption: "Not yet paid",
            compare: true,
            compareTo: "issued",
            delta: "percent",
            goodWhen: "down",
          },
          on: { click: { steps: [{ do: "rows" }] } },
        },
        {
          id: "average",
          type: "core/stat",
          title: "Average invoice",
          at: at(6, 4, 3, 4),
          data: invoiceStat({ fn: "avg", column: "total" }),
          config: {
            format: DOLLARS,
            compare: true,
            compareTo: "issued",
            delta: "absolute",
            goodWhen: "up",
          },
        },
        {
          id: "goal",
          type: "labs/goal",
          title: "This month",
          at: at(9, 4, 3, 4),
          data: {
            value: {
              source: {
                visual: {
                  table: "invoices",
                  filters: [NOT_VOID],
                  measures: [{ fn: "sum", column: "total", as: "invoiced" }],
                },
              },
              filters: [
                { filter: "clinic", column: "clinic" },
                { filter: "goal_month", column: "issued_on" },
              ],
            },
          },
          config: {
            target: 20000000,
            format: SHORT,
            label: "of a $200k goal",
            percent: true,
            reached: "green",
            bands: true,
            goodWhen: "up",
          },
          layout: { phone: { at: at(0, 0, 12, 3) } },
        },
        // The smaller numbers: each one is a different kind of condition or measure.
        {
          id: "clients-billed",
          type: "core/stat",
          title: "Owners billed",
          at: at(0, 8, 3, 3),
          data: invoiceStat({ fn: "count_distinct", column: "client_code" }),
          config: { format: COUNT, caption: "Different owners in the range" },
        },
        {
          id: "recent",
          type: "core/stat",
          title: "Last 90 days",
          at: at(3, 8, 3, 3),
          data: {
            value: {
              source: {
                visual: {
                  table: "invoices",
                  // "Is in the last…", counted back from today, whatever the range above says.
                  filters: [
                    NOT_VOID,
                    { column: "issued_on", op: "last", value: { count: 90, unit: "day" } },
                  ],
                  measures: [{ fn: "sum", column: "total", as: "value" }],
                },
              },
              filters: [{ filter: "clinic", column: "clinic" }],
            },
          },
          config: { format: SHORT, caption: "Invoiced, whatever the range" },
        },
        {
          id: "mid",
          type: "core/stat",
          title: "Between $50 and $150",
          at: at(6, 8, 3, 3),
          data: invoiceStat({ fn: "count" }, [
            NOT_VOID,
            { column: "total", op: "between", value: [5000, 15000] },
          ]),
          config: { format: COUNT, caption: "Invoices of about the usual size" },
        },
        {
          id: "largest",
          type: "core/stat",
          title: "Largest invoice",
          at: at(9, 8, 3, 3),
          data: invoiceStat({ fn: "max", column: "total" }, [
            NOT_VOID,
            { column: "total", op: "gt", value: 0 },
          ]),
          config: { format: DOLLARS, caption: "The smallest is below" },
          // Billing and managers only: others do not see the figure at all.
          rules: { seenBy: { groups: BILLING } },
          layout: { priority: -1 },
        },
        {
          id: "by-week",
          type: "core/chart",
          title: "Invoiced by week",
          at: at(0, 11, 8, 8),
          data: invoicesBy([{ column: "issued_on", bucket: "week" }]),
          config: {
            mark: "line",
            format: SHORT,
            smooth: true,
            points: true,
            fillGaps: true,
            compare: true,
            compareTo: "issued",
            axisTitles: true,
          },
          on: { pointClick: { steps: [{ do: "rows" }] } },
        },
        {
          id: "by-clinic",
          type: "core/chart",
          title: "By clinic",
          at: at(8, 11, 4, 8),
          data: invoicesBy([{ column: "clinic" }]),
          layout: { narrow: "hide" },
          config: { mark: "bar", format: SHORT, values: true, order: "biggest" },
          on: { pointClick: { steps: [{ do: "narrow", filter: "clinic", from: "clinic" }] } },
        },
        {
          id: "periods",
          type: "core/tabs",
          title: "Over longer periods",
          at: at(0, 19, 12, 8),
          config: {
            look: "underline",
            tabs: [
              { id: "month", title: "By month" },
              { id: "quarter", title: "By quarter" },
              { id: "year", title: "By year" },
              { id: "vet", title: "By vet" },
            ],
            opensFirst: "month",
          },
        },
        {
          id: "month-clinic",
          type: "core/pivot",
          title: "Month by clinic",
          in: { widget: "periods", tab: "month" },
          at: at(0, 0, 12, 6),
          data: {
            rows: {
              source: {
                visual: {
                  table: "invoices",
                  filters: [NOT_VOID],
                  groupBy: [{ column: "issued_on", bucket: "month" }, { column: "clinic" }],
                  measures: [{ fn: "sum", column: "total", as: "invoiced" }],
                },
              },
              filters: [
                { filter: "q", columns: INVOICE_SEARCH },
                { filter: "status", column: "status" },
              ],
            },
          },
          config: { format: DOLLARS, shade: true, rowTotals: true, columnTotals: true },
        },
        {
          id: "quarter-chart",
          type: "core/chart",
          title: "Each quarter",
          in: { widget: "periods", tab: "quarter" },
          at: at(0, 0, 12, 6),
          data: invoicesBy([{ column: "issued_on", bucket: "quarter" }]),
          config: { mark: "bar", format: SHORT, values: true },
        },
        {
          id: "year-table",
          type: "core/table",
          title: "Each year",
          in: { widget: "periods", tab: "year" },
          at: at(0, 0, 12, 6),
          data: {
            rows: {
              source: {
                visual: {
                  table: "invoices",
                  filters: [NOT_VOID],
                  groupBy: [{ column: "issued_on", bucket: "year" }],
                  measures: [
                    { fn: "count", as: "invoices" },
                    { fn: "sum", column: "total", as: "invoiced" },
                    { fn: "min", column: "total", as: "smallest" },
                    { fn: "max", column: "total", as: "largest" },
                  ],
                },
              },
              filters: [{ filter: "clinic", column: "clinic" }],
            },
          },
          config: {
            columns: [
              { column: "issued_on_year", label: "Year", format: PLAIN },
              { column: "invoices", format: COUNT, total: true },
              {
                column: "invoiced",
                label: "Invoiced",
                format: DOLLARS,
                total: true,
                align: "right",
              },
              { column: "smallest", format: DOLLARS, align: "right" },
              { column: "largest", format: DOLLARS, align: "right" },
            ],
          },
        },
        {
          id: "vet-chart",
          type: "core/chart",
          title: "Invoiced for each vet's visits",
          subtitle: "An invoice follows its visit (a join), so the vet is the visit's.",
          in: { widget: "periods", tab: "vet" },
          at: at(0, 0, 12, 6),
          data: {
            rows: {
              source: {
                visual: {
                  table: "invoices",
                  joins: ["appointment"],
                  filters: [NOT_VOID],
                  groupBy: [{ column: "appointment.vet" }],
                  measures: [{ fn: "sum", column: "total", as: "invoiced" }],
                  sort: [{ by: "invoiced", descending: true }],
                  limit: 8,
                },
              },
              filters: invoiceFilters(),
            },
          },
          config: { mark: "bar", horizontal: true, format: SHORT, values: true, order: "biggest" },
        },
        {
          id: "managers",
          type: "core/text",
          at: at(0, 27, 12, 3),
          config: {
            text: ":::alert[For practice managers]{type=info}\nOwners are texted about invoices unpaid for two weeks every Monday morning. Press an invoice to open it. **Mark paid** is for managers and Billing; **Void** is for managers.\n:::",
          },
          rules: { showWhen: [{ user: "in", group: "Practice managers" }] },
        },
        {
          id: "list",
          type: "core/table",
          title: "Invoices",
          at: at(0, 30, 12, 12),
          data: {
            rows: {
              source: {
                visual: { table: "invoices", sort: [{ by: "issued_on", descending: true }] },
              },
              filters: invoiceFilters(),
            },
          },
          config: {
            pageSize: 25,
            select: true,
            columns: [
              { column: "number" },
              { column: "clinic" },
              { column: "client_code", label: "Client" },
              { column: "total", label: "Total", format: DOLLARS, align: "right", total: true },
              { column: "status", as: "badge", badges: { ...INVOICE_BADGES } },
              { column: "issued_on", label: "Issued" },
            ],
            buttons: [
              {
                id: "new-invoice",
                label: "New invoice",
                tone: "primary",
                action: { steps: [{ do: "open", page: "new-invoice" }] },
              },
            ],
            rowActions: [
              { id: "mark-paid", label: "Mark paid", action: markPaid("event") },
              { id: "remind", label: "Text the owner", action: remindOwner("event") },
              {
                id: "edit",
                label: "Edit",
                action: { steps: [{ do: "open", page: "edit-invoice", record: "event" }] },
              },
              { id: "void", label: "Void", tone: "danger", action: voidInvoice("event") },
            ],
          },
          on: opens("invoice"),
        },
      ],
    },

    // ======================================================================
    // Pets and owners
    // ======================================================================
    {
      id: "pets",
      title: "Pets and owners",
      icon: "paw-print",
      widgets: [
        {
          id: "filters",
          type: "core/filter",
          at: at(0, 0, 12, 2),
          config: {
            reset: true,
            filters: [
              { name: "q", label: "Search", type: "search" },
              {
                name: "clinic",
                label: "Clinic",
                type: "choice",
                from: { table: "pets", column: "clinic" },
              },
              {
                name: "species",
                label: "Species",
                type: "choice",
                from: { table: "pets", column: "species" },
              },
            ],
          },
        },
        {
          id: "views",
          type: "core/tabs",
          at: at(0, 2, 12, 14),
          config: {
            look: "underline",
            opensFirst: "pets",
            tabs: [
              { id: "pets", title: "Pets" },
              { id: "owners", title: "Owners" },
              { id: "breeds", title: "Breeds seen" },
            ],
          },
        },
        {
          id: "pet-cards",
          type: "core/list",
          title: "Pets",
          in: { widget: "views", tab: "pets" },
          at: at(0, 0, 8, 13),
          data: {
            rows: {
              source: { visual: { table: "pets", sort: [{ by: "name" }], limit: 60 } },
              filters: [
                { filter: "q", columns: ["name", "breed", "client_code"] },
                { filter: "clinic", column: "clinic" },
                { filter: "species", column: "species" },
              ],
            },
          },
          config: {
            look: "cards",
            title: "name",
            subtitle: "breed",
            right: "clinic",
            badge: "species",
          },
          on: opens("pet"),
        },
        {
          id: "alerts",
          type: "core/list",
          title: "Handle with care",
          subtitle: "Pets with an alert on their record.",
          in: { widget: "views", tab: "pets" },
          at: at(8, 0, 4, 13),
          data: {
            rows: {
              source: {
                visual: {
                  table: "pets",
                  filters: [{ column: "alert", op: "not_null" }],
                  sort: [{ by: "name" }],
                  limit: 20,
                },
              },
              filters: [{ filter: "clinic", column: "clinic" }],
            },
          },
          config: {
            look: "list",
            title: "name",
            subtitle: "alert",
            groupRows: { column: "species" },
          },
          on: opens("pet"),
        },
        {
          id: "owners",
          type: "core/table",
          title: "Owners",
          in: { widget: "views", tab: "owners" },
          at: at(0, 0, 12, 13),
          data: {
            rows: {
              source: { visual: { table: "clients", sort: [{ by: "name" }] } },
              filters: [{ filter: "q", columns: ["name", "code", "email", "phone"] }],
            },
          },
          config: {
            pageSize: 15,
            columns: [
              { column: "code", label: "Client code" },
              { column: "name" },
              { column: "phone" },
              { column: "email", phone: false },
              { column: "home_clinic", label: "Home clinic" },
            ],
          },
          on: opens("client"),
        },
        {
          id: "breeds",
          type: "core/chart",
          title: "Breeds seen",
          subtitle: "Visits by the breed of the pet (a join to pets).",
          in: { widget: "views", tab: "breeds" },
          at: at(0, 0, 12, 13),
          data: {
            rows: {
              source: {
                visual: {
                  table: "appointments",
                  joins: ["pet"],
                  groupBy: [{ column: "pet.breed" }],
                  measures: [{ fn: "count", as: "visits" }],
                  sort: [{ by: "visits", descending: true }],
                  limit: 10,
                },
              },
              filters: [{ filter: "clinic", column: "clinic" }],
            },
          },
          config: { mark: "bar", horizontal: true, values: true, order: "biggest", colors: "cool" },
        },
      ],
    },

    // ======================================================================
    // Stock
    // ======================================================================
    {
      id: "stock",
      title: "Stock",
      icon: "boxes",
      widgets: [
        {
          id: "filters",
          type: "core/filter",
          at: at(0, 0, 12, 2),
          config: {
            reset: true,
            filters: [
              { name: "q", label: "Search stock", type: "search" },
              {
                name: "clinic",
                label: "Clinic",
                type: "choice",
                from: { table: "inventory", column: "clinic" },
              },
            ],
          },
        },
        {
          id: "shelf",
          type: "labs/goal",
          title: "On the shelves",
          subtitle: "Items on hand against the reorder levels, added up.",
          at: at(0, 2, 4, 4),
          data: {
            value: {
              source: {
                visual: {
                  table: "inventory",
                  measures: [
                    { fn: "sum", column: "on_hand", as: "on_hand" },
                    { fn: "sum", column: "reorder_at", as: "reorder_level" },
                  ],
                },
              },
              filters: stockFilters(),
            },
          },
          // The goal is a column of the result, not a fixed amount.
          config: {
            goalFrom: "reorder_level",
            format: COUNT,
            label: "Of the reorder levels",
            percent: true,
            reached: "none",
            goodWhen: "up",
          },
        },
        {
          id: "low",
          type: "core/stat",
          title: "Nearly out",
          at: at(4, 2, 4, 4),
          data: {
            value: {
              source: {
                visual: {
                  table: "inventory",
                  filters: [
                    { column: "reorder_pending", op: "ne", value: true },
                    { column: "on_hand", op: "lte", value: 7 },
                  ],
                  measures: [{ fn: "count", as: "lines" }],
                },
              },
              filters: stockFilters(),
            },
          },
          config: { format: COUNT, caption: "Seven or fewer on the shelf, not yet on order" },
        },
        {
          id: "stock-tools",
          type: "core/actions",
          at: at(8, 2, 4, 2),
          config: {
            place: "bottom-right",
            lineUp: "right",
            showUpTo: 2,
            actions: [
              {
                id: "reorder",
                label: "Reorder",
                tone: "primary",
                icon: "truck",
                action: { steps: [{ do: "open", page: "reorder-stock" }] },
              },
              {
                id: "count",
                label: "Count stock",
                tone: "default",
                icon: "clipboard-list",
                action: { steps: [{ do: "open", page: "count-stock" }] },
              },
            ],
          },
        },
        {
          id: "stock-tip",
          type: "core/text",
          at: at(8, 4, 4, 2),
          config: {
            look: "plain",
            text: "**Reorder** lists the lines running lowest. **Count stock** sets a line to what is on the shelf.",
          },
        },
        {
          id: "queues",
          type: "core/tabs",
          title: "Orders waiting for a manager",
          at: at(0, 6, 12, 12),
          config: {
            look: "pills",
            remember: true,
            opensFirst: "queue",
            tabs: [
              { id: "queue", title: "Queue" },
              { id: "rows", title: "Rows" },
              { id: "cards", title: "Cards" },
            ],
          },
        },
        {
          // A queue: the request opens beside the list, and the next is there after each decision.
          id: "approve-queue",
          type: "core/approvals",
          in: { widget: "queues", tab: "queue" },
          at: at(0, 0, 12, 10),
          data: {
            requests: { source: { approvals: { flows: ["inventory/reorder"], whose: "all" } } },
          },
          config: {
            look: "queue",
            fields: [
              { name: "item" },
              { name: "clinic" },
              { name: "quantity" },
              { name: "total", label: "Order total" },
              { name: "on_hand", label: "On hand" },
            ],
            decided: true,
            askWhy: "rejecting",
            approveLabel: "Approve order",
            rejectLabel: "Reject",
            advance: true,
            empty: "No orders are waiting for a manager.",
          },
        },
        {
          // Only the ones this person may decide; each click opens a window; approving asks first.
          id: "approve-rows",
          type: "core/approvals",
          in: { widget: "queues", tab: "rows" },
          at: at(0, 0, 12, 10),
          data: {
            requests: { source: { approvals: { flows: ["inventory/reorder"], whose: "mine" } } },
          },
          config: {
            look: "rows",
            opens: "modal",
            fields: [
              { name: "item" },
              { name: "clinic" },
              { name: "quantity" },
              { name: "total", label: "Order total" },
              { name: "on_hand", label: "On hand", hidden: true },
            ],
            askWhy: "always",
            confirm: true,
            advance: false,
            decided: false,
            empty: "Nothing is waiting for you.",
          },
        },
        {
          id: "approve-cards",
          type: "core/approvals",
          in: { widget: "queues", tab: "cards" },
          at: at(0, 0, 12, 10),
          data: { requests: { source: { approvals: { whose: "all" } } } },
          config: { look: "cards", opens: "sheet", askWhy: "never", decided: true },
        },
        {
          id: "lines",
          type: "core/table",
          title: "Stock",
          at: at(0, 18, 12, 12),
          data: {
            rows: {
              source: { visual: { table: "inventory", sort: [{ by: "on_hand" }] } },
              filters: stockFilters(),
            },
          },
          config: {
            pageSize: 15,
            stripes: true,
            columns: [
              { column: "item" },
              { column: "clinic" },
              { column: "category" },
              { column: "on_hand", label: "On hand", format: COUNT, align: "right", as: "bar" },
              { column: "reorder_at", label: "Reorder at", format: COUNT, align: "right" },
              {
                column: "unit_cost",
                label: "Unit cost",
                format: DOLLARS,
                align: "right",
                phone: false,
              },
              { column: "reorder_pending", label: "Ordering" },
            ],
            rowActions: [REORDER_LINE, COUNT_LINE],
          },
        },
        {
          id: "by-category",
          type: "core/chart",
          title: "On hand by category",
          at: at(0, 30, 6, 8),
          data: {
            rows: {
              source: {
                visual: {
                  table: "inventory",
                  groupBy: [{ column: "category" }, { column: "clinic" }],
                  measures: [{ fn: "sum", column: "on_hand", as: "on_hand" }],
                },
              },
              filters: stockFilters(),
            },
          },
          config: { mark: "bar", bars: "grouped", legend: "shown", order: "label" },
          layout: { narrow: "stack" },
        },
        {
          id: "category-grid",
          type: "core/pivot",
          title: "Category by clinic",
          at: at(6, 30, 6, 8),
          data: {
            rows: {
              source: {
                visual: {
                  table: "inventory",
                  groupBy: [{ column: "category" }, { column: "clinic" }],
                  measures: [{ fn: "sum", column: "on_hand", as: "on_hand" }],
                },
              },
              filters: [{ filter: "q", columns: STOCK_SEARCH }],
            },
          },
          config: { format: COUNT, shade: true, rowTotals: true, columnTotals: false },
          layout: { narrow: "stack" },
        },
        {
          id: "orders-section",
          type: "core/section",
          title: "Orders to VetSupply",
          subtitle: "What the clinics have asked the supplier for, newest first.",
          at: at(0, 38, 12, 10),
          config: { folds: true, folded: true, look: "plain" },
        },
        {
          id: "orders",
          type: "core/table",
          in: { widget: "orders-section" },
          at: at(0, 0, 12, 9),
          data: {
            rows: {
              source: {
                visual: {
                  table: "purchase_orders",
                  sort: [{ by: "created_at", descending: true }],
                },
              },
              filters: stockFilters(),
            },
          },
          config: {
            pageSize: 10,
            columns: [
              { column: "number" },
              { column: "clinic" },
              { column: "item" },
              { column: "quantity", format: COUNT, align: "right" },
              { column: "total", format: DOLLARS, align: "right", total: true },
              { column: "status" },
            ],
          },
        },
      ],
    },

    // ======================================================================
    // Callbacks
    // ======================================================================
    {
      id: "callbacks",
      title: "Callbacks",
      icon: "inbox",
      widgets: [
        {
          id: "intro",
          type: "core/text",
          at: at(0, 0, 8, 1),
          config: {
            text: "People who asked to register through the public form. Press a row to read it; call them back, then mark it called.",
          },
        },
        {
          id: "add",
          type: "core/button",
          at: at(8, 0, 4, 1),
          config: {
            label: "Add a callback",
            icon: "mail",
            tone: "primary",
            place: "middle-right",
          },
          on: { click: { steps: [{ do: "open", page: "new-callback" }] } },
        },
        {
          id: "queue",
          type: "core/table",
          title: "To call back",
          at: at(0, 1, 7, 12),
          data: {
            rows: {
              source: {
                visual: { table: "registrations", sort: [{ by: "created_at", descending: true }] },
              },
            },
          },
          config: {
            select: true,
            empty: "Nobody is waiting for a call.",
            columns: [
              { column: "name" },
              { column: "pet_name", label: "Pet" },
              { column: "clinic" },
              {
                column: "status",
                as: "badge",
                badges: { new: "attention", "called back": "success", declined: "neutral" },
              },
            ],
            rowActions: [
              {
                id: "called",
                label: "Mark called",
                action: {
                  when: [{ field: "status", of: "event", test: "is_not", value: "called back" }],
                  steps: [
                    { do: "update", record: "event", set: { status: { value: "called back" } } },
                    { do: "message", text: "Marked as called", tone: "success" },
                  ],
                },
              },
              {
                id: "remove",
                label: "Remove",
                tone: "danger",
                action: {
                  runBy: { groups: MANAGERS },
                  confirm: {
                    title: "Remove {name}?",
                    text: "The registration is deleted. This cannot be undone.",
                    button: "Remove",
                  },
                  steps: [
                    { do: "delete", record: "event" },
                    { do: "message", text: "Removed", tone: "info" },
                  ],
                },
              },
            ],
          },
        },
        {
          // The row chosen in the table beside it: nothing until one is.
          id: "chosen",
          type: "core/detail",
          title: "The one chosen",
          at: at(7, 1, 5, 12),
          data: { record: { source: { selected: "queue" } } },
          config: {
            heading: "name",
            status: "status",
            across: 1,
            edit: true,
            fields: [
              { column: "phone", section: "Contact" },
              { column: "email", section: "Contact" },
              { column: "pet_name", label: "Pet", section: "Pet" },
              { column: "species", section: "Pet" },
              { column: "clinic", section: "Pet" },
            ],
            actions: [
              {
                id: "called",
                label: "Mark called",
                tone: "primary",
                icon: "check",
                action: {
                  when: [{ field: "status", of: "event", test: "is_not", value: "called back" }],
                  steps: [
                    { do: "update", record: "event", set: { status: { value: "called back" } } },
                  ],
                  done: "Marked as called",
                },
              },
            ],
          },
        },
      ],
    },

    // ======================================================================
    // Windows, sheets and pages that open on a record
    // ======================================================================
    {
      id: "invoice",
      title: "Invoice",
      kind: "sheet",
      size: "large",
      record: { table: "invoices" },
      widgets: [
        {
          id: "invoice-actions",
          type: "core/actions",
          at: at(0, 0, 12, 1),
          config: {
            lineUp: "left",
            showUpTo: 3,
            actions: [
              {
                id: "mark-paid",
                label: "Mark paid",
                tone: "primary",
                icon: "check",
                action: markPaid("this"),
              },
              {
                id: "remind",
                label: "Text the owner",
                tone: "default",
                icon: "send",
                action: remindOwner("this"),
              },
              {
                id: "edit",
                label: "Edit",
                tone: "default",
                icon: "pencil",
                action: { steps: [{ do: "open", page: "edit-invoice", record: "this" }] },
              },
              {
                id: "void",
                label: "Void",
                tone: "danger",
                icon: "ban",
                action: voidInvoice("this"),
              },
            ],
          },
        },
        {
          id: "unpaid-note",
          type: "core/text",
          at: at(0, 1, 12, 2),
          config: {
            look: "warning",
            text: "**Not paid yet.** The owner is texted when it is two weeks old.",
          },
          rules: {
            showWhen: [
              { record: "exists" },
              { field: "status", of: "this", test: "is", value: "unpaid" },
            ],
          },
        },
        {
          id: "detail",
          type: "core/detail",
          at: at(0, 3, 12, 11),
          data: { record: { source: { record: "this" } } },
          config: {
            heading: "number",
            status: "status",
            statusBadges: { ...INVOICE_BADGES },
            figure: "total",
            across: 2,
            fields: [...INVOICE_FIELDS],
          },
        },
      ],
    },
    {
      id: "new-invoice",
      title: "New invoice",
      kind: "modal",
      size: "medium",
      widgets: [
        {
          id: "form",
          type: "core/form",
          at: at(0, 0, 12, 12),
          data: { record: { source: { visual: { table: "invoices" } } } },
          config: {
            mode: "create",
            fields: [{ column: "number", help: "For example INV-4001." }, ...INVOICE_FORM_FIELDS],
            submitLabel: "Create invoice",
            submit: {
              steps: [
                {
                  do: "create",
                  table: "invoices",
                  set: {
                    ...Object.fromEntries(
                      ["number", ...INVOICE_FORM_FIELDS.map((field) => field.column)].map(
                        (column) => [column, { asked: column }],
                      ),
                    ),
                    status: { value: "unpaid" },
                  },
                },
                { do: "close" },
                { do: "message", text: "Invoice created", tone: "success" },
              ],
            },
          },
        },
      ],
    },
    {
      id: "edit-invoice",
      title: "Edit invoice",
      kind: "modal",
      size: "small",
      record: { table: "invoices" },
      widgets: [
        {
          id: "form",
          type: "core/form",
          at: at(0, 0, 12, 11),
          data: { record: { source: { record: "this" } } },
          config: {
            mode: "edit",
            // An invoice already has its date: only a new one starts with today.
            fields: INVOICE_FORM_FIELDS.map(({ initial: _initial, ...field }: Field) => field),
            submitLabel: "Save",
            submit: {
              steps: [
                {
                  do: "update",
                  record: "this",
                  set: Object.fromEntries(
                    INVOICE_FORM_FIELDS.map((field) => [field.column, { asked: field.column }]),
                  ),
                },
                { do: "close" },
                { do: "message", text: "Invoice saved", tone: "success" },
              ],
            },
          },
        },
      ],
    },
    {
      id: "visit",
      title: "Visit",
      kind: "sheet",
      size: "medium",
      record: { table: "appointments" },
      widgets: [
        {
          id: "visit-actions",
          type: "core/actions",
          at: at(0, 0, 12, 1),
          config: {
            lineUp: "left",
            showUpTo: 3,
            actions: [
              {
                id: "check-in",
                label: "Check in",
                tone: "primary",
                action: moveVisit("this", "checked_in", "booked", "Checked in"),
              },
              {
                id: "to-exam",
                label: "To the exam room",
                tone: "default",
                action: moveVisit("this", "in_exam", "checked_in", "With the vet"),
              },
              {
                id: "finish",
                label: "Finish",
                tone: "default",
                action: moveVisit("this", "done", "in_exam", "Done. The invoice is on its way."),
              },
              {
                id: "close",
                label: "Close",
                tone: "quiet",
                action: { steps: [{ do: "close" }] },
              },
            ],
          },
        },
        {
          id: "detail",
          type: "core/detail",
          at: at(0, 1, 12, 9),
          data: { record: { source: { record: "this" } } },
          config: {
            heading: "pet_name",
            status: "status",
            statusBadges: { ...VISIT_BADGES },
            across: 2,
            fields: [
              { column: "number", label: "Visit", section: "The visit" },
              { column: "starts_at", label: "When", section: "The visit" },
              { column: "clinic", section: "The visit" },
              { column: "vet", section: "The visit" },
              { column: "reason", section: "Why" },
              { column: "client_code", label: "Client", section: "Why" },
              { column: "checked_in_at", label: "Checked in", section: "Why" },
              { column: "notes", section: "Notes" },
            ],
          },
        },
        {
          // Rows related to this one: the same pet's other visits. A condition reads this record.
          id: "earlier",
          type: "core/table",
          title: "This pet's visits",
          at: at(0, 10, 12, 7),
          data: {
            rows: {
              source: {
                visual: {
                  table: "appointments",
                  filters: [
                    { column: "pet", op: "eq", value: { record: "pet" } },
                    { column: "id", op: "ne", value: { record: "id" } },
                  ],
                  sort: [{ by: "starts_at", descending: true }],
                  limit: 10,
                },
              },
            },
          },
          config: {
            rowHeight: "compact",
            empty: "No other visits for this pet.",
            columns: [
              { column: "starts_at", label: "When" },
              { column: "reason" },
              { column: "status", as: "badge", badges: { ...VISIT_BADGES } },
            ],
          },
          on: opens("visit"),
        },
      ],
    },
    {
      id: "client",
      title: "Owner",
      kind: "sheet",
      size: "small",
      record: { table: "clients" },
      widgets: [
        {
          id: "detail",
          type: "core/detail",
          at: at(0, 0, 12, 7),
          data: { record: { source: { record: "this" } } },
          config: {
            heading: "name",
            across: 1,
            fields: [
              { column: "code", label: "Client code" },
              { column: "phone" },
              { column: "email" },
              { column: "home_clinic", label: "Home clinic" },
              { column: "notes" },
            ],
          },
        },
        {
          id: "their-pets",
          type: "core/list",
          title: "Their pets",
          at: at(0, 7, 12, 7),
          data: {
            rows: {
              source: {
                visual: {
                  table: "pets",
                  filters: [{ column: "client_code", op: "eq", value: { record: "code" } }],
                  sort: [{ by: "name" }],
                },
              },
            },
          },
          config: { title: "name", subtitle: "breed", badge: "species" },
          on: opens("pet"),
        },
      ],
    },
    {
      // A page of its own, opened on one pet: it has an address you can share.
      id: "pet",
      title: "Pet",
      kind: "record",
      record: { table: "pets" },
      widgets: [
        {
          id: "book",
          type: "core/button",
          at: at(8, 0, 4, 1),
          config: { label: "Take a visit request", icon: "inbox", tone: "primary", full: true },
          on: { click: { steps: [{ do: "open", page: "request-visit" }] } },
        },
        {
          id: "care",
          type: "core/text",
          at: at(0, 1, 12, 1),
          config: {
            look: "warning",
            text: "**This pet has an alert on its record.** Read it before handling the animal.",
          },
          rules: { showWhen: [{ field: "alert", of: "this", test: "is_not_empty" }] },
        },
        {
          id: "detail",
          type: "core/detail",
          at: at(0, 2, 7, 10),
          data: { record: { source: { record: "this" } } },
          config: {
            heading: "name",
            across: 3,
            edit: true,
            fields: [
              { column: "species", section: "The animal" },
              { column: "breed", section: "The animal" },
              { column: "born", section: "The animal" },
              { column: "weight_lb", label: "Weight (lb)", section: "The animal" },
              { column: "client_code", label: "Owner", section: "Belongs to" },
              { column: "clinic", section: "Belongs to" },
              { column: "alert", section: "Care" },
            ],
          },
        },
        {
          id: "update",
          type: "core/form",
          title: "Update the record",
          at: at(7, 2, 5, 10),
          data: { record: { source: { record: "this" } } },
          config: {
            mode: "edit",
            fields: [
              {
                column: "weight_lb",
                label: "Weight (lb)",
                section: "Weighed today",
                help: "Written to the record when you save.",
                required: true,
              },
              {
                column: "alert",
                label: "Alert for staff",
                section: "Care",
                help: "Something every member of staff should know before handling the animal.",
              },
            ],
            submitLabel: "Save the record",
            submit: {
              steps: [
                {
                  do: "update",
                  record: "this",
                  set: { weight_lb: { asked: "weight_lb" }, alert: { asked: "alert" } },
                },
                { do: "message", text: "Record saved", tone: "success" },
              ],
            },
          },
          layout: { narrow: "stack" },
        },
        {
          id: "history",
          type: "core/table",
          title: "Visits",
          at: at(0, 12, 12, 8),
          data: {
            rows: {
              source: {
                visual: {
                  table: "appointments",
                  filters: [{ column: "pet", op: "eq", value: { record: "id" } }],
                  sort: [{ by: "starts_at", descending: true }],
                },
              },
            },
          },
          config: {
            empty: "This pet has had no visits yet.",
            groupRows: { column: "starts_at", by: "month", descending: true },
            columns: [
              { column: "starts_at", label: "When" },
              { column: "reason" },
              { column: "vet" },
              { column: "status", as: "badge", badges: { ...VISIT_BADGES } },
            ],
          },
          on: opens("visit"),
        },
      ],
    },
    {
      // A modal that fills the window: the whole list of visits.
      id: "day-sheet",
      title: "Visit sheet",
      kind: "modal",
      size: "full",
      widgets: [
        {
          id: "filters",
          type: "core/filter",
          at: at(0, 0, 12, 2),
          config: {
            reset: true,
            filters: [
              {
                name: "clinic",
                label: "Clinic",
                type: "choice",
                from: { table: "appointments", column: "clinic" },
              },
              { name: "day", label: "When", type: "date_range", default: "last_7_days" },
            ],
          },
        },
        {
          id: "sheet",
          type: "core/table",
          at: at(0, 2, 12, 20),
          data: {
            rows: {
              source: { visual: { table: "appointments", sort: [{ by: "starts_at" }] } },
              filters: [
                { filter: "clinic", column: "clinic" },
                { filter: "day", column: "starts_at" },
              ],
            },
          },
          config: {
            pageSize: 50,
            rowHeight: "compact",
            empty: "No visits in this range.",
            columns: [
              { column: "starts_at", label: "When" },
              { column: "clinic" },
              { column: "pet_name", label: "Pet" },
              { column: "species" },
              { column: "vet" },
              { column: "reason" },
              { column: "minutes", label: "Minutes", format: COUNT, align: "right", total: true },
              { column: "status", as: "badge", badges: { ...VISIT_BADGES } },
            ],
          },
          on: opens("visit"),
        },
      ],
    },
    {
      id: "request-visit",
      title: "Take a visit request",
      kind: "modal",
      size: "small",
      widgets: [
        {
          id: "form",
          type: "core/form",
          at: at(0, 0, 12, 10),
          data: { record: { source: { visual: { table: "visit_requests" } } } },
          config: {
            mode: "create",
            fields: [
              { column: "client_code", label: "Client code", section: "Who" },
              { column: "pet_name", label: "Pet", section: "Who" },
              { column: "clinic", section: "Where and when" },
              {
                column: "preferred_on",
                label: "A day that suits",
                section: "Where and when",
                initial: { kind: "today" },
              },
              { column: "reason", section: "Why", required: true },
            ],
            submitLabel: "Save the request",
            submit: {
              steps: [
                {
                  do: "create",
                  table: "visit_requests",
                  set: Object.fromEntries(
                    ["client_code", "pet_name", "clinic", "preferred_on", "reason"].map(
                      (column) => [column, { asked: column }],
                    ),
                  ),
                },
                { do: "close" },
                {
                  do: "message",
                  text: "Request saved. The front desk will book it.",
                  tone: "success",
                },
              ],
            },
          },
        },
      ],
    },
    {
      id: "new-callback",
      title: "Add a callback",
      kind: "modal",
      size: "medium",
      widgets: [
        {
          id: "form",
          type: "core/form",
          at: at(0, 0, 12, 12),
          data: { record: { source: { visual: { table: "registrations" } } } },
          config: {
            mode: "create",
            fields: [
              { column: "name", section: "Who" },
              { column: "phone", section: "Who" },
              { column: "email", section: "Who" },
              { column: "pet_name", label: "Pet", section: "Their pet" },
              { column: "species", section: "Their pet" },
              { column: "clinic", section: "Where" },
              { column: "status", section: "Where", initial: { kind: "value", value: "new" } },
            ],
            submitLabel: "Add to the list",
            submit: {
              steps: [
                {
                  do: "create",
                  table: "registrations",
                  set: Object.fromEntries(
                    ["name", "phone", "email", "pet_name", "species", "clinic", "status"].map(
                      (column) => [column, { asked: column }],
                    ),
                  ),
                },
                { do: "close" },
                { do: "message", text: "Added to the callbacks", tone: "success" },
              ],
            },
          },
        },
      ],
    },
    {
      id: "reorder-stock",
      title: "Reorder stock",
      kind: "modal",
      size: "xlarge",
      widgets: [
        {
          id: "low",
          type: "core/table",
          title: "Running lowest, not yet on order",
          at: at(0, 0, 12, 12),
          data: {
            rows: {
              source: {
                visual: {
                  table: "inventory",
                  filters: [{ column: "reorder_pending", op: "ne", value: true }],
                  sort: [{ by: "on_hand" }],
                  limit: 15,
                },
              },
            },
          },
          config: {
            columns: [
              { column: "clinic" },
              { column: "item" },
              { column: "on_hand", label: "On hand", format: COUNT, align: "right" },
              { column: "reorder_at", label: "Reorder at", format: COUNT, align: "right" },
              { column: "reorder_pending", label: "Ordering" },
            ],
            rowActions: [REORDER_LINE],
          },
        },
      ],
    },
    {
      id: "count-stock",
      title: "Count stock",
      kind: "modal",
      size: "medium",
      widgets: [
        {
          id: "filters",
          type: "core/filter",
          at: at(0, 0, 12, 2),
          config: { filters: [{ name: "q", label: "Search stock", type: "search" }], reset: true },
        },
        {
          id: "shelf",
          type: "core/table",
          at: at(0, 2, 12, 12),
          data: {
            rows: {
              source: { visual: { table: "inventory", sort: [{ by: "item" }] } },
              filters: [{ filter: "q", columns: STOCK_SEARCH }],
            },
          },
          config: {
            pageSize: 25,
            columns: [
              { column: "clinic" },
              { column: "item" },
              { column: "sku" },
              { column: "on_hand", label: "On hand", format: COUNT, align: "right" },
            ],
            rowActions: [COUNT_LINE],
          },
        },
      ],
    },
  ],
});

export const operationsApp = defineApp({
  path: "operations",
  title: "Clinic operations",
  description: "The day at the three clinics, money, pets and owners, stock and callbacks.",
  interface: "screens/operations",
});
