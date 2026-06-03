import {
  MessageSquare,
  FileText,
  Image as ImageIcon,
  Mic,
  Settings,
  CreditCard,
  History,
  Lock,
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
  { label: "AI Agent", href: "/ai-chat", icon: MessageSquare },
  { label: "AI Text Generator", href: "/ai-text", icon: FileText },
  { label: "AI Image Generator", href: "/ai-image", icon: ImageIcon },
  { label: "AI Text to Speech", href: "/ai-speech", icon: Mic },
  { label: "History", href: "/history", icon: History },
];

/** Profile dropdown items — shown in topbar avatar menu. */
export const profileMenuItems: NavItem[] = [
  { label: "Profile Settings", href: "/profile", icon: Settings },
  { label: "Subscription", href: "/subscription", icon: CreditCard },
  { label: "Authentication", href: "/auth", icon: Lock },
];

/** Return only the nav items visible to the given role. */
export function getNavItems(role: UserRole): NavItem[] {
  return sidebarNavItems.filter((item) => !item.adminOnly || role === "admin");
}

/** Full list (used by topbar mobile drawer). */
export const navItems = sidebarNavItems;
