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

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

export const navItems: NavItem[] = [
  { label: "Main Dashboard", href: "/", icon: LayoutDashboard },

  { label: "AI Chat UI", href: "/ai-chat", icon: MessageSquare },
  { label: "AI Text Generator", href: "/ai-text", icon: FileText },
  { label: "AI Image Generator", href: "/ai-image", icon: ImageIcon },
  { label: "AI Text to Speech", href: "/ai-speech", icon: Mic },
  { label: "Users List", href: "/users", icon: Users },
  { label: "Profile Settings", href: "/profile", icon: Settings },
  { label: "Subscription", href: "/subscription", icon: CreditCard },
  { label: "History", href: "/history", icon: History },
  { label: "Authentication", href: "/auth", icon: Lock },
];
