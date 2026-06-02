import {
  LayoutDashboard,
  MessageSquare,
  FileText,
  Image as ImageIcon,
  Mic,
  Users,
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

const allNavItems: NavItem[] = [
  { label: "Main Dashboard", href: "/", icon: LayoutDashboard, adminOnly: true },
  { label: "AI Agent", href: "/ai-chat", icon: MessageSquare },
  { label: "AI Text Generator", href: "/ai-text", icon: FileText },
  { label: "AI Image Generator", href: "/ai-image", icon: ImageIcon },
  { label: "AI Text to Speech", href: "/ai-speech", icon: Mic },
  { label: "Users List", href: "/users", icon: Users, adminOnly: true },
  { label: "Profile Settings", href: "/profile", icon: Settings },
  { label: "Subscription", href: "/subscription", icon: CreditCard },
  { label: "History", href: "/history", icon: History },
  { label: "Authentication", href: "/auth", icon: Lock },
];

/** Return only the nav items visible to the given role. */
export function getNavItems(role: UserRole): NavItem[] {
  return allNavItems.filter((item) => !item.adminOnly || role === "admin");
}

/** Full list (used by admin). */
export const navItems = allNavItems;
