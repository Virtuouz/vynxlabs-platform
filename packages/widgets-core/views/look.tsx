import {
  Archive,
  ArrowRight,
  Ban,
  Bell,
  Calendar,
  Check,
  CircleCheck,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Link,
  Lock,
  Mail,
  Pencil,
  Phone,
  Play,
  Plus,
  Printer,
  RefreshCw,
  Send,
  Settings,
  Star,
  Trash2,
  Undo2,
  Upload,
  X,
  Zap,
} from "@volvel/ui/icons";
import type { ComponentType } from "react";

/** The tones a button may have: a quiet one is text only. */
export type Tone = "primary" | "default" | "quiet" | "danger";

export const VARIANT = {
  primary: "primary",
  default: "secondary",
  quiet: "quiet",
  // An outline in red, as the boards draw Void (boards 4 and 17).
  danger: "danger",
} as const;

type IconComponent = ComponentType<{ size?: number; className?: string; "aria-hidden"?: "true" }>;

/** The icons a button may carry, by their kit name (kebab or Pascal case). A name not here draws nothing. */
const ICONS: Record<string, IconComponent> = {
  archive: Archive,
  "arrow-right": ArrowRight,
  ban: Ban,
  bell: Bell,
  calendar: Calendar,
  check: Check,
  "circle-check": CircleCheck,
  copy: Copy,
  download: Download,
  "external-link": ExternalLink,
  eye: Eye,
  "file-text": FileText,
  link: Link,
  lock: Lock,
  mail: Mail,
  pencil: Pencil,
  edit: Pencil,
  phone: Phone,
  play: Play,
  plus: Plus,
  printer: Printer,
  "refresh-cw": RefreshCw,
  send: Send,
  settings: Settings,
  star: Star,
  trash: Trash2,
  "trash-2": Trash2,
  undo: Undo2,
  "undo-2": Undo2,
  upload: Upload,
  x: X,
  zap: Zap,
};

const kebab = (name: string) =>
  name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .trim();

/** The icon of a name, or nothing. Drawn beside a label, so hidden from screen readers. */
export function NamedIcon({ name, size = 16 }: { name: string | undefined; size?: number }) {
  const Icon = name ? ICONS[kebab(name)] : undefined;
  return Icon ? <Icon aria-hidden="true" size={size} className="shrink-0" /> : null;
}

export const PLACES = [
  "top-left",
  "top-center",
  "top-right",
  "middle-left",
  "middle-center",
  "middle-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
] as const;
export type Place = (typeof PLACES)[number];

const VERTICAL = { top: "items-start", middle: "items-center", bottom: "items-end" } as const;
const HORIZONTAL = {
  left: "justify-start",
  center: "justify-center",
  right: "justify-end",
} as const;

/** The two halves of a position, as flex classes: `middle-left` is `items-center justify-start`. Unknown is the default. */
export function placeOf(place: string | undefined): { items: string; justify: string } {
  const [row, column] = (PLACES as readonly string[]).includes(place ?? "")
    ? (place as string).split("-")
    : ["middle", "left"];
  return {
    items: VERTICAL[row as keyof typeof VERTICAL],
    justify: HORIZONTAL[column as keyof typeof HORIZONTAL],
  };
}
