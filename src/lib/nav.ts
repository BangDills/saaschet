import {
  MessageSquare,
  Settings,
  CreditCard,
  History,
  ClipboardList,
  LayoutDashboard,
  Users,
  BadgeCheck,
  type LucideIcon,
} from "lucide-react";

export type UserRole = "user" | "admin";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** If set, only users with this role see the item. Omit = everyone. */
  adminOnly?: boolean;
};

/** Sidebar nav items — main features only. */
const sidebarNavItems: NavItem[] = [
  { label: "Dashboard Admin", href: "/dashboard", icon: LayoutDashboard, adminOnly: true },
  { label: "Kelola User", href: "/users", icon: Users, adminOnly: true },
  { label: "Pembayaran", href: "/admin/payments", icon: BadgeCheck, adminOnly: true },
  { label: "AI Agent", href: "/ai-chat", icon: MessageSquare },
  { label: "PRD Generator", href: "/prd-generator", icon: ClipboardList },
  // "Pemakaian", not "History": the chat header already has a History
  // (conversations) control — one word must not mean two things.
  { label: "Pemakaian", href: "/history", icon: History },
];

/** Profile dropdown items — shown in topbar avatar menu.
 *  Account settings (name, password, connections) all live on /profile;
 *  the old /auth page redirects there. */
export const profileMenuItems: NavItem[] = [
  { label: "Profil", href: "/profile", icon: Settings },
  { label: "Langganan", href: "/subscription", icon: CreditCard },
];

/** Return only the nav items visible to the given role. */
export function getNavItems(role: UserRole): NavItem[] {
  return sidebarNavItems.filter((item) => !item.adminOnly || role === "admin");
}

/** Full list (used by topbar mobile drawer). */
export const navItems = sidebarNavItems;
