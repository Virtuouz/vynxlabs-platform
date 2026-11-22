import {
  Banknote,
  Boxes,
  Calendar,
  ChartColumn,
  ClipboardList,
  File,
  FileText,
  Folder,
  HeartPulse,
  House,
  Inbox,
  type LucideIcon,
  Mail,
  Package,
  PawPrint,
  Receipt,
  Settings,
  ShoppingCart,
  Stethoscope,
  Truck,
  Users,
  Wallet,
  Wrench,
} from "lucide-react";

/**
 * The icons a page of an app can have beside its title in the menu (`Page.icon`):
 * a curated set, by the name each has in Lucide. The builder offers these, and the
 * served app draws the one named, or none for a name it does not know.
 */
export const PAGE_ICONS: Readonly<Record<string, { label: string; icon: LucideIcon }>> = {
  banknote: { label: "Banknote", icon: Banknote },
  boxes: { label: "Boxes", icon: Boxes },
  calendar: { label: "Calendar", icon: Calendar },
  "chart-column": { label: "Chart", icon: ChartColumn },
  "clipboard-list": { label: "Checklist", icon: ClipboardList },
  file: { label: "File", icon: File },
  "file-text": { label: "Document", icon: FileText },
  folder: { label: "Folder", icon: Folder },
  "heart-pulse": { label: "Health", icon: HeartPulse },
  house: { label: "Home", icon: House },
  inbox: { label: "Inbox", icon: Inbox },
  mail: { label: "Mail", icon: Mail },
  package: { label: "Package", icon: Package },
  "paw-print": { label: "Paw", icon: PawPrint },
  receipt: { label: "Receipt", icon: Receipt },
  settings: { label: "Settings", icon: Settings },
  "shopping-cart": { label: "Cart", icon: ShoppingCart },
  stethoscope: { label: "Stethoscope", icon: Stethoscope },
  truck: { label: "Truck", icon: Truck },
  users: { label: "People", icon: Users },
  wallet: { label: "Wallet", icon: Wallet },
  wrench: { label: "Tools", icon: Wrench },
};

/** The icon a page names, if it is one of the set. */
export const pageIconOf = (name: string | undefined): LucideIcon | undefined =>
  name ? PAGE_ICONS[name]?.icon : undefined;
