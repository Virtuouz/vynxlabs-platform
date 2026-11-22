import {
  ChartLine,
  ClipboardList,
  Filter,
  Grid3x3,
  Hash,
  List,
  type LucideIcon,
  MousePointerClick,
  PanelRight,
  PanelTop,
  Puzzle,
  Rows3,
  SquareDashed,
  Table,
  Type,
} from "lucide-react";

/** The icons the platform's widgets name, as "On this page" draws them. A pack's own name is a puzzle piece. */
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
};

export const outlineIcon = (name: string | undefined): LucideIcon =>
  (name ? ICONS[name] : undefined) ?? Puzzle;
