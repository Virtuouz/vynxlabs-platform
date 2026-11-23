import { PAGE_ICONS } from "@volvel/ui";
import {
  ChartLine,
  ClipboardCheck,
  ClipboardList,
  Filter,
  Globe,
  Grid3x3,
  Hash,
  List,
  type LucideIcon,
  MousePointerClick,
  PanelRight,
  PanelTop,
  Puzzle,
  Radio,
  Rows3,
  SquareDashed,
  Table,
  Table2,
  Target,
  Type,
} from "lucide-react";

/**
 * The icons the platform's widgets and core steps name, as "On this page" and the
 * flow editor's steps draw them, and then the pages' set (`PAGE_ICONS`). A name
 * outside all of these is a puzzle piece.
 */
const ICONS: Record<string, LucideIcon> = {
  table: Table,
  list: List,
  hash: Hash,
  chart: ChartLine,
  grid: Grid3x3,
  text: Type,
  detail: PanelRight,
  form: ClipboardList,
  button: MousePointerClick,
  section: SquareDashed,
  tabs: PanelTop,
  filter: Filter,
  actions: Rows3,
  approvals: ClipboardCheck,
  target: Target,
  globe: Globe,
  radio: Radio,
  "table-2": Table2,
  ...Object.fromEntries(Object.entries(PAGE_ICONS).map(([name, one]) => [name, one.icon])),
};

export const outlineIcon = (name: string | undefined): LucideIcon =>
  (name ? ICONS[name] : undefined) ?? Puzzle;

/** Whether an icon of this name draws as itself, and not as a puzzle piece. */
export const knownIcon = (name: string | undefined): boolean => Boolean(name && ICONS[name]);

/** The names a person may give a flow step, with a word for each. */
export const STEP_ICONS: { value: string; label: string }[] = [
  { value: "globe", label: "Globe" },
  { value: "radio", label: "Signal" },
  { value: "table-2", label: "Table" },
  ...Object.entries(PAGE_ICONS).map(([value, one]) => ({ value, label: one.label })),
].sort((a, b) => a.label.localeCompare(b.label));
